'use strict';
// v45 (real server): the dev token is printed at start-up (made and kept in the data folder when DEV_TOKEN is unset);
// chat stays aboard; a comms station reaches every ship in the zone, and only for someone standing at one.
const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{WebSocket}=require('ws');
const era=require('../dist/modules/era.js');
const root=path.resolve(__dirname,'..');process.chdir(root);
const fill=(st,prev)=>{if(st.blocks==null)st.blocks=prev?.blocks||[];for(const f of ['terrain','mounts'])if(st[f]==null){st[f]=(prev?.[f]||[]).slice();for(const [i,t] of st[f+'Delta']||[])st[f][i]=t;}return st;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),PORT=29000+Math.floor(Math.random()*900),dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'fp-v45-'));
const env={...process.env,DATA_DIR:dataDir};delete env.DEV_TOKEN;
const start=()=>{const p=spawn(process.execPath,['server/server.cjs','--port',String(PORT)],{cwd:root,env});p.out='';p.stdout.on('data',d=>p.out+=d);p.stderr.on('data',d=>log.push(String(d)));return p;};const log=[];let srv=start();
const until=async(f,ms=4000,label='condition')=>{const t=Date.now();while(!(await f())){if(Date.now()-t>ms)throw Error('Timed out: '+label);await sleep(40);}};
function client(name,devToken){return new Promise(res=>{const ws=new WebSocket(`ws://127.0.0.1:${PORT}/play`,{headers:{origin:`http://127.0.0.1:${PORT}`}});const c={name,ws,chat:[],errors:[],snap:null,seq:0};
 ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='hello')ws.send(JSON.stringify({type:'hello',protocol:1,name,devToken}));if(m.type==='welcome'){c.admin=m.admin;res(c);}if(m.type==='joined')c.room=m.room;if(m.type==='chat')c.chat.push(m);if(m.type==='error')c.errors.push(m.message);if(m.type==='snapshot')c.snap=fill(m.state,c.snap);});
 c.send=o=>ws.send(JSON.stringify(o));c.act=(action,extra={})=>c.send({type:'action',action,seq:++c.seq,aim:{x:0,y:0},...extra});});}
(async()=>{let ok=false;try{await until(()=>/Dev token/.test(srv.out),5000,'start-up');
 const token=(srv.out.match(/Dev token[^:]*: (\S+)/)||[])[1];assert.ok(token&&token.length>=8,'dev token printed');assert.equal(fs.readFileSync(path.join(dataDir,'dev-token.txt'),'utf8').trim(),token,'kept in the data folder');
 srv.kill();await sleep(400);srv=start();await until(()=>/Dev token/.test(srv.out),5000,'restart');assert.ok(srv.out.includes(token),'same token after a restart');
 const cap=await client('Cap',token);assert.equal(cap.admin,true,'the printed token opens the dev menu');
 const mate=await client('Mate'),other=await client('Other');
 cap.send({type:'create',name:'Talker'});await until(()=>cap.room&&cap.snap);mate.send({type:'join',room:cap.room});other.send({type:'create',name:'Listener'});await until(()=>mate.snap&&other.snap,4000,'ships');
 // Plain chat: own crew only.
 cap.send({type:'chat',text:'crew only'});await until(()=>mate.chat.length,3000,'crew chat');await sleep(300);assert.equal(other.chat.length,0,'other ships do not hear crew chat');
 // Comms without a station is refused.
 await sleep(700);cap.send({type:'comms',text:'anyone?'});await until(()=>cap.errors.some(e=>/comms station/.test(e)),3000,'needs a station');
 // Build a comms station next to the captain, then talk to the zone through it.
 cap.act('dev',{op:'give',item:'comms',count:1});await until(()=>cap.snap.stacks.some(s=>s?.type==='comms'),3000,'given');
 const s=cap.snap,me=s.crew.find(c=>c.id===s.self.id).p,b=s.bounds,used=new Set();
 for(const k of s.blocks)used.add(k.x+','+k.y);for(const t of s.terrain){const [w,h]=era.MACHINE_SIZE[t.type]||[1,1];for(let dx=0;dx<w;dx++)for(let dy=0;dy<h;dy++)used.add((t.x+dx)+','+(t.y+dy));}
 for(const [dx,dy] of [[0,0],[1,0],[0,-1],[1,-1]])used.add((s.helm.x+dx)+','+(s.helm.y+dy));
 let cell=null,best=1e9;for(let x=b.l+1;x<b.r;x++){const y=b.b-2;if(used.has(x+','+y)||used.has(x+','+(y+1)))continue;const d=Math.hypot(x-me.x,y+.5-me.y);if(d<best){best=d;cell={x,y};}}
 assert.ok(cell&&best<era.COMMS_RANGE,'a free spot beside the captain');
 cap.act('select',{slot:s.stacks.findIndex(x=>x?.type==='comms')});await sleep(150);
 const world={x:s.position.x+cell.x,y:s.position.y+cell.y};cap.act('edit',{aim:world});await until(()=>cap.snap.terrain.some(t=>t.type==='comms'),4000,'comms station built');
 cap.send({type:'comms',text:'hello zone'});await until(()=>other.chat.some(m=>m.comms&&m.text==='hello zone'&&m.ship==='Talker'),3000,'another ship hears comms');
 assert.ok(mate.chat.some(m=>m.comms&&m.text==='hello zone'),'own crew hear it too');
 ok=true;console.log('PASS: dev token printed at start-up and kept across restarts; chat stays aboard; comms needs a station and reaches every ship in the zone.');
 for(const c of [cap,mate,other])c.ws.close();
}catch(e){console.error(e);console.error(log.join(''));}finally{srv.kill();await sleep(400);fs.rmSync(dataDir,{recursive:true,force:true,maxRetries:10,retryDelay:100});process.exit(ok?0:1);}})();
