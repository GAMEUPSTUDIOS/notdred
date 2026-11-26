'use strict';
// Builds the C++ game core (native/core) two ways from the same sources:
//   node scripts/build-core.cjs          build/core.node  — N-API module for the server (g++/clang, or $CXX)
//   node scripts/build-core.cjs --wasm   dist/core.wasm   — WebAssembly for the page (wasi-sdk: $WASI_SDK, or /opt/wasi/*)
// The WebAssembly file is committed, so servers and the Windows build never need wasi-sdk; rebuild it after changing
// the core. Both builds include Box2D 2.4.1 (native/vendor), the same physics engine the server already uses.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');process.chdir(root);
const wasm=process.argv.includes('--wasm');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):e.name.endsWith('.cpp')?[path.join(dir,e.name)]:[]);}
const core=fs.readdirSync('native/core').filter(f=>f.endsWith('.cpp')&&!f.startsWith('bind_')).map(f=>path.join('native/core',f));
const box2d=files('native/vendor/box2d-2.4.1/src');
const inc=['-Inative/vendor','-Inative/core','-Inative/vendor/box2d-2.4.1/include','-Inative/vendor/box2d-2.4.1/src'];
function run(cmd,args){const r=spawnSync(cmd,args,{stdio:'inherit'});if(r.error)throw r.error;if(r.status)process.exit(r.status);}
if(!wasm){
 fs.mkdirSync('build',{recursive:true});
 const args=['-std=c++17','-O2','-shared','-fPIC','-DNAPI_VERSION=8',...inc,...core,'native/core/bind_node.cpp',...box2d,'-o','build/core.node'];
 if(process.platform==='darwin')args.push('-undefined','dynamic_lookup');
 run(process.env.CXX||'g++',args);console.log('Built build/core.node');
}else{
 const sdk=process.env.WASI_SDK||(()=>{try{const d=fs.readdirSync('/opt/wasi').filter(n=>n.startsWith('wasi-sdk')).sort().pop();return d&&path.join('/opt/wasi',d);}catch{return null;}})();
 if(!sdk||!fs.existsSync(path.join(sdk,'bin','clang++'))){console.error('wasi-sdk not found: set WASI_SDK (https://github.com/WebAssembly/wasi-sdk/releases).');process.exit(1);}
 // Objects one by one (Box2D is big), then one link.
 const out='build/core-wasm';fs.mkdirSync(out,{recursive:true});const objs=[];
 const flags=['--target=wasm32-wasip1','-std=c++17','-O2','-fno-exceptions','-DND_NO_EXCEPTIONS','-DJSON_NOEXCEPTION',...inc];
 for(const src of [...core,'native/core/bind_wasm.cpp',...box2d]){const o=path.join(out,src.replace(/[\\/]/g,'_')+'.o');objs.push(o);
  if(fs.existsSync(o)&&fs.statSync(o).mtimeMs>fs.statSync(src).mtimeMs&&!/native[\\/]core/.test(src))continue;run(path.join(sdk,'bin','clang++'),[...flags,'-c',src,'-o',o]);}
 run(path.join(sdk,'bin','clang++'),['--target=wasm32-wasip1','-O2','-mexec-model=reactor','-Wl,--strip-all',...objs,'-o','dist/core.wasm']);
 console.log('Built dist/core.wasm ('+(fs.statSync('dist/core.wasm').size/1024).toFixed(0)+' KB)');
}
