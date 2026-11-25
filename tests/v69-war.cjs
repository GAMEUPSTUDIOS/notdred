'use strict';
// v69: PvP wars and interest management. Per combat zone with PvP: damage dealt to other ships, disables (shields
// knocked to 0), kills (a ship towed home critical, credited to the last ship that hit it) and deaths, the kill feed,
// no credit for your own shots, after the target left the zone, or in zones without PvP; the war starts over when the
// zone regenerates; clients get the war only when it changed. Other ships: full detail near you, hull only further out,
// and only a compact minimap entry beyond view range.
const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');process.chdir(root);
const {createRoom}=require('../server/room.cjs'),{ZoneBus}=require('../server/zone-bus.cjs'),era=require('../dist/modules/era.js');
const bus=new ZoneBus();const rooms=[];const mk=(id)=>{const r={id,name:'Ship '+id};r.game=createRoom(null,bus.hooksFor(r));r.game.join(id+'-c',id,true,'captain');r.run=c=>r.game.run(c);rooms.push(r);return r;};
const step=n=>{for(let i=0;i<n;i++){for(const r of rooms)r.game.tick(1/60);bus.step(rooms,1/60);}};
const A=mk('A'),B=mk('B'),C=mk('C');step(10);
const to=(r,z)=>{r.run(`snapshotZone();zone=${JSON.stringify(z)};setupZone(true)`);};
for(const r of [A,B,C])to(r,'sparrow');step(10);
// Park them in open space well apart, outside the caves (positions are only for the range checks).
const place=(r,x,y)=>{r.run(`shipNoclip=true;fly(${x},${y})`);};
place(A,0,0);place(B,60,0);place(C,-60,0);step(5);
const sim=bus.sims.get('sparrow');assert.ok(sim,'Sparrow has a shared world');
const hit=(target,shooter,amount=100)=>sim.run(`hostApi.pvpHit(${JSON.stringify(target.id)},${amount},{x:0,y:0},{x:1,y:0},'ammo',${JSON.stringify(shooter.id)})`);
const war=()=>bus.wars.get('sparrow'),row=r=>war()?.board.get(r.id);

// ---- Damage, then a disable when the shields reach 0.
const hp0=B.run('shipHP');assert.ok(hp0>0);
const res=hit(B,A,100);assert.equal(res.dealt,100,'the hit reports what it took off the shields');assert.equal(res.critical,false);
assert.equal(row(A).damage,100,'damage credited to the shooter');assert.equal(row(B).damage,0);
let n=0;while(B.run('shipHP')>0&&n++<100)hit(B,A,200);
assert.equal(B.run('shipHP'),0,'B is critical');assert.equal(row(A).disables,1,'the hit that took B to 0 is a disable for A');
assert.equal(row(A).damage,hp0,'damage counts only what the shields actually lost');
assert.deepEqual(war().feed.map(f=>[f.kind,f.a,f.b]),[['disable','Ship A','Ship B']]);
// ---- Your own shots never count.
const before=row(B).damage;hit(B,B,100);assert.equal(row(B).damage,before,'own shots give no war credit');
// ---- C fires the last shot; B is towed home critical: C gets the kill, B a death.
hit(B,C,50);B.run("returnToFreeport('critical')");step(2);
assert.equal(B.run('zone'),era.HOME_FREEPORT.sparrow,'B was towed home');
assert.equal(row(C).kills,1,'the last ship to hit B gets the kill');assert.equal(row(A).kills,0);assert.equal(row(B).deaths,1);
assert.deepEqual(war().feed.at(-1),{...war().feed.at(-1),kind:'kill',a:'Ship C',b:'Ship B'});
// ---- A hit, then the target leaves the zone: no credit carried over.
hit(C,A,50);to(C,'freeport');step(3);to(C,'sparrow');place(C,-60,0);step(3);C.run("shipHP=0;returnToFreeport('critical')");step(2);
assert.equal(row(A).kills,0,'no kill credit after the target left the zone');assert.equal(row(C).deaths,1);assert.equal(war().feed.at(-1).kind,'lost');
// ---- Zones without PvP keep no war (Finch I).
to(A,'finch');to(B,'finch');step(5);const fsim=bus.sims.get('finch');assert.equal(fsim.run(`hostApi.pvpHit('B',100,{x:0,y:0},{x:1,y:0},'ammo','A')`),null,'no ship damage in Finch I');assert.ok(!bus.wars.has('finch'));

// ---- Clients get the war text only when it changed; ships outside PvP zones get none.
to(A,'sparrow');to(B,'sparrow');to(C,'sparrow');place(A,0,0);place(B,60,0);place(C,-60,0);step(5);
const ws={};const t1=bus.warFor(A,ws);assert.ok(t1.startsWith(',"war":{'),'first snapshot carries the war');const w1=JSON.parse(t1.slice(7));
assert.equal(w1.zone,'sparrow');assert.ok(w1.board.find(r=>r.name==='Ship C').kills===1);assert.ok(w1.feed.length>=3);
assert.equal(bus.warFor(A,ws),'','unchanged war is not resent');
hit(B,A,10);step(31);assert.ok(bus.warFor(A,ws).startsWith(',"war":'),'damage updates are published (twice a second)');
to(A,'freeport');step(3);assert.equal(bus.warFor(A,ws),',"war":null','leaving the war zone clears it on the client');
to(A,'sparrow');place(A,0,0);step(3);
// ---- A new map is a new war.
bus.regenerate('sparrow');step(2);assert.equal(war().board.size,0,'regeneration starts a new war');assert.equal(war().feed.length,0);

// ---- Interest management. Server pass 1 normally fills these caches; do it here for all three.
for(const r of [A,B,C])place(r,0,0);place(A,0,0);place(B,200,0);place(C,700,0);step(5);
const cache=()=>{for(const r of rooms){r.layoutCache={key:'k-'+r.id,layout:r.game.zone.exteriorLayout()};r.crewCache=r.game.zone.exteriorCrew();r.machinesCache=r.game.zone.exteriorMachines();r.liveCache=r.game.zone.exteriorLive(true);}};cache();
const seen=new Map();let list=bus.others(A,seen);
assert.deepEqual(list.map(o=>o.id),['B'],'only ships within view range come in full');const b0=list[0];assert.ok(b0.layout&&Array.isArray(b0.crew)&&b0.crew.length===1,'a near ship comes with its layout and crew');assert.ok(b0.live,'and what is happening aboard');
const far=bus.far(A);assert.deepEqual(far.map(f=>f[0]),['C'],'ships beyond view range go to the minimap list');assert.equal(far[0][7],'Ship C');assert.ok(far[0][5]>0&&far[0][6]>0,'with their hull size');
list=bus.others(A,seen);assert.ok(!list[0].layout,'the layout is not resent');const second=bus.others(A,seen);assert.ok(!!list[0].crew!==!!second[0].crew,'crew alternate with plain position updates (10 a second)');
// B drifts out past the detail range: hull only, its crew cleared once.
place(B,420,0);step(3);list=bus.others(A,seen);assert.deepEqual(list[0].crew,[],'leaving detail range clears the crew once');list=bus.others(A,seen);assert.equal(list[0].crew,undefined,'then hull only');
// Hysteresis: a ship just past the view range stays listed until it is clearly gone.
place(B,550,0);step(3);assert.equal(bus.others(A,seen).length,1,'kept a little past view range');place(B,620,0);step(3);assert.equal(bus.others(A,seen).length,0,'gone past the keep range');assert.ok(bus.far(A).some(f=>f[0]==='B'));
place(B,100,0);step(3);list=bus.others(A,seen);assert.ok(list[0].layout,'coming back sends the layout again');
// Only ships another ship's players can see need their crew/machines built each pass.
const w=bus.watched([A]);assert.ok(w.has(B)&&!w.has(C)&&!w.has(A),'watched: within view of a crewed ship');
console.log('PASS: PvP wars — damage, disables, kills to the last hitter, deaths, kill feed, no credit for own shots / after leaving / without PvP, new war per map, war sent only when changed; interest management — full detail near, hull only further out, minimap list beyond view range, hysteresis, watched ships.');
process.exit(0);
