'use strict';
// v36: captains ban (and unban) accounts; crew vote to kick guests (majority of crew and captain aboard).
const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{WebSocket}=require('ws');
const root=path.resolve(__dirname,'..');process.chdir(root);
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),PORT=26000+Math.floor(Math.random()*900),DEV='v36-dev',dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'fp-v36-'));
const srv=spawn(process.execPath,['server/server.cjs','--port',String(PORT)],{cwd:root,env:{...process.env,DATA_DIR:dataDir,DEV_TOKEN:DEV,SAVE_INTERVAL_MS:'300'}});const log=[];srv.stderr.on('data',d=>log.push(String(d)));
function client(name){return new Promise(res=>{const ws=new WebSocket(`ws://127.0.0.1:${PORT}/play`,{headers:{origin:`http://127.0.0.1:${PORT}`}});const c={name,ws,seq:0,snaps:[],errors:[],crew:null,joinedRoom:null};
 ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='hello')ws.send(JSON.stringify({type:'hello',protocol:1,name}));if(m.type==='welcome')res(c);if(m.type==='joined'){c.room=m.room;c.joinedRoom=m.room;}if(m.type==='rooms')c.joinedRoom=null;if(m.type==='crew')c.crew=m;if(m.type==='error')c.errors.push(m.message);if(m.type==='snapshot')c.snaps.push(m.state);});
 c.send=o=>ws.send(JSON.stringify(o));});}
const until=async(f,ms=4000,label='condition')=>{const t=Date.now();while(!f()){if(Date.now()-t>ms)throw Error('Timed out: '+label);await sleep(25);}};
const report=async c=>{c.crew=null;c.send({type:'crew'});await until(()=>c.crew,3000,'report');return c.crew;};
const row=(R,name)=>R.crew.find(x=>x.name===name);
(async()=>{let ok=false;try{await sleep(800);
 const cap=await client('Cap'),a=await client('Ada'),b=await client('Ben'),g=await client('Gus');
 cap.send({type:'create',name:'Strict Ship'});await until(()=>cap.room&&cap.snaps.length>1);
 for(const c of [a,b,g]){c.send({type:'join',room:cap.room});await until(()=>c.snaps.length>1,3000,c.name+' joins');}
 // Only the captain spawns with a wrench; the wrench is not dropped when the captain leaves.
 const hasWrench=c=>(c.snaps.at(-1).stacks||[]).some(x=>x?.type==='wrench');assert.ok(hasWrench(cap),'captain spawns with a wrench');for(const c of [a,b,g])assert.ok(!hasWrench(c),c.name+' (guest) spawns without one');
 cap.send({type:'leave'});await sleep(300);cap.snaps.length=0;cap.send({type:'join',room:cap.room});await until(()=>cap.snaps.length>1,3000,'captain rejoins');await sleep(200);
 assert.ok(hasWrench(cap),'wrench again on rejoin');assert.ok(!(cap.snaps.at(-1).items||[]).some(i=>i.type==='wrench'),'no wrench left lying aboard');
 let R=await report(cap);for(const n of ['Ada','Ben'])cap.send({type:'rank',account:row(R,n).short,rank:'crew'});await until(()=>a.snaps.at(-1).self.rank==='crew'&&b.snaps.at(-1).self.rank==='crew',3000,'promoted');
 a.send({type:'leave'});await sleep(300);a.snaps.length=0;a.send({type:'join',room:cap.room});await until(()=>a.snaps.length>1&&a.snaps.at(-1).self.rank==='crew',3000,'crew rejoins');assert.ok(!hasWrench(a),'crew spawn without a wrench too');
 // Vote kick: 3 crew-or-captain aboard → 2 votes needed. Guests cannot vote; crew cannot be vote-kicked.
 R=await report(a);assert.equal(R.votesNeeded,2);const gus=row(R,'Gus'),ben=row(R,'Ben');
 g.send({type:'votekick',crew:row(await report(g),'Ada').uid});await until(()=>g.errors.some(e=>/Only crew can vote/.test(e)),2000,'guest cannot vote');
 a.send({type:'votekick',crew:ben.uid});await until(()=>a.errors.some(e=>/Only guests/.test(e)),2000,'crew cannot be vote-kicked');
 a.send({type:'votekick',crew:gus.uid,report:true});await until(()=>row(a.crew,'Gus')?.votes===1,2000,'first vote');assert.ok(g.joinedRoom,'one vote is not enough');
 a.send({type:'votekick',crew:gus.uid});await until(()=>a.errors.some(e=>/already voted/.test(e)),2000,'no double votes');
 b.send({type:'votekick',crew:gus.uid});await until(()=>g.errors.some(e=>/vote-kicked/.test(e)),3000,'kicked by vote');assert.equal(g.joinedRoom,null,'Gus is off the ship');
 g.errors.length=0;g.send({type:'join',room:cap.room});await until(()=>g.errors.some(e=>/vote-kicked.*Try again/.test(e)),2000,'cannot rejoin straight away');
 // Ban: the captain bans Ben (aboard) — removed and cannot rejoin; then unbans him.
 R=await report(cap);cap.send({type:'ban',account:row(R,'Ben').short,banned:true,report:true});await until(()=>b.errors.some(e=>/banned/.test(e)),3000,'ban removes');
 assert.equal(row(cap.crew,'Ben').banned,true,'listed as banned');b.errors.length=0;b.send({type:'join',room:cap.room});await until(()=>b.errors.some(e=>/You are banned/.test(e)),2000,'banned cannot join');
 a.send({type:'ban',account:row(R,'Gus').short,banned:true});await until(()=>a.errors.some(e=>/Only the captain can ban/.test(e)),2000,'crew cannot ban');
 // Offline accounts can be banned too (Gus is not aboard).
 cap.send({type:'ban',account:row(R,'Gus').short,banned:true,report:true});await until(()=>row(cap.crew,'Gus')?.banned,2000,'offline ban');
 cap.send({type:'ban',account:row(R,'Ben').short,banned:false,report:true});await until(()=>row(cap.crew,'Ben')?.banned===false,2000,'unban');
 b.send({type:'join',room:cap.room});await until(()=>b.joinedRoom,3000,'unbanned can join');
 const text=(await report(cap)).log.map(e=>e.text).join('\n');for(const t of ['voted to kick','was vote-kicked','banned','unbanned'])assert.ok(text.includes(t),'logged: '+t);
 ok=true;console.log('PASS: only captains spawn with a wrench (not crew or guests); bans and vote kicks — captain bans/unbans (aboard or offline; banned accounts cannot join), crew vote-kick guests by majority (no guest votes, no double votes, crew immune), vote-kicked guests wait 5 minutes, all logged.');
}catch(e){console.error(e);console.error(log.join(''));}finally{srv.kill();await sleep(400);fs.rmSync(dataDir,{recursive:true,force:true,maxRetries:10,retryDelay:100});process.exit(ok?0:1);}})();
