'use strict';
// Temporary public test host: runs the game server on this machine and exposes it through a Cloudflare
// quick tunnel (https://<random>.trycloudflare.com). No account needed; the URL changes every run and
// stops working when you press Ctrl+C. Anyone with the URL can play, so share it only with testers.
//
//   npm run host                 (PORT=8080 and a random dev-menu token by default)
//   DEV_TOKEN=secret npm run host
const {spawn,spawnSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),PORT=Number(process.env.PORT||8080);let CLOUDFLARED=process.env.CLOUDFLARED||'cloudflared';
const DEV_TOKEN=process.env.DEV_TOKEN||crypto.randomBytes(9).toString('hex');
const fail=msg=>{console.error('\n'+msg+'\n');process.exit(1);};

// Inside a GitHub Codespace the codespace script does the same (Cloudflare address plus GitHub's forwarded port).
if(process.env.CODESPACES==='true'){const r=spawnSync('bash',[path.join(root,'scripts','codespace-start.sh')],{cwd:root,stdio:'inherit'});process.exit(r.status??1);}
// cloudflared is installed automatically (Linux and macOS) when it's missing.
if(spawnSync(CLOUDFLARED,['--version'],{stdio:'ignore'}).error&&process.platform!=='win32'){const r=spawnSync('bash',[path.join(root,'scripts','cloudflared.sh')],{encoding:'utf8',stdio:['ignore','pipe','inherit']});if(r.status===0&&r.stdout.trim())CLOUDFLARED=r.stdout.trim();}
if(spawnSync(CLOUDFLARED,['--version'],{stdio:'ignore'}).error)fail(`cloudflared is not installed. Install it, then run this again:
  macOS:    brew install cloudflared
  Windows:  winget install --id Cloudflare.cloudflared
  Linux:    https://github.com/cloudflare/cloudflared/releases (or your package manager)`);
if(!fs.existsSync(path.join(root,'node_modules','ws')))fail('Dependencies are missing. Run:  npm ci');
if(!fs.existsSync(path.join(root,'build','physics.node')))fail('The native physics module is not built. Run:  npm run build:native');

const children=[];const stop=()=>{for(const c of children)try{c.kill('SIGTERM');}catch{}};
process.on('SIGINT',()=>{stop();process.exit(0);});process.on('SIGTERM',()=>{stop();process.exit(0);});process.on('exit',stop);

// The GitHub Pages copy of the client may connect too (its origin is allowed and its link printed).
const pages=(()=>{const r=spawnSync('git',['remote','get-url','origin'],{cwd:root,encoding:'utf8'}),m=String(r.stdout||'').match(/github\.com[:/]([^/]+)\/([^/.\s]+)/);return m?{origin:`https://${m[1].toLowerCase()}.github.io`,path:`/${m[2]}/`}:null;})();
let server=null;
function startServer(url){server=spawn(process.execPath,['server/server.cjs','--port',String(PORT)],{cwd:root,stdio:['ignore','inherit','inherit'],env:{...process.env,HOST:'127.0.0.1',DEV_TOKEN,ALLOWED_ORIGINS:[process.env.ALLOWED_ORIGINS,url,pages?.origin].filter(Boolean).join(',')}});
 children.push(server);server.on('exit',code=>{console.error('Game server stopped (exit '+code+').');stop();process.exit(code||1);});}

// The tunnel opens first (its address is random), then the game server starts, told to accept players arriving through it.
(async()=>{
 const tunnel=spawn(CLOUDFLARED,['tunnel','--no-autoupdate','--url',`http://127.0.0.1:${PORT}`],{stdio:['ignore','pipe','pipe']});children.push(tunnel);
 let shown=false;const watch=chunk=>{const m=!shown&&String(chunk).match(/https:\/\/(?!api\.)[-a-z0-9]+\.trycloudflare\.com/);if(!m)return;shown=true;const url=m[0];startServer(url);
  (async()=>{for(let i=0;;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/health`);if(r.ok)break;}catch{}if(i>50)fail('The game server did not start on port '+PORT+'.');await new Promise(r=>setTimeout(r,200));}
  console.log(`
  ┌─────────────────────────────────────────────────────────────────
  │  Game is live (temporary):  ${url}${pages?`
  │  GitHub Pages link (if Pages is on):  ${pages.origin}${pages.path}?server=${url.replace('https://','')}`:''}
  │
  │  Testers: open the link, choose Connect, then create or join a ship.
  │  Server address (filled in automatically): ${url.replace('https://','wss://')}/play
  │  Dev menu token, for you only:             ${DEV_TOKEN}
  │  Stop hosting: Ctrl+C. The link dies with it, and it changes every run.
  └─────────────────────────────────────────────────────────────────
`);})();};
 tunnel.stdout.on('data',watch);tunnel.stderr.on('data',watch);
 tunnel.on('exit',code=>{console.error('Tunnel closed (exit '+code+').');stop();process.exit(code||1);});
 setTimeout(()=>{if(!shown)console.error('Still waiting for Cloudflare to assign a URL… (check your internet connection)');},20000);
})();
