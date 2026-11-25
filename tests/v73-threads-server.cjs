'use strict';
// v73: the server simulates on several threads (shards). With WORKERS=3 the Freeport, Sparrow I and the Pits are on
// different threads: a crewed ship moving between them keeps its crew (positions, items, selected slot), its cargo and
// its score; both crew members keep getting snapshots and can still act; ships on different threads still see each
// other in the same zone; saves and restarts keep everything; /health reports the threads.
const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{WebSocket}=require('ws');
const root=path.resolve(__dirname,'..');process.chdir(root);
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),PORT=30100+Math.floor(Math.random()*800),DEV='v73-dev-token-1234',dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'fp-v73-'));
const log=[];let srv;const start=()=>{srv=spawn(process.execPath,['server/server.cjs','--port',String(PORT)],{cwd:root,env:{...process.env,DATA_DIR:dataDir,DEV_TOKEN:DEV,WORKERS:'3',SAVE_INTERVAL_MS:'500'}});srv.stderr.on('data',d=>log.push(String(d)));};
const stop=()=>new Promise(res=>{srv.once('exit',res);srv.kill('SIGTERM');});
function client(name,{admin=false,token}={}){return new Promise(res=>{const ws=new WebSocket(`ws://127.0.0.1:${PORT}/play`,{headers:{origin:`http://127.0.0.1:${PORT}`}});const c={name,ws,seq:0,snaps:0,last:null,errors:[],evals:{},closed:false};
 ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='hello')ws.send(JSON.stringify({type:'hello',protocol:1,name,token,devToken:admin?DEV:undefined}));if(m.type==='welcome'){c.token=m.token;c.uid=m.id;res(c);}if(m.type==='joined')c.room=m.room;if(m.type==='rooms')c.rooms=m.rooms;if(m.type==='snapshot'){c.snaps++;c.last=m.state;}if(m.type==='error')c.errors.push(m.message);if(m.type==='evalResult')c.evals[m.id]=m;});
 ws.on('close',()=>c.closed=true);c.send=o=>ws.send(JSON.stringify(o));c.act=(action,x={})=>c.send({type:'action',action,seq:++c.seq,aim:{x:0,y:0},...x});});}
const until=async(f,ms=6000,label='condition')=>{const t=Date.now();while(!f()){if(Date.now()-t>ms)throw Error('Timed out: '+label);await sleep(30);}};
const health=async()=>(await fetch(`http://127.0.0.1:${PORT}/health`)).json();
const iron=st=>st.stacks.filter(s=>s?.type==='iron').reduce((n,s)=>n+s.count,0);
const me=c=>c.last?.crew?.find(m=>m.id===c.last.self?.id);
(async()=>{let ok=false;try{start();await sleep(900);
 const h=await health();assert.equal(h.workers,3,'three worker threads');assert.equal(h.shards.length,3);
 const cap=await client('Cap',{admin:true});cap.send({type:'create',name:'Wanderer'});await until(()=>cap.room&&cap.snaps>2,6000,'create');
 const mate=await client('Mate');mate.send({type:'join',room:cap.room});await until(()=>mate.room===cap.room&&mate.snaps>2,6000,'mate joins');
 cap.act('dev',{op:'give',item:'iron',count:40});await until(()=>cap.last.stacks.some(s=>s?.type==='iron'),3000,'iron given');
 cap.act('select',{slot:cap.last.slots.indexOf('iron')});await sleep(200);const sel=cap.last.self.selected;
 const boxes=JSON.stringify(cap.last.boxes.map(b=>b.materials)),cargo=cap.last.machines.length;
 // Freeport (thread 1) → Sparrow I (thread 2) → Finch II (thread 0) → Freeport.
 for(const zone of ['sparrow','finch2','freeport']){const before=[cap.snaps,mate.snaps],pos=me(mate)?.p;
  cap.act('dev',{op:zone});await until(()=>cap.last.zone===zone&&mate.last.zone===zone,6000,'both see '+zone);
  await until(()=>cap.snaps>before[0]+10&&mate.snaps>before[1]+10,4000,'snapshots continue in '+zone);
  assert.ok(!cap.closed&&!mate.closed&&!cap.errors.length&&!mate.errors.length,'nobody dropped: '+cap.errors.concat(mate.errors));
  assert.equal(cap.last.crew.length,2,'both crew members came along to '+zone);assert.ok(iron(cap.last)===40,'items kept in '+zone);
  assert.equal(cap.last.self.selected,sel,'selected slot kept');assert.equal(JSON.stringify(cap.last.boxes.map(b=>b.materials)),boxes,'cargo kept');assert.equal(cap.last.machines.length,cargo);
  if(pos){const p=me(mate).p;assert.ok(Math.abs(p.x-pos.x)<1.5&&Math.abs(p.y-pos.y)<3,'crew stays where it stood: '+JSON.stringify([pos,p]));}}
 // Still in control after three moves: the mate walks.
 const x0=me(mate).p.x;for(let i=0;i<30;i++){mate.act('input',{keys:{d:true}});await sleep(16);}await until(()=>me(mate).p.x>x0+1,3000,'mate walks after moving threads');
 // A second ship in Sparrow (that thread) sees the first arrive from another thread.
 const other=await client('Other',{admin:true});other.send({type:'create',name:'Watcher'});await until(()=>other.room&&other.snaps>2,6000,'second ship');
 other.act('dev',{op:'sparrow'});cap.act('dev',{op:'sparrow'});await until(()=>other.last.zone==="sparrow"&&cap.last.zone==='sparrow',6000,'both in Sparrow');
 // Live code reaches the ship on its thread: move it next to the first ship.
 other.send({type:'eval',id:7,code:'shipNoclip=true;fly(cap0.x+40,cap0.y);"moved"'.replace(/cap0\.x/,cap.last.position.x).replace(/cap0\.y/,cap.last.position.y)});
 await until(()=>other.evals[7],4000,'live code answered');assert.equal(other.evals[7].result,'"moved"',JSON.stringify(other.evals[7]));
 await until(()=>other.last.others?.some(o=>o.name==='Wanderer')||false,6000,'ships on one zone see each other');
 const hz=await health();assert.ok(hz.zones?.sparrow>=2,'health counts both ships in Sparrow: '+JSON.stringify(hz.zones));
 // A mission started from a ship on one thread is the server's one mission: the mission thread runs it, and every
 // ship sees it.
 cap.act('dev',{op:'mission',zone:'pits'});await until(()=>cap.last.mission?.active==='pits'&&other.last.mission?.active==='pits',4000,'mission everywhere');
 // Score from a bot kill, then a restart: everything comes back.
 cap.act('dev',{op:'killbots',species:'red'});await until(()=>(cap.last.score||0)>0,4000,'score in Sparrow');const score=cap.last.score,room=cap.room,token=cap.token;
 await sleep(800);await stop();start();await sleep(1000);
 const back=await client('Cap',{admin:true,token});back.send({type:'join',room});await until(()=>back.room===room&&back.snaps>2,8000,'rejoin after restart');
 assert.equal(back.last.score,score,'score kept');assert.equal(back.last.zone,'freeport3','reloaded in the Freeport next to Sparrow I');
 assert.equal(JSON.stringify(back.last.boxes.map(b=>b.materials)),boxes,'cargo kept across the restart');
 await stop();const errs=log.join('').split('\n').filter(l=>/failed|crashed|stopped|did not|Error/.test(l));assert.deepEqual(errs,[],'no errors on the server');
 ok=true;console.log('PASS: multithreaded server — ships move between threads with crew, items, cargo and score; one mission for all threads; snapshots and control continue; ships on different threads share zones; saves and restarts keep everything.');
}catch(e){console.error(e);console.error(log.join('').slice(-4000));}finally{srv.kill('SIGTERM');await sleep(300);fs.rmSync(dataDir,{recursive:true,force:true});process.exit(ok?0:1);}})();
