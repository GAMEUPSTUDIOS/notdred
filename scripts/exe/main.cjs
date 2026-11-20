'use strict';
// notdred.exe — the all-in-one Windows host. Built by scripts/build-exe.cjs as a Node single executable application:
// Node itself, the game (server + page), the native physics module and cloudflared are all inside the .exe.
// Double-click it and it:
//   1. unpacks the game next to your saves (%LOCALAPPDATA%\notdred\app-<version>, once per version),
//   2. starts the game server (saved ships, ranks and the dev token live in %LOCALAPPDATA%\notdred\data),
//   3. opens a temporary public https link through a Cloudflare quick tunnel (reopened if it drops) and prints it,
//   4. opens the game in your browser (http://localhost:8080).
// Close the window (or press Ctrl+C) to stop hosting. Options (environment variables): PORT, DEV_TOKEN,
// NOTDRED_NO_TUNNEL=1 (no public link), NOTDRED_NO_BROWSER=1, NOTDRED_HOME (where it unpacks and saves).
// Only Node's built-in modules can be used here; the game itself is loaded from the unpacked files.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process'),{createRequire}=require('node:module');
let sea=null;try{sea=require('node:sea');}catch{}
const packed=!!sea?.isSea?.(),win=process.platform==='win32';
const home=process.env.NOTDRED_HOME||path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'.local','share'),'notdred');

// Errors keep the window open (a double-clicked console closes the moment the program ends).
function fatal(msg){console.error('\n  notdred could not start: '+msg+'\n');if(win&&process.stdin.isTTY){console.error('  Press Enter to close this window.');process.stdin.resume();process.stdin.once('data',()=>process.exit(1));}else process.exit(1);}
process.on('uncaughtException',e=>fatal(e?.stack||String(e)));

// The bundle asset: [u32 header length][JSON header {version, files:[{path, offset, size, exec}]}][file bytes].
function unpack(){const buf=Buffer.from(sea.getRawAsset('bundle')),n=buf.readUInt32LE(0),head=JSON.parse(buf.subarray(4,4+n).toString('utf8')),data=4+n;
 const dir=path.join(home,'app-'+head.version);
 if(!fs.existsSync(path.join(dir,'.complete'))){console.log('  Unpacking notdred '+head.label+' (first run of this version)…');fs.rmSync(dir,{recursive:true,force:true});
  for(const f of head.files){const p=path.join(dir,...f.path.split('/'));fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,buf.subarray(data+f.offset,data+f.offset+f.size));if(f.exec&&!win)fs.chmodSync(p,0o755);}
  fs.writeFileSync(path.join(dir,'.complete'),head.version);
  // Older versions' unpacked copies are removed (saves are kept separately in data/).
  for(const d of fs.readdirSync(home))if(d.startsWith('app-')&&d!=='app-'+head.version)try{fs.rmSync(path.join(home,d),{recursive:true,force:true});}catch{}}
 return {dir,label:head.label};}

fs.mkdirSync(home,{recursive:true});
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
