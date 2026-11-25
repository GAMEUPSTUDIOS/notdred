'use strict';
// v45: stacks merge on contact, the 2019 ammo balance, recyclers, comms stations, Freeport anchors, rank spawn points,
// green bots' pusher drop, Canary iron, Freeport edge docks, new ships never spawning inside each other, blue rammers
// shoving ships, other ships' live state, and atlas tiles cut out once (no Safari seams).
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');process.chdir(root);
const {createRoom}=require('../server/room.cjs'),{ZoneBus}=require('../server/zone-bus.cjs'),era=require('../dist/modules/era.js');
const bus=new ZoneBus();const rooms=[];const mk=(id,rank='captain')=>{const r={id,name:id};r.game=createRoom(null,bus.hooksFor(r));r.game.join(id+'-c',id,true,rank);r.run=c=>r.game.run(c);rooms.push(r);return r;};
const step=n=>{for(let i=0;i<n;i++){for(const r of rooms)r.game.tick(1/60);bus.step(rooms,1/60);}};
const A=mk('A');step(20);const run=A.run;

// ---- Stacks merge when they touch (resting side by side, or one dropped on another).
run('for(const i of [...items])inside.destroyBody(i.body);items.length=0;spawnItem("ammo",V(2,1.6),V(0,0),5);spawnItem("ammo",V(2,.9),V(0,0),3);spawnItem("block",V(-.2,2),V(0,0),2);spawnItem("block",V(.7,2),V(-3,0),4);');step(150);
assert.equal(run('JSON.stringify(items.map(i=>i.type+i.count).sort())'),JSON.stringify(['ammo8','block6']),'stacks merged on contact');

// ---- Ammo (changelog ℵ7/ℵ10/ℵ26): standard reloads fastest; punch/yank/trash hit like standard; scatter and flak 5 pellets.
assert.equal(era.AMMO.punch.damage,era.AMMO.ammo.mine);assert.equal(era.AMMO.trash.damage,era.AMMO.ammo.mine);assert.equal(era.AMMO.scatter.pellets,5);assert.equal(era.AMMO.flak.burst.count,5);
assert.ok(Object.entries(era.AMMO_RELOAD).every(([t,k])=>k===(t==='ammo'?1:2)),'reload: standard 1×, all others 2×');
const hitsToBreak=t=>Math.ceil(era.WORLD_TILE_HP.rock/((era.AMMO[t].mine||era.AMMO[t].damage)*era.WORLD_DAMAGE_SCALE));assert.equal(hitsToBreak('ammo'),5);assert.equal(hitsToBreak('sniper'),3);

// ---- Machines: the game's own sprites, sizes, recipes.
for(const [t,f] of [['recycler','recycler'],['anchor','anchor'],['comms','comms_station'],['spawn','spawn']])assert.ok(fs.existsSync('dist/sprites/official-'+f+'.png'),t+' sprite');
assert.deepEqual(era.MACHINE_SIZE.recycler,[3,4]);assert.deepEqual(era.MACHINE_SIZE.anchor,[3,3]);
assert.ok(era.FABRICATORS.machine.recipes.includes('recycler')&&era.FABRICATORS.machine.recipes.includes('comms')&&era.FABRICATORS.engineering.recipes.includes('spawn')&&era.FABRICATORS.engineering.recipes.includes('anchor'));
// Grow the ship so there is room, then place a recycler where it fits.
run('bounds={l:-9,r:9,t:-6,b:5};rebuildShell();rebuildMounts();');
const spot=t=>run(`(()=>{for(let y=bounds.b-1;y>bounds.t;y--)for(let x=bounds.l+1;x<bounds.r;x++)if(fabFits(x,y,true,"${t}"))return {x,y};})()`);
const rc=spot('recycler');assert.ok(rc,'room for a recycler');
// Recyclers are physics objects placed by their centre: a free spot is accepted, a spot inside the hull wall is not.
run(`player.setTransform(V(${rc.x-1},${rc.y+2}),0);`);assert.equal(run(`machineSpace("recycler",V(${rc.x+1},${rc.y+1.5}))`),true);assert.equal(run(`machineSpace("recycler",V(bounds.l,${rc.y+1.5}))`),false);
run(`spawnMachine("recycler",V(${rc.x+1},${rc.y+1.5}))`);
assert.equal(run(`terrainAt({x:${rc.x+2},y:${rc.y+3}})?.type`),'recycler','3×4 footprint');assert.ok(run(`!!terrainAt({x:${rc.x},y:${rc.y}}).body`),'a physics object');assert.equal(run(`terrainAt({x:${rc.x+3},y:${rc.y+3}})?.type`)??null,null);
// Thrown in: ignored. Clicked in with the stack in hand: worked on for RECYCLE_SECONDS, then half of 16 standard ammo's
// cost (4 per 1 iron + 1 explosive) drops out: 2 iron + 2 explosives. A handheld pusher → a stationary one (ℵ30).
run(`for(const i of [...items])inside.destroyBody(i.body);items.length=0;spawnItem("ammo",V(${rc.x+1},${rc.y}),V(0,0),16);`);step(240);
assert.equal(run('items.filter(i=>i.type==="ammo").reduce((a,i)=>a+i.count,0)'),16,'thrown-in ammo is not recycled');
run(`for(const i of [...items])inside.destroyBody(i.body);items.length=0;giveItem("ammo",16);selectSlot(slots.indexOf("ammo"));recycleCarried(terrainAt({x:${rc.x},y:${rc.y}}));`);
assert.equal(run('inventory.ammo'),0,'loaded from the hand');step(60);assert.equal(run('items.length'),0,'still working');step(2*60+20);
assert.equal(run('JSON.stringify(items.map(i=>i.type+i.count).sort())'),JSON.stringify(['explosives2','iron2']),'half of 16 ammo\'s cost, dropped when done');
run(`for(const i of [...items])inside.destroyBody(i.body);items.length=0;giveItem("pusher",1);selectSlot(slots.indexOf("pusher"));recycleCarried(terrainAt({x:${rc.x},y:${rc.y}}));`);step(4*60);
assert.ok(run('items.some(i=>i.type==="pusher_block")'),'pusher → stationary pusher');
run(`for(const i of [...items])inside.destroyBody(i.body);items.length=0;giveItem("iron",16);selectSlot(slots.indexOf("iron"));recycleCarried(terrainAt({x:${rc.x},y:${rc.y}}));`);assert.equal(run('inventory.iron'),16,'raw resources are refused');
// Fabricators: nothing thrown in is taken, and only ingredients go in by hand.
run(`for(const i of [...items])inside.destroyBody(i.body);items.length=0;`);const fab=run('(()=>{const f=[...terrain.values()].find(t=>t.type==="fabricator");return {x:f.x,y:f.y,iron:f.materials.iron||0};})()');
run(`spawnItem("iron",V(${fab.x+.5},${fab.y+1}),V(0,0),8);`);step(60);assert.equal(run(`terrainAt({x:${fab.x},y:${fab.y}}).materials.iron||0`),fab.iron,'thrown iron not taken in');
run(`activeFab=terrainAt({x:${fab.x},y:${fab.y}});giveItem("ladder",3);transferMaterial("ladder");`);assert.equal(run(`terrainAt({x:${fab.x},y:${fab.y}}).materials.ladder||0`),0,'a finished item is refused');

// ---- Spawn points: a guest joining appears at a guest spawn point; crew/captain points don't catch guests.
run(`for(const i of [...items])inside.destroyBody(i.body);items.length=0;`);const sp=spot('spawn');assert.ok(sp);run(`addTerrain("spawn",${sp.x},${sp.y},0)`);
assert.equal(run(`terrainAt({x:${sp.x},y:${sp.y}}).access`),'crew','crew by default');
A.game.join('g1','Guesty',false,'guest');step(2);assert.ok(run(`(()=>{bindCrew("g1");const p=player.getPosition();return Math.abs(p.x-helm.x)<1.5;})()`),'no guest point: spawns at the helm');
A.game.command('A-c',{action:'spawnrank',cell:sp,rank:'guest'});assert.equal(run(`terrainAt({x:${sp.x},y:${sp.y}}).access`),'guest');
A.game.command('g1',{action:'spawnrank',cell:sp,rank:'captain'});assert.equal(run(`terrainAt({x:${sp.x},y:${sp.y}}).access`),'guest','guests cannot change it');
A.game.join('g2','Guest Two',false,'guest');step(2);assert.ok(run(`(()=>{bindCrew("g2");const p=player.getPosition();return Math.abs(p.x-(${sp.x}))<.3&&Math.abs(p.y-(${sp.y}))<.6;})()`),'guest spawns on the guest spawn point');
const sv=JSON.parse(JSON.stringify(run('state()')));assert.equal(sv.terrain.find(t=>t.type==='spawn').access,'guest','saved');
A.game.leave('g1');A.game.leave('g2');

// ---- Comms: standing at a comms station.
const cm=spot('comms');run(`addTerrain("comms",${cm.x},${cm.y},0)`);run(`bindCrew("A-c");player.setTransform(V(${cm.x},(${cm.y})+.5),0);storeCrew();`);
assert.equal(run('commsCheck("A-c")'),true);run('bindCrew("A-c");player.setTransform(V(bounds.l+1,bounds.b-1),0);storeCrew();');assert.equal(run('commsCheck("A-c")'),!!run(`P.Vec2.distance(V(bounds.l+1,bounds.b-1),V(${cm.x},(${cm.y})+.5))<COMMS_RANGE`));

// ---- Freeport anchor: no leaving through a portal while one is aboard in a Freeport.
assert.equal(run('zoneDef().kind'),'safe');const an=spot('anchor');run(`addTerrain("anchor",${an.x},${an.y},0)`);assert.equal(run('anchored()'),true);
run('bindCrew("A-c");piloting=true;const q=nearestPortal();ship.setTransform(V(q.x,q.y),0);storeCrew();');A.game.command('A-c',{action:'portal'});assert.equal(run('zone'),'freeport','anchored ship stays');

// ---- Drops: green bots carry a handheld pusher; Canary iron gives 64.
assert.ok(era.BOT_DROPS.green.some(([t])=>t==='pusher'));
const Z=mk('Z');step(5);const zs=bus.sims.get('freeport');zs.run('const zd0=zoneDef;zoneDef=()=>({...zd0(),tiles:"canary"});worldLoot.length=0;rocks.set("t1",{id:"t1",x:0,y:0,kind:"iron",hp:1,maxhp:1000,chunk:"c"});rockChunks.set("c",{cells:new Set(["t1"]),body:null,dirty:false});mineRock("t1");zoneDef=zd0;');
assert.equal(zs.run('worldLoot.filter(i=>i.type==="iron").reduce((a,i)=>a+i.count,0)'),64,'Canary iron tile → 64 iron');

// ---- Blue rammers are fast and knock ships back.
assert.ok(era.BOT_TYPES.blue.thrust>=2*11&&era.BOT_TYPES.blue.shipKnock>0);

// ---- Freeport docks: every edge wall.
const D=mk('D');step(30);
const ZH=D.run('zoneHalf()');for(const [side,pose,want] of [['floor',`V(30,${ZH.h-8})`,ZH.h],['ceiling',`V(-40,${-ZH.h+8})`,-ZH.h],['left',`V(${-ZH.w+8},10)`,-ZH.w],['right',`V(${ZH.w-8},-20)`,ZH.w],
 /* the four I-shaped piers (2x2): bar tops, bar undersides and both sides of a stem */['floor','V(110,40)',53],['ceiling','V(-110,-40)',-53],['left','V(105,-85)',91],['right','V(75,-85)',89],['floor','V(-70,-130)',-117],['ceiling','V(70,130)',117]]){D.run(`if(docked)releaseDock();undockCooldown=0;ship.setTransform(${pose},0);ship.setLinearVelocity(V(0,0));zonePlaced=true;`);step(2);const dir={floor:[0,8],ceiling:[0,-8],left:[-8,0],right:[8,0]}[side];bus.sims.get('freeport').run(`fleet.get('D').body.setLinearVelocity(V(${dir[0]},${dir[1]}))`);step(120);
 assert.equal(D.run('docked?.side'),side,side+' wall docks at '+pose);const e=D.run('shipExtents()'),p=D.run('ship.getPosition()');const edge=side==='floor'?p.y+e.b:side==='ceiling'?p.y+e.t:side==='left'?p.x+e.l:p.x+e.r;assert.ok(Math.abs(edge-want)<.2,side+' flush against the wall ('+edge.toFixed(2)+')');}

// ---- Two new ships in the same Freeport never overlap.
const E=mk('E'),F=mk('F');step(10);const ov=(a,b)=>{const pa=a.run('ship.getPosition()'),ea=a.run('shipExtents()'),pb=b.run('ship.getPosition()'),eb=b.run('shipExtents()');return pa.x+ea.l<pb.x+eb.r&&pa.x+ea.r>pb.x+eb.l&&pa.y+ea.t<pb.y+eb.b&&pa.y+ea.b>pb.y+eb.t;};
for(const [a,b] of [[A,E],[A,F],[E,F],[D,E],[D,F],[Z,E],[Z,F]])assert.ok(!ov(a,b),a.id+'/'+b.id+' apart');

// ---- Other ships' live state.
E.run('spawnItem("ammo",V(0,1),V(0,0),4);mounts[0].aim=1.2;mounts[0].recoilUntil=clock+.2;');const live=E.game.zone.exteriorLive();
assert.ok(live.i.some(i=>i[1]==='ammo'&&i[2]===4&&i.length===8)&&live.m[0][0]===1.2&&live.m[0][1]>0,'items, turret aim and recoil');
// Between full lists only moving/changed/new items are sent, with the ids that went away; resting items cost nothing.
for(let k=0;k<240;k++)E.game.tick(1/60);E.run('for(const i of items)i.body.setAwake(false);');const quiet=E.game.zone.exteriorLive(false);assert.equal(quiet.i.length,0,'resting items not resent');assert.equal(quiet.full,0);
E.run('items[0].body.setAwake(true);items[0].body.setLinearVelocity(V(3,0));');assert.equal(E.game.zone.exteriorLive(false).i.length,1,'a moving item is sent (with its velocity)');
const goneId=E.run('(()=>{const i=items[items.length-1],id=i.nid;inside.destroyBody(i.body);items.pop();return id;})()');{const g=E.game.zone.exteriorLive(false).gone;assert.ok(g.length===1&&g[0]==goneId,'removed items are listed '+JSON.stringify([g,goneId]));}
assert.equal(E.game.zone.exteriorLive(true).i.length,E.run('items.length'),'full list once a second');
E.game.zone.exterior();for(const r of rooms){r.layoutCache={key:'k',layout:r.game.zone.exteriorLayout()};r.liveCache=r.game.zone.exteriorLive();}
assert.ok(bus.others(F,new Map()).find(o=>o.id==='E')?.live,'nearby ship gets the live state');

// ---- Tiles from texture atlases are cut out once (Safari bled neighbouring atlas cells into tile edges).
const game=fs.readFileSync('dist/game.js','utf8');assert.ok(/function atlasDraw/.test(game)&&!/ctx\.drawImage\(im,corner\?80/.test(game)&&!/ctx\.drawImage\(atlas,/.test(game));
console.log('PASS: stacks merge on contact; 2019 ammo balance; recycler (3×4, half back, pusher→stationary pusher), spawn points by rank, comms range, Freeport anchor, green bots drop pushers, Canary iron 64, Freeport edge docks, ships never spawn inside each other, live state of nearby ships, atlas tiles cut once.');
process.exit(0);
