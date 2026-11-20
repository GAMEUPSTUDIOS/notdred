'use strict';
// Smoke test for the built executable (run by the Windows .exe workflow):  node scripts/exe/smoke.cjs <exe> [--tunnel]
// Starts it with its own temporary home, waits for the server, joins a new ship over WebSocket, and with --tunnel also
// waits for the public Cloudflare link and loads the game's /health and page through it. Exits non-zero on failure.
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{WebSocket}=require('ws');
const exe=path.resolve(process.argv[2]),tunnel=process.argv.includes('--tunnel'),PORT=8000+Math.floor(Math.random()*900);
const home=fs.mkdtempSync(path.join(os.tmpdir(),'notdred-smoke-'));let out='';
const child=spawn(exe,[],{env:{...process.env,PORT:String(PORT),NOTDRED_HOME:home,NOTDRED_NO_BROWSER:'1',...(tunnel?{}:{NOTDRED_NO_TUNNEL:'1'})},stdio:['ignore','pipe','pipe']});
child.stdout.on('data',d=>{out+=d;process.stdout.write(d);});child.stderr.on('data',d=>{out+=d;process.stderr.write(d);});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const finish=code=>{try{child.kill();}catch{}setTimeout(()=>{try{fs.rmSync(home,{recursive:true,force:true});}catch{}process.exit(code);},1500);};
(async()=>{try{
 let ok=false;for(let i=0;i<300&&!ok;i++){try{ok=(await fetch(`http://127.0.0.1:${PORT}/health`)).ok;}catch{}if(!ok)await sleep(200);}
 if(!ok)throw Error('server did not answer on port '+PORT);console.log('\nSMOKE: server is up');
 const page=await (await fetch(`http://127.0.0.1:${PORT}/`)).text();if(!/notdred/i.test(page))throw Error('page did not load');console.log('SMOKE: page served');
 await new Promise((res,rej)=>{const ws=new WebSocket(`ws://127.0.0.1:${PORT}/play`,{headers:{origin:`http://127.0.0.1:${PORT}`}});const t=setTimeout(()=>rej(Error('join timed out')),20000);
  ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='hello')ws.send(JSON.stringify({type:'hello',protocol:1,name:'Smoke'}));if(m.type==='welcome')ws.send(JSON.stringify({type:'create',name:'Smoke Test'}));if(m.type==='error')rej(Error(m.message));if(m.type==='snapshot'&&m.state?.crew?.length){clearTimeout(t);ws.close();res();}});ws.on('error',rej);});
 console.log('SMOKE: created and joined a ship (physics running)');
 if(tunnel){let url=null;for(let i=0;i<300&&!url;i++){url=(out.match(/https:\/\/(?!api\.)[-a-z0-9]+\.trycloudflare\.com/)||[])[0];if(!url)await sleep(200);}
  if(!url)throw Error('no public Cloudflare link');console.log('SMOKE: public link '+url);
  let up=false;for(let i=0;i<40&&!up;i++){try{const r=await fetch(url+'/health');up=r.ok;}catch{}if(!up)await sleep(1500);}
  if(!up)throw Error('the public link did not reach the game');console.log('SMOKE: game reachable through the public link');}
 console.log('SMOKE: PASS');finish(0);
}catch(e){console.error('\nSMOKE: FAIL — '+e.message);finish(1);}})();
