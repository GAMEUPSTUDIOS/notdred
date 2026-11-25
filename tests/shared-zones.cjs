'use strict';
// Shared zones and PvP (server/zone-bus.cjs), then the real server over WebSockets.
const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{WebSocket}=require('ws');
const root=path.resolve(__dirname,'..');process.chdir(root);
const {createRoom}=require('../server/room.cjs'),{ZoneBus}=require('../server/zone-bus.cjs'),era=require('../dist/modules/era.js');

// ---- Zone bus with real ship simulations -------------------------------------------------------------------
const bus=new ZoneBus();
function ship(id,name){const r={id,name};r.game=createRoom(null,bus.hooksFor(r));r.game.join(id+'-crew',name,true);r.run=c=>r.game.run(c);return r;}
const A=ship('A','Alpha'),B=ship('B','Bravo'),ships=[A,B];
const go=(r,z)=>r.game.command(r.id+'-crew',{action:'dev',op:z});
const step=(n=1,list=ships)=>{for(let i=0;i<n;i++){for(const r of list)r.game.tick(1/60);bus.step(list,1/60);}};
// Clear an arena: no rock or bots between the two ships (in the zone's shared world and in each ship's copy of the
// caves), both parked and at full shields. Ships are placed through their rooms (`zonePlaced` tells the zone).
const clearArena='botsPaused=true;for(const b of [...bots])world.destroyBody(b.body);bots=[];enemyShots=[];shots=[];for(const b of [...boulders])world.destroyBody(b.body);boulders=[];for(const [id,k] of [...rocks])if(Math.abs(k.x)<60&&Math.abs(k.y)<30)removeRock(id,false);rebuildDirtyRockChunks();';
const sim=z=>bus.sims.get(z);
const arena=(z,ax=-20,bx=20)=>{for(const r of ships){go(r,z);r.run(clearArena+'shipHP=shipMaxHP();lastShieldHit=clock;piloting=false;');}step(1);sim(z).run(clearArena);A.run(`ship.setTransform(V(${ax},0),0);ship.setLinearVelocity(V(0,0));zonePlaced=true`);B.run(`ship.setTransform(V(${bx},0),0);ship.setLinearVelocity(V(0,0));zonePlaced=true`);step(2);};
const fire=(type='ammo')=>{A.run(`shots.push({p:V(ship.getPosition().x+9,0),v:V(90,0),life:2,type:'${type}'})`);step(30);};

for(const z of ['finch','finch2','sparrow']){go(A,z);go(B,z);assert.equal(A.run('zoneData[zone].seed||0'),B.run('zoneData[zone].seed||0'));assert.equal(A.run('rocks.size'),B.run('rocks.size'),z+' identical caves');}
arena('sparrow');assert.equal(sim('sparrow').api.fleet.size,2,'both hulls in one shared world');assert.deepEqual([...sim('sparrow').api.fleet.keys()].sort(),['A','B']);
fire();assert.equal(B.run('shipHP'),B.run('shipMaxHP()')-era.AMMO.ammo.damage,'Sparrow: full PvP');assert.equal(A.run('shots.length'),0,'shot stops on the hull');
assert.ok(B.run('notices=[...crew.values()][0].notices||[];notices.some(n=>n.includes("Alpha"))'),'target crew told who is shooting');
const vBefore=B.run('ship.getLinearVelocity().x');fire('punch');assert.ok(B.run('ship.getLinearVelocity().x')>vBefore+1,'punch ammo knocks the target');
arena('finch');fire();assert.equal(B.run('shipHP'),B.run('shipMaxHP()'),'Finch I: no PvP damage');assert.equal(A.run('shots.length'),0,'…but shots still stop on ships');
arena('finch2');fire();assert.equal(B.run('shipHP'),B.run('shipMaxHP()')-era.AMMO.ammo.damage,'Finch II: starter-size ship deals full damage');
A.run('bounds={l:-7,r:7,t:-5,b:4};rebuildShell();rebuildMounts();updateShipMass()');assert.equal(A.run('shipSize()'),150);arena('finch2');fire();
assert.ok(Math.abs(B.run('shipHP')-(B.run('shipMaxHP()')-era.AMMO.ammo.damage*era.pvpMultiplier(150,'finch2')))<1e-6,'Finch II: 150-tile ship deals reduced damage');
A.run('bounds={l:-9,r:9,t:-6,b:6};rebuildShell();rebuildMounts();updateShipMass()');assert.ok(A.run('shipSize()')>=220);arena('finch2');fire();assert.equal(B.run('shipHP'),B.run('shipMaxHP()'),'Finch II: big ship deals nothing');
B.run('bounds={l:-9,r:9,t:-6,b:6};rebuildShell();rebuildMounts();updateShipMass()');A.run('bounds={l:-5,r:5,t:-4,b:3};rebuildShell();rebuildMounts();updateShipMass()');arena('finch2');fire();assert.equal(B.run('shipHP'),B.run('shipMaxHP()')-era.AMMO.ammo.damage,'Finch II: small ships can still hit big ones');
B.run('bounds={l:-5,r:5,t:-4,b:3};rebuildShell();rebuildMounts();updateShipMass()');arena('freeport');fire();assert.equal(B.run('shipHP'),B.run('shipMaxHP()'),'safe zone');
console.log('PASS: one shared world per zone; PvP per zone — Sparrow full, Finch I none, Finch II scaled by shooter size (full ≤110 tiles, none ≥220), safe zones none; punch knockback; hit notices.');

// Ships collide instead of passing through each other.
arena('sparrow');{const p=sim('sparrow').api.zsShip('A');sim('sparrow').api.zsPlaceShip('A',{x:p.x,y:p.y,vx:30,vy:0});}step(150);
const gap=B.run('ship.getPosition().x+shipExtents().l')-A.run('ship.getPosition().x+shipExtents().r');assert.ok(gap>-.6,'hulls do not interpenetrate (gap '+gap.toFixed(2)+')');
// Arrivals avoid ships already there, and exactly stacked hulls separate instead of sliding along together.
go(A,'freeport');go(B,'freeport');step(3);{const box=r=>{const p=r.run('ship.getPosition()'),e=r.run('shipExtents()');return {l:p.x+e.l,r:p.x+e.r,t:p.y+e.t,b:p.y+e.b};},a=box(A),b=box(B);assert.ok(a.r<=b.l+.05||b.r<=a.l+.05||a.b<=b.t+.05||b.b<=a.t+.05,'second arrival does not overlap the first '+JSON.stringify([a,b]));}
arena('sparrow',0,0);A.run('ship.setTransform(V(0,0),0);zonePlaced=true');B.run('ship.setTransform(V(0,0),0);zonePlaced=true');step(240);{const box=r=>{const p=r.run('ship.getPosition()'),e=r.run('shipExtents()');return {l:p.x+e.l,r:p.x+e.r,t:p.y+e.t,b:p.y+e.b};},a=box(A),b=box(B);assert.ok(a.r<=b.l+.4||b.r<=a.l+.4||a.b<=b.t+.4||b.b<=a.t+.4,'stacked hulls push apart '+JSON.stringify([a,b]));}
// Shared mining: rock mined by one ship disappears for everyone in the zone, including ships arriving later.
const rock=A.run('[...rocks.keys()][0]');assert.ok(B.run(`rocks.has(${JSON.stringify(rock)})`));sim('sparrow').run(`mineRock(${JSON.stringify(rock)},1)`);step(1);
assert.equal(B.run(`rocks.has(${JSON.stringify(rock)})`),false,'mined rock removed from every ship');assert.equal(A.run(`rocks.has(${JSON.stringify(rock)})`),false);assert.ok(bus.zones.get('sparrow').mined.has(rock));
const C=ship('C','Charlie');go(C,'sparrow');assert.equal(C.run(`rocks.has(${JSON.stringify(rock)})`),false,'late arrival sees the shared caves');
// Regeneration is zone-wide: 80% cleared → 10-minute timer on every minimap → one new seed for every ship.
const z=bus.zones.get('sparrow');for(let i=0;z.mined.size<z.total*.8;i++)z.mined.add('fake'+i);step(1,[A,B,C]);assert.equal(Math.round(z.regenIn),era.REGEN.delaySeconds);
step(61,[A,B,C]);assert.ok(Math.abs(A.run('zoneData.sparrow.regenIn')-(era.REGEN.delaySeconds-1))<1.1,'countdown reaches the minimap');
z.regenIn=.01;const oldSeed=z.seed;step(1,[A,B,C]);const seed=bus.zones.get('sparrow').seed;assert.notEqual(seed,oldSeed);
for(const r of [A,B,C]){assert.equal(r.run('zoneData.sparrow.seed'),seed);assert.equal(r.run('zoneData.sparrow.mined.length'),0);}assert.equal(A.run('rocks.size'),C.run('rocks.size'));
// A crew's dev "regenerate" asks the bus instead of rerolling just its own copy.
A.game.command('A-crew',{action:'dev',op:'regen'});step(1,[A,B,C]);const seed2=bus.zones.get('sparrow').seed;assert.notEqual(seed2,seed);assert.equal(B.run('zoneData.sparrow.seed'),seed2);
// Scheduled 3-hour reset: one new seed for every ship in the zone; the timer reaches each minimap and
// survives a server restart (zones.json).
{const zz=bus.zones.get('sparrow');assert.ok(zz.resetIn>era.ZONE_RESET_SECONDS-120);step(61,[A,B,C]);assert.ok(Math.abs(A.run('zoneData.sparrow.resetIn')-zz.resetIn)<1.1,'reset timer on the minimap');
 zz.resetIn=.01;const before=zz.seed;step(1,[A,B,C]);const after=bus.zones.get('sparrow');assert.notEqual(after.seed,before);for(const r of [A,B,C])assert.equal(r.run('zoneData.sparrow.seed'),after.seed);assert.ok(after.resetIn>era.ZONE_RESET_SECONDS-1,'next cycle');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fp-zones-'));const b1=new ZoneBus({dataDir:dir});b1.zone('finch').resetIn=1234;b1.dirty=true;b1.save();assert.equal(Math.round(new ZoneBus({dataDir:dir}).zone('finch').resetIn),1234,'remaining time survives a restart');fs.rmSync(dir,{recursive:true,force:true});}
for(const r of [A,B,C])r.game.dispose();
console.log('PASS: hull collisions, shared mining (incl. late arrivals), zone-wide regeneration countdown and seed, 3-hour scheduled reset (minimap timer, persisted), regeneration requests routed through the zone.');

// ---- Real server over WebSockets ---------------------------------------------------------------------------
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),PORT=19000+Math.floor(Math.random()*900),DEV='shared-zones-dev',dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'fp-shared-'));
const srv=spawn(process.execPath,['server/server.cjs','--port',String(PORT)],{cwd:root,env:{...process.env,DATA_DIR:dataDir,DEV_TOKEN:DEV,IDLE_UNLOAD_MS:'400',SAVE_INTERVAL_MS:'500'}});const log=[];srv.stderr.on('data',d=>log.push(String(d)));
function client(name,admin){return new Promise(res=>{const ws=new WebSocket(`ws://127.0.0.1:${PORT}/play`,{headers:{origin:`http://127.0.0.1:${PORT}`}});const c={ws,seq:0,msgs:[],snaps:[],errors:[],notices:[]};
 ws.on('message',raw=>{const m=JSON.parse(raw);c.msgs.push(m);if(m.type==='hello')ws.send(JSON.stringify({type:'hello',protocol:1,name,devToken:admin?DEV:undefined}));if(m.type==='welcome'){c.self=m.self;res(c);}if(m.type==='joined')c.room=m.room;if(m.type==='rooms')c.rooms=m.rooms;if(m.type==='error')c.errors.push(m.message);if(m.type==='snapshot'){c.snaps.push(m.state);c.notices.push(...(m.state.notices||[]));}});
 c.send=o=>ws.send(JSON.stringify(o));c.act=(action,x={})=>c.send({type:'action',action,seq:++c.seq,aim:{x:0,y:0},...x});});}
const until=async(f,ms=4000,label='condition')=>{const t=Date.now();while(!f()){if(Date.now()-t>ms)throw Error('Timed out: '+label);await sleep(25);}};
(async()=>{let ok=false;try{await sleep(800);
 // Private notices stay private; world events reach everyone aboard.
 const p1=await client('One',true),p2=await client('Two');p1.send({type:'create',name:'Alpha'});await until(()=>p1.room);p2.send({type:'join',room:p1.room});await until(()=>p2.snaps.length>2);
 p1.notices.length=0;p2.notices.length=0;p1.act('interact');await sleep(350);assert.ok(p1.notices.length>0,'actor gets the notice');assert.equal(p2.notices.length,0,'other crew does not');
 p1.act('dev',{op:'killgreen'});p1.act('dev',{op:'sparrow'});await sleep(200);p1.notices.length=0;p2.notices.length=0;p1.act('dev',{op:'killbots',species:'red'});for(let i=0;i<30&&!p2.notices.some(n=>/destroyed/.test(n));i++)await sleep(100);assert.ok(p2.notices.some(n=>/destroyed/.test(n)),'world events are broadcast');
 // Another ship in the same zone appears in snapshots: layout once, then just its position.
 const p3=await client('Three',true);p3.send({type:'create',name:'Bravo'});await until(()=>p3.room);p3.act('dev',{op:'sparrow'});
 /* arrivals spread out over the zone and only ships within view range come in full (interest management): park Bravo near Alpha */await until(()=>p3.snaps.at(-1)?.zone==='sparrow',3000,'Bravo in Sparrow');{const a=p1.snaps.at(-1).position;p3.send({type:'eval',id:1,code:`shipNoclip=true;fly(${a.x+60},${a.y})`});}
 await until(()=>p1.snaps.at(-1)?.others?.some(o=>o.name==='Bravo'),4000,'Bravo visible to Alpha');const withLayout=p1.snaps.filter(s=>s.others?.some(o=>o.name==='Bravo'&&o.layout)).length;await sleep(500);
 assert.equal(p1.snaps.filter(s=>s.others?.some(o=>o.name==='Bravo'&&o.layout)).length,withLayout,'layout is not resent every snapshot');assert.ok(p1.snaps.at(-1).others.find(o=>o.name==='Bravo').layoutKey);
 p3.act('dev',{op:'finch'});await until(()=>!p1.snaps.at(-1).others?.some(o=>o.name==='Bravo'),3000,'Bravo leaves Alpha\'s zone');
 // Owner limit covers imports, and only the captain can delete an empty ship.
 p1.send({type:'export'});await until(()=>p1.msgs.some(m=>m.type==='export'));const save=p1.msgs.find(m=>m.type==='export').data;p1.send({type:'leave'});await sleep(100);
 for(let i=0;i<4;i++){p1.errors.length=0;p1.send({type:'import',name:'Copy'+i,data:save});await sleep(150);p1.send({type:'leave'});await sleep(80);}
 assert.ok(p1.errors.some(e=>/Four ships/.test(e)),'fifth ship refused (import)');p1.send({type:'list'});await sleep(150);const mine=p1.rooms.filter(r=>r.mine);assert.equal(mine.length,4);
 p3.errors.length=0;p3.send({type:'delete',room:mine[1].id});await sleep(150);assert.ok(p3.errors.some(e=>/captain/.test(e)),'others cannot delete');
 p1.send({type:'delete',room:mine[1].id});await sleep(150);p1.send({type:'list'});await sleep(150);assert.equal(p1.rooms.filter(r=>r.mine).length,3,'captain deletes own ship');
 // Idle ships unload (freeing simulation slots) and reload on join with their state intact.
 await until(async()=>true);let h;for(let i=0;i<40;i++){h=await (await fetch(`http://127.0.0.1:${PORT}/health`)).json();if(h.loaded<=2)break;await sleep(100);}assert.ok(h.loaded<=2,'idle ships unloaded ('+h.loaded+' loaded)');
 // A simulation error restores the ship from its last save; the crew stays connected and play continues.
 p1.send({type:'join',room:mine[0].id});await until(()=>p1.room===mine[0].id);await sleep(700);p1.errors.length=0;const before=p1.snaps.length;p1.act('dev',{op:'crash'});
 await until(()=>p1.errors.some(e=>/restored from its last save/.test(e)),3000,'recovery notice');await until(()=>p1.snaps.length>before+5,3000,'snapshots resume');assert.equal(p1.ws.readyState,1,'still connected');
 assert.ok(log.join('').includes('Injected test crash'),'crash was logged');
 ok=true;console.log('PASS: real server — private vs broadcast notices, other ships in snapshots (layout sent once), zone exits, owner cap incl. imports, captain-only delete, idle unload, crash recovery without disconnects.');
}catch(e){console.error(e);console.error(log.join('').slice(-2000));}finally{srv.kill('SIGTERM');await sleep(300);fs.rmSync(dataDir,{recursive:true,force:true});process.exit(ok?0:1);}})();
