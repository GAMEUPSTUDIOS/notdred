'use strict';
// v28 on the server: one shared world per zone (bots, loot, boulders and hulls shared by every ship in it),
// captain/crew/guest ranks, and zone chat.
const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{WebSocket}=require('ws');
const root=path.resolve(__dirname,'..');process.chdir(root);
const {createRoom}=require('../server/room.cjs'),{ZoneBus}=require('../server/zone-bus.cjs'),era=require('../dist/modules/era.js');

// ---- Shared worlds --------------------------------------------------------------------------------------------------
{const bus=new ZoneBus();
 function ship(id,name){const r={id,name};r.game=createRoom(null,bus.hooksFor(r));r.game.join(id+'-crew',name,true,'captain');r.run=c=>r.game.run(c);return r;}
 const A=ship('A','Alpha'),B=ship('B','Bravo'),ships=[A,B];
 const go=(r,z)=>r.game.command(r.id+'-crew',{action:'dev',op:z});
 const step=(n=1)=>{for(let i=0;i<n;i++){for(const r of ships)r.game.tick(1/60);bus.step(ships,1/60);}};
 const place=(r,x,y)=>{r.run(`ship.setTransform(V(${x},${y}),0);ship.setLinearVelocity(V(0,0));zonePlaced=true`);};
 go(A,'finch');go(B,'finch');step(2);const sim=bus.sims.get('finch');
 assert.equal(sim.api.fleet.size,2,'both ships in the one Finch I world');
 assert.equal(A.run('bots.length'),0,'rooms keep no bots of their own');assert.equal(sim.run('bots.length'),era.ZONES.finch.bots.red,'the zone has them');
 // Every ship sees the same bots (one list, from the zone).
 const ba=A.game.snapshot('A-crew').bots,bb=B.game.snapshot('B-crew').bots;assert.equal(ba.length,bb.length);assert.equal(JSON.stringify(ba[0].p),JSON.stringify(bb[0].p),'identical bot positions for both ships');
 // Bots target whichever ship is nearest: park one red bot next to B, far from A, and only B takes fire.
 sim.run('for(const b of allBots())b.fire=999;');const spot=sim.run('(()=>{const g=zoneGrid();const open=[];for(let i=0;i<g.centers.length;i++)if(g.centers[i]){const p=V(g.minX+i%g.width*g.cell,g.minY+Math.floor(i/g.width)*g.cell);if(!nearPortal(p,BOT_RULES.portalKeepout+20)&&!shipOverlapsRock(p))open.push(p);}return open;})()');
 const far=spot.find(p=>spot.some(q=>Math.hypot(q.x-p.x,q.y-p.y)>120&&!spot.some(()=>false)));const other=spot.find(q=>Math.hypot(q.x-far.x,q.y-far.y)>120);
 place(A,far.x,far.y);place(B,other.x,other.y);step(2);
 const hpA=A.run('shipHP'),hpB=B.run('shipHP');sim.run(`{const rb=findBot("red",0);rb.body.setTransform(V(${other.x-14},${other.y}),0);rb.body.setLinearVelocity(V(0,0));rb.fire=0;}`);step(90);
 assert.equal(A.run('shipHP'),hpA,'the far ship is left alone');assert.ok(B.run('shipHP')<hpB,'the near ship is shot');
 // Loot is shared: an item ejected from A floats in the zone and B's hatch can take it.
 place(A,far.x,far.y);place(B,far.x+30,far.y);step(2);
 A.run('addWorldLoot("flux",V(ship.getPosition().x+12,ship.getPosition().y),4,V(0,0))');step(2);assert.ok(sim.run('worldLoot.some(i=>i.type==="flux")'),'loot from A is in the shared world');
 assert.ok(B.game.snapshot('B-crew').zoneData.finch.loot.some(l=>l.type==='flux'),'B sees it');
 const lootAt=sim.run('worldLoot.find(i=>i.type==="flux").body.getPosition()');place(B,lootAt.x+9,lootAt.y);sim.run('for(const i of worldLoot)i.grace=0');step(2);
 B.run('const h=[...terrain.values()].find(t=>t.type==="starter_hatch");h.filterMode="all";h.outputTimer=0;');step(120);
 assert.ok(B.run('items.some(i=>i.type==="flux")')||!sim.run('worldLoot.some(i=>i.type==="flux")'),'B’s hatch took the flux');
 // Hulls are real bodies in one world: one ship can shove another.
 place(A,far.x,far.y);place(B,far.x+13.5,far.y);step(2);const bx0=B.run('ship.getPosition().x');
 for(let i=0;i<90;i++){sim.api.zsForces('A',[{fx:6000,fy:0,px:0,py:0}],[]);sim.api.zsStep(1/60);}step(1);assert.ok(B.run('ship.getPosition().x')>bx0+.5,'A pushed B along');
 // Score goes to the ship whose shot made the kill.
 const sA=A.run('shipScore');sim.run('for(const b of allBots())b.fire=999');A.game.command('A-crew',{action:'dev',op:'killbots',species:'red'});step(1);assert.ok(A.run('shipScore')>sA,'kills credited to the shooter');
 console.log('PASS: shared worlds — both ships in one zone world, one bot list for all, bots target the nearest ship, loot passes between ships, hulls shove each other, kills credited to the shooter.');}

// ---- Real server: ranks and chat -----------------------------------------------------------------------------------------
const fill=(st,prev)=>{if(st.blocks==null)st.blocks=prev?.blocks||[];for(const f of ['terrain','mounts'])if(st[f]==null){st[f]=(prev?.[f]||[]).slice();for(const [i,t] of st[f+'Delta']||[])st[f][i]=t;}return st;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),PORT=22000+Math.floor(Math.random()*900),DEV='v28-dev',dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'fp-v28-'));
const srv=spawn(process.execPath,['server/server.cjs','--port',String(PORT)],{cwd:root,env:{...process.env,DATA_DIR:dataDir,DEV_TOKEN:DEV,SAVE_INTERVAL_MS:'400'}});const log=[];srv.stderr.on('data',d=>log.push(String(d)));
function client(name,admin){return new Promise(res=>{const ws=new WebSocket(`ws://127.0.0.1:${PORT}/play`,{headers:{origin:`http://127.0.0.1:${PORT}`}});const c={ws,seq:0,msgs:[],snaps:[],errors:[],chat:[],notices:[]};
 ws.on('message',raw=>{const m=JSON.parse(raw);c.msgs.push(m);if(m.type==='hello')ws.send(JSON.stringify({type:'hello',protocol:1,name,devToken:admin?DEV:undefined,token:c.token}));if(m.type==='welcome'){c.token=m.token;res(c);}if(m.type==='joined')c.room=m.room;if(m.type==='error')c.errors.push(m.message);if(m.type==='chat')c.chat.push(m);if(m.type==='snapshot'){c.snaps.push(fill(m.state,c.snaps.at(-1)));c.notices.push(...(m.state.notices||[]));}});
 c.send=o=>ws.send(JSON.stringify(o));c.act=(action,x={})=>c.send({type:'action',action,seq:++c.seq,aim:{x:0,y:0},...x});});}
const until=async(f,ms=4000,label='condition')=>{const t=Date.now();while(!f()){if(Date.now()-t>ms)throw Error('Timed out: '+label);await sleep(25);}};
(async()=>{let ok=false;try{await sleep(800);
 const cap=await client('Cap',true),mate=await client('Mate'),far=await client('Far',true);
 cap.send({type:'create',name:'Rank Test'});await until(()=>cap.room);mate.send({type:'join',room:cap.room});await until(()=>mate.snaps.length>1);
 const self=c=>c.snaps.at(-1).self,me=c=>c.snaps.at(-1).crew.find(x=>x.id===self(c).id);
 assert.equal(self(cap).rank,'captain');assert.equal(self(mate).rank,'guest','joiners start as guests');
 // Guests cannot build, take the helm or craft…
 const blocks0=cap.snaps.at(-1).blocks.length;mate.act('remove',{aim:{x:0,y:0}});mate.act('interact');await sleep(300);
 assert.equal(cap.snaps.at(-1).blocks.length,blocks0);assert.equal(self(mate).piloting,false);assert.ok(mate.notices.some(n=>/Guests cannot/.test(n)),'told why');
 // …until the captain makes them crew. Only the captain can set ranks.
 mate.send({type:'rank',crew:self(cap).id,rank:'guest'});await until(()=>mate.errors.some(e=>/Only the captain/.test(e)));
 cap.send({type:'rank',crew:self(mate).id,rank:'crew'});await until(()=>self(mate).rank==='crew',3000,'promoted');assert.equal(me(cap)?.rank??'captain','captain');
 assert.ok(cap.snaps.at(-1).crew.some(c=>c.rank==='crew'),'everyone sees the new rank');
 // The rank is remembered for that player on that ship.
 mate.send({type:'leave'});await sleep(200);mate.snaps.length=0;mate.send({type:'join',room:cap.room});await until(()=>mate.snaps.length>1);assert.equal(self(mate).rank,'crew','rank kept after rejoining');
 // Chat stays aboard the ship (other ships hear it only over a comms station — tests/v45-server.cjs).
 far.send({type:'create',name:'Elsewhere'});await until(()=>far.room);far.act('dev',{op:'finch'});await sleep(300);
 const near=await client('Near');near.send({type:'create',name:'Neighbour'});await until(()=>near.room);await sleep(300);
 cap.send({type:'chat',text:'hello <b>crew</b>'});await until(()=>mate.chat.length>0,3000,'own crew hear it');
 assert.equal(mate.chat[0].text,'hello b crew /b','tags stripped');assert.equal(mate.chat[0].from,'Cap');assert.equal(mate.chat[0].rank,'captain');assert.equal(mate.chat[0].ship,'Rank Test');
 await sleep(300);assert.equal(near.chat.length,0,'another ship in the zone does not');assert.equal(far.chat.length,0,'a ship in another zone does not');
 cap.send({type:'chat',text:'spam'});await until(()=>cap.errors.some(e=>/too fast/.test(e)),2000,'rate limit');
 ok=true;console.log('PASS: real server — guests restricted, captain-only ranks, promotion seen by all and remembered, ship chat (own crew only), sanitized and rate-limited.');
}catch(e){console.error(e);console.error(log.join(''));}finally{srv.kill();await sleep(400);fs.rmSync(dataDir,{recursive:true,force:true,maxRetries:10,retryDelay:100});process.exit(ok?0:1);}})();
