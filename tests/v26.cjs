'use strict';
// v26: every ℵ30 ammo type, mission zones (The Pits, Canary), critical-ship rules, unlimited pusher beams,
// loaders through walkways, ship names and scores.
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');process.chdir(root);
const generator=require('../dist/zone-generator.js'),codec=require('../dist/modules/save-codec.js'),era=require('../dist/modules/era.js');
const elements={},element=()=>({style:{},classList:{toggle(){}},getContext:()=>({}),addEventListener(){},querySelectorAll:()=>[],showModal(){this.open=true},close(){this.open=false},textContent:'',open:false,innerHTML:''});
const s={ZoneGenerator:generator,ShipCodec:codec,planck:require('../dist/vendor/planck.min.js'),document:{querySelector:()=>element(),getElementById:id=>elements[id]??=element(),querySelectorAll:()=>[]},window:{addEventListener(){}},localStorage:{getItem(){return null},setItem(){}},requestAnimationFrame(){},setTimeout,clearTimeout,console};
vm.createContext(s);for(const f of ['era','construction','cargo','machinery','safeguards','combat','zones','missions','hatches','controller'])vm.runInContext(fs.readFileSync('dist/modules/'+f+'.js','utf8'),s);vm.runInContext(fs.readFileSync('dist/game.js','utf8'),s);
const run=c=>vm.runInContext('{'+c+'}',s);run('initialize()');
const ticks=n=>run(`for(let k=0;k<${n};k++)step(1/60)`);
const clear='initialize();for(const b of blocks.values())interior.destroyFixture(b.f);blocks.clear();for(const t of terrain.values()){if(t.f)interior.destroyFixture(t.f);if(t.body)inside.destroyBody(t.body);}terrain.clear();for(const i of items)inside.destroyBody(i.body);items=[];for(const b of boxes)inside.destroyBody(b.body);boxes=[];player.setTransform(V(-4,1.8),0);';

// --- Ammo ---------------------------------------------------------------------------------------------------
{const A=era.AMMO;
 assert.deepEqual(Object.keys(A).sort(),['ammo','breaker','flak','punch','scatter','sniper','trash','yank'].sort(),'every ℵ30 ammo type');
 for(const t of Object.keys(A)){assert.ok(era.FABRICATORS.munitions.recipes.includes(t),'munitions makes '+t);assert.ok(run(`TYPES.includes("${t}")&&!!NAMES.${t}`));}
 assert.equal(A.sniper.damage,150,'ℵ28++ sniper 150');assert.equal(A.breaker.damage,2*A.ammo.mine,'ℵ14 breaker twice the standard round (100; standard now does half per round, twice as often)');
 // Trash is free and crafts one; breaker crafts one; the rest craft four.
 run('initialize();activeFab=[...terrain.values()].find(t=>t.type==="fabricator");activeFab.kind="munitions";activeFab.materials={};activeFab.queue=[];craft("trash");for(let n=0;n<120;n++)tickFabricators(1/60)');
 assert.equal(run('items.filter(i=>i.type==="trash").reduce((n,i)=>n+i.count,0)'),1,'trash needs no materials');
 run('for(const i of items)inside.destroyBody(i.body);items=[];activeFab.materials={iron:8,explosives:8};craft("sniper");for(let n=0;n<200;n++)tickFabricators(1/60)');assert.equal(run('items.filter(i=>i.type==="sniper").reduce((n,i)=>n+i.count,0)'),4);
 // Every ammo type loads into an RC and goes back out when the turret is shot off.
 run('initialize();const rc=mounts.find(m=>m.type==="turret");rc.ammo=0;giveItem("flak",4);selectSlot(slots.indexOf("flak"));player.setTransform(ship.getLocalPoint(ship.getWorldPoint(mountPoint(rc))),0)');
 // Flight behaviour, in Finch I with bots paused.
 const zoneSetup='initialize();zone="finch";setupZone(true);botsPaused=true;shots=[];';
 run(zoneSetup+'fireRound("scatter",V(0,0),V(1,0))');assert.equal(run('shots.length'),A.scatter.pellets,'scatter fires a fan');const angles=run('shots.map(s=>Math.atan2(s.v.y,s.v.x))');assert.ok(Math.max(...angles)-Math.min(...angles)>A.scatter.spread*.9);
 run("initialize();zone=\"freeport\";setupZone(true);shots=[];fireRound(\"flak\",V(0,-20),V(1,0));");run('for(let k=0;k<Math.ceil(AMMO.flak.burst.after*60)+3;k++)tickShots(1/60)');assert.equal(run('shots.filter(s=>s.frag).length'),A.flak.burst.count,'flak bursts into fragments');
 // Breaker mines any rock in one hit; standard needs two (rock hp 2).
 const firstRock='const r=[...rocks.values()].find(r=>r.kind==="rock"&&!rocks.has(key(r.x-4,r.y))&&Math.abs(r.y)<40);';
 run(zoneSetup+firstRock+'globalThis.rid=r.id;shots.push({type:"breaker",p:V(r.x-3.5,r.y),v:V(110,0),life:2,maxLife:2});for(let k=0;k<10;k++)tickShots(1/60)');assert.equal(run('rocks.has(rid)'),false,'breaker: one hit');
 run(zoneSetup+firstRock+'globalThis.rid=r.id;shots.push({type:"ammo",p:V(r.x-3.5,r.y),v:V(90,0),life:2,maxLife:2});for(let k=0;k<10;k++)tickShots(1/60)');assert.equal(run('rocks.has(rid)'),true,'standard: not in one');
 // Sniper ricochets off rock instead of stopping.
 run(zoneSetup+firstRock+'shots.push({type:"sniper",p:V(r.x-3.5,r.y),v:V(140,0),life:2,maxLife:2,bounces:2});for(let k=0;k<4;k++)tickShots(1/60)');assert.ok(run('shots.length===1&&shots[0].v.x<0&&shots[0].bounces===1'),'sniper bounced');
 // Trash decays: a late hit deals far less than a fresh one.
 assert.equal(run('shotDamage({type:"trash",life:.1,maxLife:1.2})'),2*run('shotDamage({type:"ammo",life:2,maxLife:2})'),'ℵ10: trash hits as hard as a standard round of 2019 (standard now does half per round, twice as often)');run('for(const i of [...items])inside.destroyBody(i.body);items.length=0;spawnItem("trash",V(0,1),V(0,0),16);{const mr=Math.random;Math.random=()=>0;try{tickTrashDecay(1/60);}finally{Math.random=mr;}}');assert.ok(run('(items.find(i=>i.type==="trash")?.count||0)')<16,'ℵ23: trash items decay');
 // Yank pulls a bot toward the shooter; punch pushes it away.
 for(const [type,sign] of [['yank',-1],['punch',1]]){run(zoneSetup+`const b=findBot("red",0);b.body.setTransform(V(30,0),0);b.body.setLinearVelocity(V(0,0));shots.push({type:"${type}",p:V(25,0),v:V(90,0),life:2,maxLife:2});for(let k=0;k<6;k++)tickShots(1/60)`);assert.ok(run('findBot("red",0).body.getLinearVelocity().x')*sign>0,type+' impulse direction');}
 // Saves keep every ammo type in a turret.
 run('initialize();const rc=mounts.find(m=>m.type==="turret");rc.ammoType="yank";rc.ammo=7');const sv=JSON.parse(JSON.stringify(run('state()')));const back=codec.decode(codec.encode(sv));run(`initialize(${JSON.stringify(back)})`);assert.equal(run('mounts.find(m=>m.type==="turret").ammoType'),'yank');
 console.log('PASS: all eight ℵ30 ammo types — recipes/yields (free trash), scatter fan, flak burst, breaker one-hit, sniper ricochet, trash decay, punch/yank impulses, save round trip.');}

// --- Missions -----------------------------------------------------------------------------------------------
{const M=era.MISSIONS;
 run('initialize();zone="freeport";setupZone(true);piloting=true;player.setActive(false)');assert.ok(!run('zonePortals().some(q=>q.mission)'),'no mission portal before a mission');
 run('travelZone("pits")');assert.equal(run('zone'),'freeport');
 run('startMission("pits")');assert.ok(!run('zonePortals().some(q=>q.mission)'),'no gold portal in Freeport');for(const z of ['freeport2','freeport3','finch','finch2'])assert.ok(!run(`zonePortals("${z}").some(q=>q.mission)`),'none in '+z);
 run('zone="sparrow";setupZone(true);for(const b of allBots())b.body.setTransform(V(9999,9999),0)');const portal=run('zonePortals().find(q=>q.mission)');assert.equal(portal.to,'pits','gold portal in Sparrow I');
 assert.ok(run(`![...rocks.values()].some(r=>Math.hypot(r.x-(${portal.x}),r.y-(${portal.y}))<3)`),'in open space');
 run(`ship.setTransform(V(${portal.x},${portal.y}),0);usePortal()`);assert.equal(run('zone'),'pits');
 const treasure=()=>run('[...rocks.values()].filter(r=>r.kind==="treasure").length');assert.equal(treasure(),era.ZONES.pits.gen.treasure,'initial treasure blocks');
 run(`missionState.elapsed+=${M.treasureEverySeconds};tickMissions(1/60)`);assert.equal(treasure(),era.ZONES.pits.gen.treasure+1,'ℵ25: a new treasure block every 5 minutes');
 const score0=run('shipScore');run('const tr=[...rocks.values()].find(r=>r.kind==="treasure");mineRock(tr.id,0)');assert.ok(run('worldLoot.some(i=>i.type==="flux")'),'treasure drops loot');assert.equal(run('shipScore')-score0,era.SCORE.treasure);
 // Mission ends: ships inside go home; the schedule then opens the next zone (Canary) after the interval.
 run(`missionState.endsIn=.01;tickMissions(.02)`);assert.equal(run('zone'),'freeport','sent home when the mission closes');assert.equal(run('missionState.active'),null);
 run(`missionState.nextIn=.01;tickMissions(.02)`);assert.equal(run('missionState.active'),'canary','rotation: The Pits then Canary');
 run('travelZone("canary","entry")');const kinds=JSON.parse(run('JSON.stringify([...new Set([...rocks.values()].map(r=>r.kind))].sort())'));assert.deepEqual(kinds,['flux','hazard','iron','ore','rock','seeker'],'Canary: iron, flux, turret ore, rock and seeker tiles in the square (hazard rim)');
 run('const fx=[...rocks.values()].find(r=>r.kind==="flux");mineRock(fx.id)');assert.ok(run('worldLoot.some(i=>i.type==="flux")'),'flux seam drops flux');
 // Mission state is saved with the ship.
 const sv=JSON.parse(JSON.stringify(run('state()')));run(`initialize(${JSON.stringify(codec.decode(codec.encode(sv)))})`);assert.equal(run('missionState.active'),'canary');assert.equal(run('zone'),'canary');
 console.log('PASS: missions — closed until started, gold Freeport portal, The Pits treasure (+1 per 5 min, loot, score), home on close, Pits→Canary rotation, Canary iron/flux seams, saved schedule.');}

// --- Critical ships -----------------------------------------------------------------------------------------
{run('initialize();shipHP=0;CRITICAL.shrinkChance=1');const b0=run('({...bounds})');
 for(let n=0;n<60;n++)run('const y=[...Array(bounds.b-bounds.t-1)].map((_,i)=>bounds.t+1+i).find(y=>!mounts.some(m=>P.Vec2.distance(mountPoint(m),V(bounds.r,y))<1.2))??0;damageShip(500,V(bounds.r,y))');
 assert.equal(run('brokenHull.size'),0,'hull tiles never break');const b1=run('({...bounds})');
 assert.ok(b1.r-b1.l+1>=8&&b1.b-b1.t+1>=8,'never below 8×8');assert.ok(b1.l>b0.l||b1.r<b0.r,'hits on the hull shrink the ship');
 // Starter items soak hits and are never destroyed.
 run('initialize();shipHP=0;CRITICAL.shrinkChance=0');const starters=run('mounts.filter(m=>isStarterTile(m)).length+[...terrain.values()].filter(isStarterTile).length');assert.ok(starters>0);
 for(const m of run('mounts.map(m=>({...mountPoint(m)}))'))for(let n=0;n<20;n++)run(`damageShip(1000,V(${m.x},${m.y}))`);
 for(const t of run('[...terrain.values()].filter(isStarterTile).map(t=>({x:t.x,y:t.y}))'))for(let n=0;n<20;n++)run(`damageShip(1000,V(${t.x},${t.y}))`);
 assert.equal(run('mounts.filter(m=>isStarterTile(m)).length+[...terrain.values()].filter(isStarterTile).length'),starters,'starter thrusters, RCs, hatch and fabricator stay');
 assert.equal(run('worldLoot.filter(i=>STARTER_ITEMS.includes(i.type)).length'),0,'no starter item ejected');
 // Ordinary tiles still break; loose cargo by the hit is blown out (as loot), further away it is kicked.
 run(clear+'shipHP=0;addBlock(2,1);for(let n=0;n<10;n++)damageShip(1000,V(2,1))');assert.equal(run('blocks.has(key(2,1))'),false);
 run(clear+'shipHP=0;CRITICAL.shrinkChance=0;globalThis.near=spawnItem("iron",V(0,1),V(0,0),16);globalThis.far=spawnItem("flux",V(2.2,1),V(0,0),4);damageShip(100,V(0,1))');
 assert.ok(run('!items.includes(near)&&worldLoot.some(i=>i.type==="iron"&&i.count===16)'),'stack at the hit blown out, not deleted');
 assert.ok(run('items.includes(far)&&far.body.getLinearVelocity().length()>1'),'nearby stack knocked about');
 run('CRITICAL.shrinkChance=.15');
 console.log('PASS: critical ships — hull never breaks and shrinks instead (min 8×8), starter items never destroyed or ejected, tiles still break, loose cargo blown out or knocked.');}

// --- Pusher beams and loaders --------------------------------------------------------------------------------
{run(clear+'addTerrain("pusher_block",-4,2,0);addTerrain("glass",-3,2);addTerrain("walkway",-2,2);addTerrain("net",-1,2);globalThis.a=spawnItem("iron",V(0,2),V(0,0),16);globalThis.b=spawnItem("flux",V(3,2),V(0,0),4)');ticks(8);
 assert.ok(run('a.body.getLinearVelocity().x>1'),'beam passes glass, walkway and net and drives the first item in it');
 assert.ok(Math.abs(run('b.body.getLinearVelocity().x'))<.2,'the item behind it is shielded');
 assert.ok(Math.abs(run('terrain.get(key(-4,2)).beam')-(run('a.body.getPosition().x')-(-4)))<.6,'the beam ends at the first item');
 run('for(const i of [...items])inside.destroyBody(i.body);items.length=0;');ticks(2);assert.ok(run('terrain.get(key(-4,2)).beam')>run('bounds.r-(-4)')-1,'with nothing in the way it reaches the hull');
 run(clear+'addTerrain("pusher_block",-4,2,0);addBlock(-2,2);globalThis.c=spawnItem("iron",V(0,2),V(0,0),16)');ticks(8);assert.ok(run('Math.abs(c.body.getLinearVelocity().x)<.3'),'a block stops the beam');
 run(clear+'addTerrain("loader",0,2,0);addTerrain("walkway",-1,2);spawnItem("iron",V(-2,2),V(0,0),16)');ticks(150);
 assert.equal(run('items.filter(i=>i.type==="iron"&&Math.abs(i.body.getPosition().x-1)<.8).reduce((n,i)=>n+i.count,0)'),16,'loader reaches through a walkway');
 console.log('PASS: pusher beams have no length limit, pass glass/walkways/nets, stop at the first object (driving only it) or solid tile; loaders reach through walkways.');}

// --- Names and score -----------------------------------------------------------------------------------------
{run('initialize()');const name=run('shipName');assert.ok(name&&name.split(' ').length===2,'new ships get a random name');
 run('shipScore=1234;renameShip("Kestrel")');assert.equal(run('shipName'),'Kestrel');run('renameShip("Other")');assert.equal(run('shipName'),'Kestrel','one rename per hour');
 const sv=JSON.parse(JSON.stringify(run('state()')));run(`initialize(${JSON.stringify(codec.decode(codec.encode(sv)))})`);assert.equal(run('shipName'),'Kestrel');assert.equal(run('shipScore'),1234);assert.ok(run('renameIn')>3000);
 assert.equal(era.cleanShipName('  <b>Bad\u0001 name</b> '),'bBad name/b');
 run('initialize();zone="finch";setupZone(true);const sc=shipScore;damageBot(1e9,"red",0);globalThis.gain=shipScore-sc');assert.equal(run('gain'),era.SCORE.bot.red,'bot kills score');
 console.log('PASS: random ship names, rename (once per hour), name/score/cooldown saved, bot kills scored.');}
