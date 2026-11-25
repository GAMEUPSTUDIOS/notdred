'use strict';
// v71: one player can have several ships open at once (a browser tab each, same saved login). Opening a ship that is
// already open in another of their windows replaces that window's connection to it; their other ships stay open.
const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{WebSocket}=require('ws');
const root=path.resolve(__dirname,'..');process.chdir(root);
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),PORT=29900+Math.floor(Math.random()*90),dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'fp-v71-'));
const log=[];const srv=spawn(process.execPath,['server/server.cjs','--port',String(PORT)],{cwd:root,env:{...process.env,DATA_DIR:dataDir,DEV_TOKEN:'v71-dev-token-1234'}});srv.stderr.on('data',d=>log.push(String(d)));
function client(name,token){return new Promise(res=>{const ws=new WebSocket(`ws://127.0.0.1:${PORT}/play`,{headers:{origin:`http://127.0.0.1:${PORT}`}});const c={name,ws,snaps:0,errors:[],closed:false};
 ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='hello')ws.send(JSON.stringify({type:'hello',protocol:1,name,token}));if(m.type==='welcome'){c.token=m.token;res(c);}if(m.type==='joined')c.room=m.room;if(m.type==='snapshot')c.snaps++;if(m.type==='error')c.errors.push(m.message);});
 ws.on('close',()=>c.closed=true);c.send=o=>ws.send(JSON.stringify(o));});}
const until=async(f,ms=5000,label='condition')=>{const t=Date.now();while(!f()){if(Date.now()-t>ms)throw Error('Timed out: '+label);await sleep(40);}};
(async()=>{let ok=false;try{await sleep(900);
 const tab1=await client('Alex');tab1.send({type:'create',name:'First'});await until(()=>tab1.room&&tab1.snaps,5000,'first ship');
 const tab2=await client('Alex',tab1.token);tab2.send({type:'create',name:'Second'});await until(()=>tab2.room&&tab2.snaps,5000,'second ship');
 assert.notEqual(tab1.room,tab2.room);const s1=tab1.snaps,s2=tab2.snaps;await sleep(1500);
 assert.ok(!tab1.closed&&!tab2.closed,'both windows stay connected');assert.ok(tab1.snaps-s1>15&&tab2.snaps-s2>15,'both ships keep updating');
 // A third window opens the first ship: it takes over that ship from window 1; window 2 is untouched.
 const tab3=await client('Alex',tab1.token);tab3.send({type:'join',room:tab1.room});await until(()=>tab3.room===tab1.room&&tab3.snaps,5000,'third joins first ship');
 await until(()=>tab1.closed,3000,'window 1 replaced');assert.ok(tab1.errors.some(e=>/another window/.test(e)),'window 1 is told why');
 const s2b=tab2.snaps;await sleep(800);assert.ok(!tab2.closed&&tab2.snaps>s2b,'the other ship stays open');
 // The first ship has one crew member for Alex, not two.
 const list=await (await fetch(`http://127.0.0.1:${PORT}/api/rooms`)).json();const first=list.find(r=>r.id===tab1.room);assert.equal(first.players,1,'one connection per player per ship');
 ok=true;console.log('PASS: several ships open at once for one player; reopening a ship replaces only that window.');
}catch(e){console.error(e);console.error(log.join(''));}finally{srv.kill('SIGTERM');await sleep(300);fs.rmSync(dataDir,{recursive:true,force:true});process.exit(ok?0:1);}})();
