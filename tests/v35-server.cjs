'use strict';
// v35: Manage Ship — Crew Control & Log. The server keeps a per-ship log and remembers everyone who has been aboard
// (short id, name, play time); the captain can set ranks for anyone on the list, online or not, and kick.
const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{WebSocket}=require('ws');
const root=path.resolve(__dirname,'..');process.chdir(root);
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),PORT=25000+Math.floor(Math.random()*900),DEV='v35-dev',dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'fp-v35-'));
const start=()=>spawn(process.execPath,['server/server.cjs','--port',String(PORT)],{cwd:root,env:{...process.env,DATA_DIR:dataDir,DEV_TOKEN:DEV,SAVE_INTERVAL_MS:'300'}});
let srv=start();const log=[];srv.stderr.on('data',d=>log.push(String(d)));
function client(name,admin,token){return new Promise(res=>{const ws=new WebSocket(`ws://127.0.0.1:${PORT}/play`,{headers:{origin:`http://127.0.0.1:${PORT}`}});const c={ws,seq:0,snaps:[],errors:[],crew:null};
 ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='hello')ws.send(JSON.stringify({type:'hello',protocol:1,name,token,devToken:admin?DEV:undefined}));if(m.type==='welcome'){c.token=m.token;res(c);}if(m.type==='joined')c.room=m.room;if(m.type==='crew')c.crew=m;if(m.type==='error')c.errors.push(m.message);if(m.type==='snapshot')c.snaps.push(m.state);});
 c.send=o=>ws.send(JSON.stringify(o));c.act=(action,x={})=>c.send({type:'action',action,seq:++c.seq,aim:{x:0,y:0},...x});});}
const until=async(f,ms=4000,label='condition')=>{const t=Date.now();while(!f()){if(Date.now()-t>ms)throw Error('Timed out: '+label);await sleep(25);}};
const report=async c=>{c.crew=null;c.send({type:'crew'});await until(()=>c.crew,3000,'crew report');return c.crew;};
(async()=>{let ok=false;try{await sleep(800);
 const cap=await client('Cap',true),mate=await client('Mate');
 cap.send({type:'create',name:'Logbook'});await until(()=>cap.room&&cap.snaps.length>1);
 mate.send({type:'join',room:cap.room});await until(()=>mate.snaps.length>1);
 cap.act('dev',{op:'give',item:'iron',count:12});cap.act('interact');await until(()=>cap.snaps.at(-1).self.piloting,3000,'helm');
 cap.act('dev',{op:'finch'});await until(()=>cap.snaps.at(-1).zone==='finch',3000,'finch');await sleep(300);
 await sleep(1100);mate.send({type:'leave'});await sleep(300);
 // Crew list: both accounts, online flag, owner, ranks, play time, inventory of people aboard.
 let R=await report(cap);assert.equal(R.captain,true);const me=R.crew.find(c=>c.you),m=R.crew.find(c=>!c.you);
 assert.ok(me.online&&me.owner&&me.rank==='captain','captain listed as online ship owner');assert.match(me.short,/^#[A-Za-z0-9]{6}$/,'short id');
 assert.ok(m&&!m.online&&m.rank==='guest'&&m.name==='Mate','the mate is remembered after leaving');assert.ok(m.playtime>=1,'play time counted ('+m.playtime+' s)');
 assert.ok(me.inventory.some(i=>i.type==='iron'),'inventory of people aboard');
 // Log: loaded, joined, helm, zone change, left.
 const text=R.log.map(e=>(e.who?e.who.name+' ':'')+e.text).join('\n');
 for(const t of ['loaded the ship.','Cap joined the ship.','Mate joined the ship.','Cap started using helm.','Cap teleported the ship to Finch I.','Mate left the ship.'])assert.ok(text.includes(t),'log has: '+t+'\n'+text);
 assert.ok(R.log.some(e=>e.kind==='time'),'timestamps');
 // Ranks for someone offline, by account; they rejoin as crew. Guests cannot ask for the report's controls.
 cap.send({type:'rank',account:m.short,rank:'crew',report:true});await until(()=>cap.crew?.crew.find(c=>c.short===m.short)?.rank==='crew',3000,'offline promotion');
 mate.snaps.length=0;mate.send({type:'join',room:cap.room});await until(()=>mate.snaps.length>1);assert.equal(mate.snaps.at(-1).self.rank,'crew','rejoins as crew');
 R=await report(mate);assert.equal(R.captain,false,'non-captains see the list without controls');
 mate.send({type:'rank',account:me.short,rank:'guest'});await until(()=>mate.errors.some(e=>/Only the captain/.test(e)),2000,'only captain');
 // Kick from the crew list.
 const mid=(await report(cap)).crew.find(c=>c.short===m.short).uid;cap.send({type:'kick',crew:mid,report:true});await until(()=>mate.errors.some(e=>/removed from the ship/.test(e)),3000,'kicked');
 R=await report(cap);assert.ok(R.log.some(e=>/kicked/.test(e.text)&&/set .* to crew/.test(R.log.map(x=>x.text).join(' '))),'kick and rank change logged');
 // The log and the crew list survive a server restart.
 cap.send({type:'leave'});await sleep(300);srv.kill();await sleep(500);srv=start();srv.stderr.on('data',d=>log.push(String(d)));await sleep(900);
 const again=await client('Cap',true,cap.token);again.send({type:'join',room:cap.room});await until(()=>again.snaps.length>1,4000,'rejoin after restart');
 R=await report(again);assert.ok(R.crew.some(c=>c.name==='Mate'&&c.rank==='crew'),'crew list kept');assert.ok(R.log.some(e=>e.text==='saved the ship.'),'saves logged');assert.ok(R.log.filter(e=>e.text==='joined the ship.'&&e.who?.name==='Cap').length>=2,'log kept across restart');
 ok=true;console.log('PASS: crew control & log — everyone who has been aboard listed (online, owner, rank, play time, inventory), log of loads/saves/joins/leaves/helm/zone/rank/kick, captain sets ranks for offline accounts and kicks, all kept across restarts.');
}catch(e){console.error(e);console.error(log.join(''));}finally{srv.kill();await sleep(400);fs.rmSync(dataDir,{recursive:true,force:true,maxRetries:10,retryDelay:100});process.exit(ok?0:1);}})();
