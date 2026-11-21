'use strict';
// notdred.exe — the all-in-one Windows host. Built by scripts/build-exe.cjs as a Node single executable application:
// Node itself, the game (server + page), the native physics module and cloudflared are all inside the .exe.
// Double-click it and it:
//   1. unpacks the game next to your saves (%LOCALAPPDATA%\notdred\app-<version>, once per version),
//   2. starts the game server (saved ships, ranks and the dev token live in %LOCALAPPDATA%\notdred\data),
//   3. opens a temporary public https link through a Cloudflare quick tunnel (reopened if it drops) and prints it,
//   4. opens the game in your browser (http://localhost:8080).
// Close the window (or press Ctrl+C) to stop hosting. Options (environment variables): PORT, DEV_TOKEN,
// NOTDRED_NO_TUNNEL=1 (no public link), NOTDRED_NO_BROWSER=1, NOTDRED_HOME (where it unpacks and saves),
// NOTDRED_NO_UPDATE=1 (don't look for a newer build), GH_TOKEN (GitHub token for the update check).
// Before any of that it checks the windows-latest release for a newer build and, if there is one, downloads it,
// puts it in place of this .exe and runs it (see update() below).
// Only Node's built-in modules can be used here; the game itself is loaded from the unpacked files.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process'),{createRequire}=require('node:module');
let sea=null;try{sea=require('node:sea');}catch{}
const packed=!!sea?.isSea?.(),win=process.platform==='win32';
const home=process.env.NOTDRED_HOME||path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'.local','share'),'notdred');

// Errors keep the window open (a double-clicked console closes the moment the program ends).
function fatal(msg){console.error('\n  notdred could not start: '+msg+'\n');if(win&&process.stdin.isTTY){console.error('  Press Enter to close this window.');process.stdin.resume();process.stdin.once('data',()=>process.exit(1));}else process.exit(1);}
process.on('uncaughtException',e=>fatal(e?.stack||String(e)));

// The bundle asset: [u32 header length][JSON header {version, files:[{path, offset, size, exec}]}][file bytes].
let bundleBuf=null;function bundleHead(){bundleBuf=bundleBuf||Buffer.from(sea.getRawAsset('bundle'));const n=bundleBuf.readUInt32LE(0);return {head:JSON.parse(bundleBuf.subarray(4,4+n).toString('utf8')),data:4+n};}
function unpack(){const {head,data}=bundleHead(),buf=bundleBuf;
 const dir=path.join(home,'app-'+head.version);
 if(!fs.existsSync(path.join(dir,'.complete'))){console.log('  Unpacking notdred '+head.label+' (first run of this version)…');fs.rmSync(dir,{recursive:true,force:true});
  for(const f of head.files){const p=path.join(dir,...f.path.split('/'));fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,buf.subarray(data+f.offset,data+f.offset+f.size));if(f.exec&&!win)fs.chmodSync(p,0o755);}
  fs.writeFileSync(path.join(dir,'.complete'),head.version);
  // Older versions' unpacked copies are removed (saves are kept separately in data/).
  for(const d of fs.readdirSync(home))if(d.startsWith('app-')&&d!=='app-'+head.version)try{fs.rmSync(path.join(home,d),{recursive:true,force:true});}catch{}}
 return {dir,label:head.label};}

// ---- Updates ---------------------------------------------------------------------------------------------------------
// A public repository needs no token. A private one only answers with a token: GH_TOKEN, the one saved in <home>\github-token.txt,
// the GitHub CLI's (gh auth token), or one pasted here the first time (a fine-grained token with read-only access to
// the repository's Contents). No token, no internet or any error: this copy just runs.
const REPO='GAMEUPSTUDIOS/notdred',API=process.env.NOTDRED_UPDATE_API||'https://api.github.com',ASSET=win?'notdred.exe':'notdred';
const tokenFile=path.join(home,'github-token.txt');
function ask(q){return new Promise(res=>{if(!process.stdin.isTTY)return res('');process.stdout.write(q);process.stdin.resume();process.stdin.setEncoding('utf8');process.stdin.once('data',d=>{process.stdin.pause();res(String(d).trim());});});}
function ghToken(){try{return require('node:child_process').execFileSync('gh',['auth','token'],{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:4000,windowsHide:true}).trim();}catch{return '';}}
async function gh(url,token,ms=8000){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{return await fetch(url,{signal:c.signal,headers:{Accept:'application/vnd.github+json','User-Agent':'notdred-exe',...(token?{Authorization:'Bearer '+token}:{})}});}finally{clearTimeout(t);}}
async function latestRelease(){
 const saved=(()=>{try{return fs.readFileSync(tokenFile,'utf8').trim();}catch{return '';}})();
 // A public repository answers without a token; a private one needs one.
 {const r=await gh(`${API}/repos/${REPO}/releases/tags/windows-latest`,'');if(r.ok)return {release:await r.json(),token:''};}
 for(const token of [process.env.GH_TOKEN||process.env.GITHUB_TOKEN,saved,ghToken()].filter(Boolean)){const r=await gh(`${API}/repos/${REPO}/releases/tags/windows-latest`,token);if(r.ok)return {release:await r.json(),token};if(r.status!==401&&r.status!==403&&r.status!==404)throw Error('GitHub answered '+r.status);if(token===saved)try{fs.rmSync(tokenFile);}catch{}}
 if(!process.stdin.isTTY||fs.existsSync(path.join(home,'no-updates')))return null;
 console.log(`  notdred can update itself each time it starts, but the game's GitHub repository is private, so it needs a
  GitHub token once (it's kept only on this computer, in ${tokenFile}).
  Make one at https://github.com/settings/personal-access-tokens/new — Repository access: Only select repositories,
  ${REPO}; Permissions: Contents, Read-only — then paste it here.`);
 for(let i=0;i<3;i++){const token=await ask('  GitHub token (or press Enter to skip updates on this computer): ');if(!token){if(process.stdin.isTTY){fs.writeFileSync(path.join(home,'no-updates'),'Delete this file to be asked for a GitHub token again.\n');console.log('  OK, no updates. (Delete '+path.join(home,'no-updates')+' to be asked again.)\n');}return null;}
  const r=await gh(`${API}/repos/${REPO}/releases/tags/windows-latest`,token);if(r.ok){fs.writeFileSync(tokenFile,token);console.log('  Token saved.\n');return {release:await r.json(),token};}console.log('  GitHub didn\'t accept that token ('+r.status+'). Check that it can read '+REPO+'.');}
 return null;}
// Returns true when a newer copy was started (this one then just waits for it).
async function update(current){
 if(!packed||process.env.NOTDRED_NO_UPDATE==='1'||!current)return false;
 try{for(const f of [process.execPath+'.old',process.execPath+'.download'])fs.rmSync(f,{force:true});}catch{}
 let found;try{found=await latestRelease();}catch(e){console.log('  Couldn\'t check for updates ('+(e.name==='AbortError'?'no answer from GitHub':e.message)+'); starting this version.\n');return false;}
 if(!found)return false;const {release,token}=found,latest=release.target_commitish||'',asset=(release.assets||[]).find(a=>a.name===ASSET);
 if(!asset||!/^[0-9a-f]{7,40}$/.test(latest)||latest===current){if(asset&&latest===current)console.log('  Up to date ('+current.slice(0,7)+').\n');return false;}
 console.log(`  A newer notdred is out (${latest.slice(0,7)}, this is ${current.slice(0,7)}). Downloading ${(asset.size/1048576).toFixed(0)} MB…`);
 // Downloaded next to this .exe, then swapped in: Windows lets a running program be renamed, not overwritten.
 // If this folder can't be written to, the new copy is kept in <home> instead.
 let target=process.execPath;try{fs.accessSync(path.dirname(target),fs.constants.W_OK);}catch{target=path.join(home,ASSET);}
 const part=target+'.download';
 try{const r=await fetch(`${API}/repos/${REPO}/releases/assets/${asset.id}`,{headers:{Accept:'application/octet-stream','User-Agent':'notdred-exe',...(token?{Authorization:'Bearer '+token}:{})}});if(!r.ok||!r.body)throw Error('GitHub answered '+r.status);
  const out=fs.createWriteStream(part);let got=0,shown=0;for await(const chunk of r.body){got+=chunk.length;if(!out.write(chunk))await new Promise(res=>out.once('drain',res));const pct=Math.floor(got/asset.size*10);if(pct>shown){shown=pct;process.stdout.write('  '+pct*10+'%');}}
  await new Promise((res,rej)=>out.end(e=>e?rej(e):res()));process.stdout.write('\n');if(got!==asset.size)throw Error('download incomplete');
  if(target===process.execPath){fs.renameSync(target,target+'.old');try{fs.renameSync(part,target);}catch(e){fs.renameSync(target+'.old',target);throw e;}}else fs.renameSync(part,target);
  if(!win)fs.chmodSync(target,0o755);}
 catch(e){try{fs.rmSync(part,{force:true});}catch{}console.log('  Update failed ('+e.message+'); starting this version.\n');return false;}
 console.log('  Updated. Starting the new version…\n');
 const c=spawn(target,process.argv.slice(1),{stdio:'inherit',env:{...process.env,NOTDRED_NO_UPDATE:'1'}});
 c.on('error',e=>fatal('the new version would not start: '+e.message));c.on('exit',code=>process.exit(code??0));
 process.on('SIGINT',()=>{});return true;}

fs.mkdirSync(home,{recursive:true});
(async()=>{
if(packed&&await update(bundleHead().head.commit))return;
const app=packed?unpack():{dir:path.resolve(__dirname,'..','..'),label:'dev'};
const PORT=Number(process.env.PORT||8080),DATA=process.env.DATA_DIR||path.join(home,'data');fs.mkdirSync(DATA,{recursive:true});
if(win)process.title='notdred.io server';
console.log(`
  notdred.io ${app.label} — all-in-one host
  Saves: ${DATA}
`);

// The game server, in this process: players arriving through any Cloudflare quick-tunnel link or the GitHub Pages copy
// of the page are allowed.
// It also listens on the home network, so old computers in the house can play in classic mode (Internet Explorer 5/6
// can't use the https Cloudflare link).
Object.assign(process.env,{DATA_DIR:DATA,PORT:String(PORT),HOST:process.env.HOST||'0.0.0.0',ALLOWED_ORIGINS:[process.env.ALLOWED_ORIGINS,'https://*.trycloudflare.com','https://gameupstudios.github.io'].filter(Boolean).join(',')});
const serverFile=path.join(app.dir,'server','server.cjs');
if(!fs.existsSync(serverFile))fatal('the game files are missing from '+app.dir);
process.argv=[process.argv[0],serverFile,'--port',String(PORT)];
const gameRequire=createRequire(serverFile);
process.chdir(app.dir);
gameRequire(serverFile);

// Once the server answers: open the game here, then the public link.
const children=[];const stopAll=()=>{for(const c of children)try{c.kill();}catch{}};process.on('exit',stopAll);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(){for(let i=0;i<150;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/health`);if(r.ok)return true;}catch{}await sleep(200);}return false;}
function openBrowser(url){if(process.env.NOTDRED_NO_BROWSER==='1')return;try{const c=win?spawn('cmd',['/c','start','',url],{detached:true,stdio:'ignore'}):spawn(process.platform==='darwin'?'open':'xdg-open',[url],{detached:true,stdio:'ignore'});c.on('error',()=>{});c.unref();}catch{}}
function cloudflaredPath(){const own=path.join(app.dir,'bin',win?'cloudflared.exe':'cloudflared');return fs.existsSync(own)?own:'cloudflared';}

let links=0,attempt=0;
const lanURLs=()=>{const out=[];for(const list of Object.values(os.networkInterfaces()))for(const a of list||[])if(a.family==='IPv4'&&!a.internal)out.push(`http://${a.address}:${PORT}/classic`);return out;};
function banner(url){const again=links++>0,lan=lanURLs();console.log(`
  ┌─────────────────────────────────────────────────────────────────
  │  ${again?'Reconnected — NEW public link':'Game is live (public, temporary)'}:  ${url}
  │  Share this link. Players choose Connect, then create or join a ship.
  │  The link changes each time notdred starts: players paste their player code
  │  (main menu → Account) to keep their ranks and ships.
  │  On this computer: http://localhost:${PORT}${lan.length?`
  │  Old computers on your home network (classic mode, Internet Explorer 5+): ${lan.join('  or  ')}`:''}
  │  Stop hosting: close this window (or Ctrl+C).
  └─────────────────────────────────────────────────────────────────
`);}
function openTunnel(){const t=spawn(cloudflaredPath(),['tunnel','--no-autoupdate','--url',`http://127.0.0.1:${PORT}`],{stdio:['ignore','pipe','pipe'],windowsHide:true});children.push(t);
 let shown=false;const watch=chunk=>{const m=!shown&&String(chunk).match(/https:\/\/(?!api\.)[-a-z0-9]+\.trycloudflare\.com/);if(!m)return;shown=true;attempt=0;banner(m[0]);};
 t.stdout.on('data',watch);t.stderr.on('data',watch);
 const slow=setTimeout(()=>{if(!shown)console.log('  Still waiting for Cloudflare to hand out a public link… (check this computer\'s internet connection)');},20000);
 let over=false;const retry=(why)=>{if(over)return;over=true;clearTimeout(slow);const i=children.indexOf(t);if(i>=0)children.splice(i,1);const wait=Math.min(60,5*2**Math.min(attempt++,4));console.log(`  Cloudflare tunnel ${why}; trying again in ${wait} s. The game is still running at http://localhost:${PORT}`);setTimeout(openTunnel,wait*1000);};
 t.on('error',e=>retry('could not start ('+e.message+')'));t.on('exit',code=>{if(code!==null||!shown)retry(shown?'dropped':'could not start (exit '+code+')');});}

(async()=>{if(!(await ready()))return fatal(`the game server did not start on port ${PORT} (is another copy already running?)`);
 openBrowser(`http://localhost:${PORT}`);
 if(process.env.NOTDRED_NO_TUNNEL==='1')console.log(`  Public link off (NOTDRED_NO_TUNNEL=1). Playing locally: http://localhost:${PORT}`);else openTunnel();})();
})();
