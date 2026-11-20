'use strict';
// Builds the all-in-one host executable (notdred.exe on Windows) as a Node single executable application:
// a copy of the running Node binary with scripts/exe/main.cjs and one asset — the game files, the native physics module
// and cloudflared — injected into it. Run it on the system you're building for (GitHub Actions does Windows: see
// .github/workflows/windows-exe.yml), after `npm ci` and building the native module.
//
//   node scripts/build-exe.cjs --physics <physics .node> [--cloudflared <cloudflared binary>] [--out <file>]
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');process.chdir(root);
const arg=(name,def)=>{const i=process.argv.indexOf('--'+name);return i>=0?process.argv[i+1]:def;};
const win=process.platform==='win32',out=path.resolve(arg('out',path.join('build',win?'notdred.exe':'notdred'))),physics=arg('physics',path.join('build','physics.node')),cloudflared=arg('cloudflared',null);
if(!fs.existsSync(physics))throw Error('No native physics module at '+physics+' (build it first).');

// What goes in: the page, the server, the two runtime packages, the physics module, cloudflared and package.json.
const files=[];
function walk(dir,skip=()=>false){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(skip(p))continue;if(e.isDirectory())walk(p,skip);else files.push({src:p,path:path.relative(root,p).split(path.sep).join('/')});}}
walk('dist',p=>/source\.zip$/.test(p));walk('server');walk('node_modules/ws');walk('node_modules/fflate');
files.push({src:'package.json',path:'package.json'},{src:physics,path:'build/physics.node'});
if(cloudflared)files.push({src:cloudflared,path:'bin/'+(win?'cloudflared.exe':'cloudflared'),exec:true});
else console.warn('No --cloudflared given: the executable will use a cloudflared on PATH (or have no public link).');

// The bundle: [u32 header length][JSON header][file bytes]. The version is a hash of the contents, so each build
// unpacks into its own folder and an unchanged build reuses the unpacked copy.
let offset=0;const blobs=[],hash=crypto.createHash('sha256');
for(const f of files){const b=fs.readFileSync(f.src);hash.update(f.path).update(b);blobs.push(b);f.offset=offset;f.size=b.length;offset+=b.length;}
const pkg=JSON.parse(fs.readFileSync('package.json','utf8')),sha=(()=>{try{return execFileSync('git',['rev-parse','--short','HEAD'],{encoding:'utf8'}).trim();}catch{return '';}})();
const head=Buffer.from(JSON.stringify({version:hash.digest('hex').slice(0,16),label:'v'+pkg.version+(sha?' ('+sha+')':''),files:files.map(({path,offset,size,exec})=>({path,offset,size,...(exec?{exec:true}:{})}))}));
const len=Buffer.alloc(4);len.writeUInt32LE(head.length);
const work=path.join(root,'build','exe');fs.mkdirSync(work,{recursive:true});
const bundle=path.join(work,'bundle.bin');fs.writeFileSync(bundle,Buffer.concat([len,head,...blobs]));
console.log(`Bundle: ${files.length} files, ${(fs.statSync(bundle).size/1048576).toFixed(1)} MB`);

// Node's single-executable blob, then a copy of node with it injected.
const config=path.join(work,'sea-config.json'),blob=path.join(work,'sea-prep.blob');
fs.writeFileSync(config,JSON.stringify({main:path.join(root,'scripts','exe','main.cjs'),output:blob,disableExperimentalSEAWarning:true,useSnapshot:false,useCodeCache:false,assets:{bundle}}));
execFileSync(process.execPath,['--experimental-sea-config',config],{stdio:'inherit'});
fs.mkdirSync(path.dirname(out),{recursive:true});fs.copyFileSync(process.execPath,out);if(!win)fs.chmodSync(out,0o755);
const postject=['--yes','postject@1.0.0-alpha.6',out,'NODE_SEA_BLOB',blob,'--sentinel-fuse','NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',...(process.platform==='darwin'?['--macho-segment-name','NODE_SEA']:[])];
execFileSync(win?'npx.cmd':'npx',postject,{stdio:'inherit',shell:win});
console.log(`Built ${out} (${(fs.statSync(out).size/1048576).toFixed(1)} MB)`);
