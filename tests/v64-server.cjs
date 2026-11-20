'use strict';
// v64 (real server): quiet abuse limits — message flood (dropped, then disconnected), size cap (except imports and
// live code), host-token lockout after 5 wrong guesses (per address, CF-Connecting-IP behind Cloudflare), join limit.
const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{WebSocket}=require('ws');
const root=path.resolve(__dirname,'..');process.chdir(root);
const PORT=33000+Math.floor(Math.random()*900),dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'fp-v64-'));
const srv=spawn(process.execPath,['server/server.cjs','--port',String(PORT)],{cwd:root,env:{...process.env,DATA_DIR:dataDir,DEV_TOKEN:'v64-secret-token-abc'}});let log='';srv.stdout.on('data',d=>log+=d);srv.stderr.on('data',d=>log+=d);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function client(ip,token){return new Promise((res,rej)=>{const ws=new WebSocket(`ws://127.0.0.1:${PORT}/play`,{headers:{origin:`http://127.0.0.1:${PORT}`,...(ip?{'cf-connecting-ip':ip}:{})}});const msgs=[];ws.msgs=msgs;
 ws.on('message',raw=>{const m=JSON.parse(raw);msgs.push(m);if(m.type==='hello')ws.send(JSON.stringify({type:'hello',protocol:1,name:'T',...(token?{devToken:token}:{})}));if(m.type==='welcome'){ws.welcome=m;res(ws);}});ws.on('error',rej);setTimeout(()=>rej(Error('no welcome')),8000);});}
const isAdmin=async ws=>!!ws.welcome.admin;
(async()=>{let ok=false;try{
 for(let i=0;i<100&&!/listening/.test(log);i++)await sleep(100);
 // Flood: 90 a second pass, then one notice, then a hard flood is disconnected.
 {const ws=await client();let closed=false;ws.on('close',()=>closed=true);for(let i=0;i<120;i++)ws.send(JSON.stringify({type:'ping',t:i}));await sleep(300);
  assert.equal(ws.msgs.filter(m=>m.type==='error'&&/slow down/.test(m.message)).length,1,'one notice when over the limit');assert.ok(!closed,'still connected');
  for(let i=0;i<500;i++)ws.send(JSON.stringify({type:'ping',t:i}));await sleep(500);assert.ok(closed,'a flooding connection is closed');}
 // Size: ordinary messages over 64 KB are refused; imports may be large.
 {const ws=await client();ws.send(JSON.stringify({type:'chat',text:'x'.repeat(70000)}));await sleep(300);assert.ok(ws.msgs.some(m=>m.type==='error'&&/too large/.test(m.message)),'large ordinary message refused');
  ws.send(JSON.stringify({type:'import',name:'Big',data:'x'.repeat(70000)}));await sleep(300);assert.ok(!ws.msgs.slice(-1).some(m=>/too large/.test(m.message||'')),'imports may be large (refused for other reasons, not size)');ws.close();}
 // Host token: right token works; 5 wrong guesses lock that address out (even with the right token), others unaffected.
 {const good=await client('10.0.0.1','v64-secret-token-abc');assert.ok(await isAdmin(good),'the right token gives the dev tools');good.close();
  for(let i=0;i<5;i++){const w=await client('10.0.0.2','wrong-'+i);w.close();}
  const locked=await client('10.0.0.2','v64-secret-token-abc');assert.equal(await isAdmin(locked),false,'locked out after 5 wrong guesses');locked.close();
  const other=await client('10.0.0.3','v64-secret-token-abc');assert.ok(await isAdmin(other),'another address is unaffected');other.close();
  assert.ok(/5 wrong host tokens from 10\.0\.0\.2/.test(log),'the lockout is logged');}
 // Joins: at most 30 a minute.
 {const ws=await client();let refused=0;for(let i=0;i<35;i++){ws.send(JSON.stringify({type:'join',room:'nope'+i}));await sleep(30);}await sleep(200);refused=ws.msgs.filter(m=>m.type==='error'&&/Joining too often/.test(m.message)).length;assert.ok(refused>=4,'joins past 30 a minute are refused ('+refused+')');ws.close();}
 ok=true;console.log('PASS: quiet abuse limits — flood drop and disconnect, 64 KB cap (imports exempt), host-token lockout per address, join limit.');
}catch(e){console.error(e);console.error(log.slice(-1500));}finally{srv.kill();setTimeout(()=>{try{fs.rmSync(dataDir,{recursive:true,force:true});}catch{}process.exit(ok?0:1);},300);}})();
