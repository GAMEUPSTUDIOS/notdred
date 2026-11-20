'use strict';
// ℵ30 (5 Sept 2019) build: zone graph, per-zone generation, bot species, regeneration rules, flux and pushers.
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');process.chdir(root);
const generator=require('../dist/zone-generator.js'),codec=require('../dist/modules/save-codec.js'),era=require('../dist/modules/era.js');
const elements={},element=()=>({style:{},classList:{toggle(){}},getContext:()=>({}),addEventListener(){},querySelectorAll:()=>[],showModal(){this.open=true},close(){this.open=false},textContent:'',open:false,innerHTML:''});
const s={ZoneGenerator:generator,ShipCodec:codec,planck:require('../dist/vendor/planck.min.js'),document:{querySelector:()=>element(),getElementById:id=>elements[id]??=element(),querySelectorAll:()=>[]},window:{addEventListener(){}},localStorage:{getItem(){return null},setItem(){}},requestAnimationFrame(){},setTimeout,clearTimeout,console};
vm.createContext(s);for(const f of ['era','construction','cargo','machinery','safeguards','combat','zones','missions','hatches','controller'])vm.runInContext(fs.readFileSync('dist/modules/'+f+'.js','utf8'),s);vm.runInContext(fs.readFileSync('dist/game.js','utf8'),s);
const run=c=>vm.runInContext(c,s);run('initialize()');
// These checks predate the v27 bot rules (portal keep-out, staggered volleys, arrival grace); v27 tests cover those.
run('BOT_RULES.portalKeepout=0;BOT_RULES.volleyGap=0;BOT_RULES.arrivalGrace=0');

// --- Zone graph -------------------------------------------------------------------------------------------
const Z=era.ZONES,ids=Object.keys(Z);
assert.deepEqual(ids.sort(),['canary','finch','finch2','freeport','freeport2','freeport3','pits','sparrow'].sort());
const missionIds=ids.filter(id=>Z[id].mission);
const edges=new Set();for(const id of ids){run(`zone=${JSON.stringify(id)};setupZone(true)`);for(const q of run('zonePortals()'))edges.add(id+'>'+q.to);}
for(const e of edges){const [a,b]=e.split('>');assert.ok(Z[b],'portal target exists: '+e);if(!Z[a].mission&&!Z[b].mission)assert.ok(edges.has(b+'>'+a),'every portal has a way back: '+e);}
// With no mission running, no portal leads into a mission zone.
assert.ok(![...edges].some(e=>Z[e.split('>')[1]].mission),'mission zones are closed until a mission starts');
// 2019 topology: Sparrow between both Finches (changed in ℵ47, 2020); Freeport III hangs off Sparrow.
for(const e of ['freeport>finch','finch>sparrow','finch2>freeport2','finch2>sparrow','sparrow>freeport3'])assert.ok(edges.has(e),'2019 link '+e);
assert.ok(!edges.has('finch>finch2'),'no direct Finch I ↔ Finch II link in 2019');
// Driving onto every portal and pressing Q lands in its destination.
for(const id of ids){run(`initialize();piloting=true;player.setActive(false);${Z[id].mission?`startMission(${JSON.stringify(id)});`:''}travelZone(${JSON.stringify(id)},'entry')`);for(const q of run('zonePortals()')){run(`travelZone(${JSON.stringify(id)},'entry');ship.setTransform(V(${q.x},${q.y}),0);usePortal()`);assert.equal(run('zone'),q.to,`${id} portal → ${q.to}`);}}
console.log('PASS: eight zones (incl. mission zones The Pits and Canary), symmetric portal graph, 2019 links (Sparrow between the Finches, Freeport III off Sparrow) and Q-travel over every edge.');

// --- Generation ------------------------------------------------------------------------------------------
for(let seed=0;seed<8;seed++)assert.deepEqual(generator.generate(seed,Z.finch.gen).solid,generator.generate(seed).solid,'Finch I parameters reproduce the original map');
for(const id of ['finch2','sparrow'])for(let seed=0;seed<12;seed++){
 const g=generator.generate(seed,Z[id].gen),{width:w,height:h,solid,centers}=g;
 assert.equal(g.minX+((w-1)/2)*g.cell,0);assert.equal(g.minY+((h-1)/2)*g.cell,0,'entry cavern at the origin');
 assert.notDeepEqual(solid,generator.generate(seed,Z.finch.gen).solid,id+' differs from Finch I');
 const safe=new Uint8Array(w*h);for(let y=2;y<h-2;y++)for(let x=3;x<w-3;x++){let ok=true;for(let dy=-2;dy<=2&&ok;dy++)for(let dx=-3;dx<=3;dx++)if(solid[(y+dy)*w+x+dx]){ok=false;break;}safe[y*w+x]=+ok;}
 const seen=new Set([g.start]),q=[g.start];for(let n=0;n<q.length;n++){const i=q[n];for(const j of [i-1,i+1,i-w,i+w])if(safe[j]&&!seen.has(j)){seen.add(j);q.push(j);}}
 for(let i=0;i<centers.length;i++)if(centers[i])assert.ok(seen.has(i),id+' every cavern reachable at ship clearance');
}
// Portals sit in open caverns the ship can actually reach.
for(const id of ['finch','finch2','sparrow']){run(`zone=${JSON.stringify(id)};setupZone(true)`);const g=generator.generate(run('zoneData[zone].seed||0'),Z[id].gen);for(const p of run('zonePortals()')){const i=((p.y-g.minY)/g.cell)*g.width+(p.x-g.minX)/g.cell;assert.ok(g.centers[i],id+' portal on an open cavern');assert.equal(run(`shipOverlapsRock(V(${p.x},${p.y}))`),false);}
 const portals=run('zonePortals()');for(let a=0;a<portals.length;a++)for(let b=a+1;b<portals.length;b++)assert.ok(Math.hypot(portals[a].x-portals[b].x,portals[a].y-portals[b].y)>60,id+' portals spread out');}
// Random arrival (2019 Help page) lands on open ground, away from portals.
for(let n=0;n<12;n++){run(`initialize();piloting=true;player.setActive(false);travelZone('sparrow')`);assert.equal(run('zone'),'sparrow');assert.equal(run('shipOverlapsRock(ship.getPosition())'),false);assert.ok(run(`nearestPortal().distance>PORTAL_RANGE`),'not dropped onto a portal');}
const ore=id=>{run(`zone=${JSON.stringify(id)};setupZone(true)`);return run('[...rocks.values()].filter(r=>r.ore).length/rocks.size');};
assert.ok(ore('sparrow')>ore('finch')*1.8,'wiki: Finch I has ~1/3 of Sparrow\'s diamond tiles');
console.log('PASS: Finch I unchanged; Finch II/Sparrow distinct, deterministic and fully ship-navigable; portals on reachable open ground; random arrival; Sparrow ore richer.');

// --- Bots ------------------------------------------------------------------------------------------------
for(const id of ids){run(`initialize();zone=${JSON.stringify(id)};setupZone(true)`);const want=Z[id].bots||{};for(const sp of Object.keys(era.BOT_TYPES))assert.equal(run(`botsOf(${JSON.stringify(sp)}).length`),want[sp]||0,`${id} ${sp} count`);}
// Blue rammers (ℵ15 contact bots) never shoot; touching the hull deals damage on a cooldown and bounces off.
run('initialize();zone="sparrow";setupZone(true);for(const b of allBots())if(b.species!=="blue")b.fire=999;const blue=findBot("blue",0);const e=shipExtents(),sp=ship.getPosition();blue.body.setTransform(V(sp.x+e.r+BOT_TYPES.blue.radius+.1,sp.y),0);blue.body.setLinearVelocity(V(0,0));shipHP=shipMaxHP();const shotsBefore=enemyShots.length;tickDungeon(.01)');
assert.equal(run('shipHP'),run('shipMaxHP()')-era.BOT_TYPES.blue.contact);assert.equal(run('enemyShots.length'),run('shotsBefore'),'rammers do not shoot');assert.ok(run('blue.body.getLinearVelocity().x>0'),'knocked back off the hull');
run('blue.body.setTransform(V(sp.x+e.r+BOT_TYPES.blue.radius+.1,sp.y),0);tickDungeon(.01)');assert.equal(run('shipHP'),run('shipMaxHP()')-era.BOT_TYPES.blue.contact,'contact cooldown');
run('blue.contactCd=0;blue.body.setTransform(V(sp.x+e.r+BOT_TYPES.blue.radius+5,sp.y),0);tickDungeon(.01)');assert.equal(run('shipHP'),run('shipMaxHP()')-era.BOT_TYPES.blue.contact,'no damage at range');
run('damageBot(1e9,"blue",0)');assert.ok(run('worldLoot.some(i=>i.type==="iron")&&worldLoot.some(i=>i.type==="ammo")'));
// Bot state is per zone: killing Sparrow's greens does not touch Finch, and survives a round trip.
run('initialize();piloting=true;player.setActive(false);travelZone("sparrow","entry");damageBot(1e9,"green",0);damageBot(1e9,"green",1);travelZone("finch","entry")');assert.equal(run('botsOf("red").length'),20);assert.equal(run('botsOf("green").length'),0);
run('travelZone("sparrow","entry")');assert.equal(run('botsOf("green").length'),0,'dead greens stay dead on return');assert.ok(run('zoneData.sparrow.bots.green.every(r=>r.dead)'));run('tickBotRespawn(BOT_RESPAWN_SECONDS)');assert.equal(run('botsOf("green").length'),2);
// v21 saves (single Finch with redStates/bot) load cleanly.
const v21=JSON.parse(JSON.stringify(run('initialize();zone="finch";setupZone(true);state()')));v21.zoneData.finch={seed:0,mined:[],loot:[],redStates:[{dead:true,respawn:5}],bot:{hp:3,x:0,y:0},botDead:false};run(`initialize(${JSON.stringify(v21)})`);assert.equal(run('zone'),'finch');assert.equal(run('botsOf("red").length'),20);assert.equal(run('zoneData.finch.redStates'),undefined);
console.log('PASS: per-zone species counts, blue rammer contact/cooldown/knockback/no shots, drops, per-zone bot persistence and v21 save migration.');

// --- Regeneration (ℵ25 / ℵ25+) ------------------------------------------------------------------------------
run('initialize();zone="finch";setupZone(true);botsPaused=true;const total=rocks.size;const ids=[...rocks.keys()];for(const id of ids.slice(0,Math.floor(total*.79)))mineRock(id,1);tickDungeon(1/60)');assert.equal(run('zoneData.finch.regenIn'),undefined,'79% clear: no countdown');
run('for(const id of [...rocks.keys()].slice(0,Math.ceil(total*.02)))mineRock(id,1);tickDungeon(1/60)');assert.ok(run('Math.abs(zoneData.finch.regenIn-600)<.1'),'80% clear: 10-minute countdown');
run('const oldSeed=zoneData.finch.seed||0;tickDungeon(599)');assert.equal(run('zoneData.finch.seed||0'),run('oldSeed'),'no regeneration before 10 minutes');run('tickDungeon(1.1)');assert.notEqual(run('zoneData.finch.seed'),run('oldSeed'),'new seed after the countdown');assert.equal(run('zoneData.finch.mined.length'),0);assert.ok(run('zoneData.finch.seed<1e6'),'seed fits the save codec');
// Scheduled reset: every ZONE_RESET_SECONDS (3 h) a zone rebuilds with a new seed, mined or not.
assert.equal(era.ZONE_RESET_SECONDS,3*60*60);
run('initialize();zone="finch2";setupZone(true);botsPaused=true;tickDungeon(1/60)');assert.ok(Math.abs(run('zoneData.finch2.resetIn')-era.ZONE_RESET_SECONDS)<1,'countdown starts at 3 hours');
run('const seed3=zoneData.finch2.seed||0;tickDungeon(era3=ZONE_RESET_SECONDS-5)');assert.equal(run('zoneData.finch2.seed||0'),run('seed3'),'no reset before 3 hours');
run('tickDungeon(6)');assert.notEqual(run('zoneData.finch2.seed||0'),run('seed3'),'reset after 3 hours');run('tickDungeon(1/60)');assert.ok(run('zoneData.finch2.resetIn')>era.ZONE_RESET_SECONDS-1,'next 3-hour cycle starts');
console.log('PASS: 80% clear threshold, visible 10-minute countdown, fresh seed on regeneration, scheduled 3-hour reset.');

// --- Flux, recipes and the stationary pusher (ℵ30) -------------------------------------------------------
assert.ok(run('TYPES.includes("flux")&&TYPES.includes("pusher_block")'));assert.equal(run('stackLimit("flux")'),16);assert.equal(run('stackLimit("pusher_block")'),1);
assert.deepEqual(JSON.parse(run('JSON.stringify(recipeNeeds("pusher"))')),{flux:8},'handheld pusher: 8 flux');assert.deepEqual(JSON.parse(run('JSON.stringify(recipeNeeds("pusher_block"))')),{iron:8,flux:2,silica:2});assert.deepEqual(JSON.parse(run('JSON.stringify(recipeNeeds("ammo"))')),{iron:1,explosives:1});
run('initialize();activeFab=[...terrain.values()].find(t=>t.type==="fabricator");activeFab.kind="engineering";activeFab.materials={iron:64,flux:7,silica:2};craft("pusher");tickFabricators(.1)');assert.equal(run('activeFab.job'),null,'needs 8 flux');
run('activeFab.materials.flux=8;tickFabricators(.1)');assert.equal(run('activeFab.job.type'),'pusher');assert.equal(run('activeFab.materials.flux'),0);assert.equal(run('activeFab.materials.iron'),64,'no iron');
run('clearQueue()');assert.equal(run('inventory.flux'),8,'cancel refunds the 8 flux');
run('activeFab.kind="machine";activeFab.materials={iron:64,flux:4,silica:4};craft("pusher_block");for(let n=0;n<400;n++)tickFabricators(1/60)');assert.ok(run('items.some(i=>i.type==="pusher_block")'),'stationary pusher crafted');
// Stationary pusher drives loose cargo along its beam and stops at solid tiles.
const clear='initialize();for(const b of blocks.values())interior.destroyFixture(b.f);blocks.clear();for(const t of terrain.values()){if(t.f)interior.destroyFixture(t.f);if(t.body)inside.destroyBody(t.body);}terrain.clear();for(const i of items)inside.destroyBody(i.body);items=[];for(const b of boxes)inside.destroyBody(b.body);boxes=[];player.setTransform(V(-4,1.8),0);';
run(clear+'addTerrain("pusher_block",-2,2,0);const crate=spawnItem("iron",V(0,2),V(0,0),16);for(let n=0;n<20;n++)step(1/60)');assert.ok(run('crate.body.getLinearVelocity().x>3'),'pushes right at rotation 0');
run(clear+'addTerrain("pusher_block",2,2,2);const crate2=spawnItem("iron",V(0,2),V(0,0),16);for(let n=0;n<20;n++)step(1/60)');assert.ok(run('crate2.body.getLinearVelocity().x<-3'),'rotation 2 pushes left');
run(clear+'addTerrain("pusher_block",-2,2,0);addBlock(-1,2);const shielded=spawnItem("iron",V(0,2),V(0,0),16);for(let n=0;n<20;n++)step(1/60)');assert.ok(run('Math.abs(shielded.body.getLinearVelocity().x)<.5'),'beam stops at a block');
run(clear+'addTerrain("pusher_block",-2,2,0);const fast=spawnItem("iron",V(0,2),V(0,0),16);for(let n=0;n<240;n++)step(1/60)');assert.ok(run('fast.body.getPosition().x>2'));
// Flux and pushers survive the FSV1 save codec.
run(clear+'addTerrain("pusher_block",-2,1,1);giveItem("flux",9);zoneData.sparrow={seed:123456,mined:[],loot:[{type:"flux",count:4,x:10,y:0}]}');const enc=codec.encode(JSON.parse(JSON.stringify(run('state()'))));run(`initialize(ShipCodec.decode(${JSON.stringify(enc)}))`);
assert.equal(run('inventory.flux'),9);assert.equal(run('[...terrain.values()].find(t=>t.type==="pusher_block").rotation'),1);assert.equal(run('zoneData.sparrow.loot[0].type'),'flux');
console.log('PASS: flux crystals, flux recipes (consume/cancel/refund), stationary pusher beam/rotation/blocking, and FSV1 round-trip.');

// --- Shields and balance -------------------------------------------------------------------------------------
{const S=era.SHIELDS;
 run('initialize()');assert.equal(run('shipMaxHP()'),S.base,'starter ship: base shields');assert.equal(run('shipHP'),S.base,'new ship starts full');
 run('bounds={l:-6,r:6,t:-5,b:3};rebuildShell();rebuildMounts()');assert.equal(run('shipMaxHP()'),S.base+3*S.perExpansion,'ℵ30: +100 per expansion');
 // Slow regeneration in combat zones, paused right after a hit.
 run('initialize();zone="finch";setupZone(true);botsPaused=true;shipHP=500;damageShip(100);tickShields(1)');assert.equal(run('shipHP'),400,'no regen during the post-hit pause');
 run(`tickShields(${S.regenDelay})`);assert.equal(run('shipHP'),400);run('clock+=10;tickShields(10)');assert.equal(run('shipHP'),400+S.regenPerSecond*10,'slow constant regen');
 // Fast refill at Freeport, even right after a hit.
 run('zone="freeport";setupZone(true);shipHP=0;lastShieldHit=clock;tickShields(5)');assert.equal(Math.round(run('shipHP')),Math.min(S.base,S.regenPerSecond*S.safeZoneMultiplier*5),'Freeport refills fast');
 run('for(let i=0;i<60;i++)tickShields(1)');assert.equal(run('shipHP'),S.base,'Freeport reaches full shields');
 // v21 saves stored shields as a percentage.
 const v21=JSON.parse(JSON.stringify(run('initialize();state()')));v21.schema=21;v21.shipHP=40;run(`initialize(${JSON.stringify(v21)})`);assert.equal(run('shipHP'),S.base*.4,'percentage saves migrate');
 // Damage numbers: standard 100, punch 50; tiles take a fraction once shields are down.
 assert.equal(era.AMMO.ammo.damage,100);assert.equal(era.AMMO.punch.damage,100,'ℵ7: punch/yank as strong as standard (halved only at ℵ33)');assert.equal(era.AMMO_RELOAD.ammo,1);for(const t of ['scatter','flak','sniper','punch','yank','breaker','trash'])assert.equal(era.AMMO_RELOAD[t],2,'ℵ10: '+t+' waits twice as long');
 run('initialize();shipHP=0;addBlock(0,1);damageShip(100,V(0,1))');assert.equal(run('blocks.get("0,1").hp'),100-100*era.TILE_DAMAGE_FACTOR);
 // Easier bots: slower, tighter, smaller volleys.
 const red=era.BOT_TYPES.red;assert.ok(red.interval>=6&&red.shots<=3&&red.spread<.075&&red.damage<era.AMMO.ammo.damage,'red bots are gentler than v22');
 run('initialize();zone="finch";setupZone(true);botsPaused=false;for(const b of allBots())b.fire=999;const rb=findBot("red",0);rb.body.setTransform(V(-12,0),0);rb.fire=0;enemyShots=[];tickDungeon(.01)');
 const ys=run('enemyShots.map(s=>Math.atan2(s.v.y,s.v.x))');assert.equal(ys.length,red.shots);assert.ok(Math.max(...ys)-Math.min(...ys)<(red.shots-1)*red.spread+.02,'thin spread');
 run('const hp0=shipHP;enemyShots=[{p:V(ship.getPosition().x-12,ship.getPosition().y),v:V(100,0),life:1,type:"ammo",damage:BOT_TYPES.red.damage,owner:null}];tickCombat(.2)');assert.equal(run('hp0-shipHP'),red.damage,'bot bullets carry their own damage');
 console.log('PASS: shields (base + 100/expansion, slow regen after a pause, fast Freeport refill, percentage-save migration), wiki damage values, tile damage, gentler bot volleys.');}

// --- Fabricator types (ℵ18) ---------------------------------------------------------------------------------
{const F=era.FABRICATORS;
 run('initialize()');assert.equal(run('[...terrain.values()].find(t=>t.type==="fabricator").kind'),'starter','new ships get a starter fabricator');
 const fab=(kind,mats)=>run(`initialize();activeFab=[...terrain.values()].find(t=>t.type==="fabricator");activeFab.kind="${kind}";activeFab.materials=${JSON.stringify(mats)};activeFab.queue=[];`);
 for(const [kind,def] of Object.entries(F)){fab(kind,{iron:64});for(const t of ['ammo','fuel','loader','fab_munitions','wrench']){assert.equal(run(`craft("${t}")`),def.recipes.includes(t),`${kind} ${def.recipes.includes(t)?'makes':'refuses'} ${t}`);}}
 // Legacy crafts every kind of fabricator; a placed fabricator item becomes that kind and wrenches back to it.
 assert.deepEqual([...F.legacy.recipes].sort(),Object.values(F).map(f=>f.item).sort());
 fab('legacy',{iron:64});run('craft("fab_munitions");for(let n=0;n<1300;n++)tickFabricators(1/60)');assert.ok(run('items.some(i=>i.type==="fab_munitions")'),'legacy crafts a munitions fabricator');
 run('slots=["wrench",null,null,null,null];stackCounts=[1,0,0,0,0];for(const t of [...terrain.values()])if(t.type==="fabricator"){if(t.body)inside.destroyBody(t.body);terrain.delete(t.key||key(t.x,t.y));}giveItem("fab_munitions",1);selectSlot(slots.indexOf("fab_munitions"));player.setTransform(V(2,1.8),0);commitBuild({x:2,y:0},"fab_munitions",0)');
 assert.equal(run('terrainAt({x:2,y:-2})?.kind'),'munitions','placed resting on the blocks below');run('selectSlot(0);player.setTransform(V(1,1.8),0);removeAt({x:2,y:-2})');assert.ok(run('inventory.fab_munitions===1||items.some(i=>i.type==="fab_munitions")'),'wrench returns the munitions fabricator');
 // Ammo crafts 4 rounds (ℵ29+); the kind survives a save round trip; old fabricators load as legacy.
 fab('munitions',{iron:8,explosives:8});run('craft("ammo");for(let n=0;n<200;n++)tickFabricators(1/60)');assert.equal(run('items.filter(i=>i.type==="ammo").reduce((n,i)=>n+i.count,0)'),4);
 fab('engineering',{iron:4});const sv=JSON.parse(JSON.stringify(run('state()')));run(`initialize(${JSON.stringify(sv)})`);assert.equal(run('[...terrain.values()].find(t=>t.type==="fabricator").kind'),'engineering');
 sv.schema=21;{const m=sv.machines.find(t=>t.type==='fabricator');sv.machines=sv.machines.filter(x=>x!==m);sv.terrain.push({type:'fabricator',x:Math.round(m.x-.5),y:Math.round(m.y-1),materials:m.materials,queue:[],job:null,repeat:false});}run(`initialize(${JSON.stringify(sv)})`);assert.equal(run('[...terrain.values()].find(t=>t.type==="fabricator").kind'),'legacy');
 console.log('PASS: five fabricator types with their own recipes, legacy crafts all fabricators, kinds place/wrench/save correctly, ammo crafts 4.');}

// --- Loaders and configurable pushers ----------------------------------------------------------------------------
{const clear='initialize();for(const b of blocks.values())interior.destroyFixture(b.f);blocks.clear();for(const t of terrain.values()){if(t.f)interior.destroyFixture(t.f);if(t.body)inside.destroyBody(t.body);}terrain.clear();for(const i of items)inside.destroyBody(i.body);items=[];for(const b of boxes)inside.destroyBody(b.body);boxes=[];player.setTransform(V(-4,1.8),0);';
 const ticks=(n)=>run(`for(let k=0;k<${n};k++)step(1/60)`);
 const near=(x,y,type)=>run(`items.filter(i=>i.type==="${type}"&&Math.abs(i.body.getPosition().x-(${x}))<.8&&Math.abs(i.body.getPosition().y-(${y}))<.8).reduce((n,i)=>n+i.count,0)`);
 assert.deepEqual(JSON.parse(run('JSON.stringify(recipeNeeds("loader"))')),{iron:8,flux:2});assert.ok(era.FABRICATORS.machine.recipes.includes('loader'));
 // Floor to floor: one stack per cycle from behind to in front.
 run(clear+'addTerrain("loader",0,2,0);spawnItem("iron",V(-1,2),V(0,0),16)');ticks(150);assert.equal(near(-1,2,'iron'),0);assert.equal(near(1,2,'iron'),16,'loader moves the stack across');
 // Require output inventory: holds the stack rather than dropping it on the floor.
 run(clear+'addTerrain("loader",0,2,0);terrain.get(key(0,2)).requireOutput=true;spawnItem("iron",V(-1,2),V(0,0),16)');ticks(150);assert.equal(near(1,2,'iron'),0);assert.equal(run('terrain.get(key(0,2)).cargo[0].count'),16,'held, not dropped');
 // …and delivers as soon as an inventory is there: a fabricator (as material) and an expando box.
 run('addTerrain("fabricator",1,0).materials={}');ticks(150);assert.equal(run('terrainAt({x:1,y:1}).materials.iron'),16,'into a fabricator');assert.equal(run('terrain.get(key(0,2)).cargo.length'),0);
 run(clear+'addTerrain("loader",0,2,0);spawnItem("explosives",V(-1,2),V(0,0),9);const lb=spawnBox(V(1.9,1.3))');ticks(200);assert.equal(run('lb.materials.explosives'),9,'into an expando box');
 // Filters: a whitelist ignores other items.
 run(clear+'addTerrain("loader",0,2,0);const lt=terrain.get(key(0,2));lt.filterMode="whitelist";lt.filterItems=["explosives"];spawnItem("iron",V(-1,2),V(0,0),16)');ticks(150);assert.equal(near(-1,2,'iron'),16,'filtered item stays');
 // Settings and held cargo survive a save; wrenching a loader returns what it was holding.
 run(clear+'addTerrain("loader",0,2,1);const l2=terrain.get(key(0,2));l2.requireOutput=true;l2.filterMode="blacklist";l2.filterItems=["ammo"];l2.cargo=[{type:"flux",count:3}]');const sv=JSON.parse(JSON.stringify(run('state()')));run(`initialize(${JSON.stringify(sv)})`);
 assert.deepEqual(JSON.parse(run('JSON.stringify((({requireOutput,filterMode,filterItems,cargo,rotation})=>({requireOutput,filterMode,filterItems,cargo,rotation}))(terrain.get(key(0,2))))')),{requireOutput:true,filterMode:'blacklist',filterItems:['ammo'],cargo:[{type:'flux',count:3}],rotation:1});
 run('slots=["wrench",null,null,null,null];stackCounts=[1,0,0,0,0];selectSlot(0);player.setTransform(V(-1,1.8),0);removeAt({x:0,y:2})');assert.ok(run('items.some(i=>i.type==="flux"&&i.count===3)'),'held stack is returned');
 // Pusher pull: cargo comes toward the pusher and stops a tile short of it.
 run(clear+'player.setTransform(V(4,1.8),0);addTerrain("pusher_block",-3,2,0);terrain.get(key(-3,2)).pull=true;const pulled=spawnItem("iron",V(1,2),V(0,0),16)');ticks(10);assert.ok(run('pulled.body.getLinearVelocity().x<-2'),'pull mode');ticks(300);assert.ok(run('pulled.body.getPosition().x>-2.2'),'stops short of the pusher');
 // Pusher filter.
 run(clear+'addTerrain("pusher_block",-2,2,0);const pt=terrain.get(key(-2,2));pt.filterMode="whitelist";pt.filterItems=["explosives"];const kept=spawnItem("iron",V(0,2),V(0,0),16)');ticks(30);assert.ok(run('Math.abs(kept.body.getLinearVelocity().x)<.3'),'filtered item not pushed');
 // Pull setting survives a save; the pusher block is solid to crew.
 run(clear+'addTerrain("pusher_block",-2,2,0);terrain.get(key(-2,2)).pull=true');const sv2=JSON.parse(JSON.stringify(run('state()')));run(`initialize(${JSON.stringify(sv2)})`);assert.equal(run('terrain.get(key(-2,2)).pull'),true);
 run(clear+'addTerrain("pusher_block",-1,2,0);player.setTransform(V(-3.5,1.8),0);keys={d:true}');ticks(120);run('keys={}');assert.ok(run('localPlayer().x<-1.6'),'crew cannot walk through a pusher ('+run('localPlayer().x').toFixed(2)+')');
 console.log('PASS: loaders (floor, fabricator, expando box, filters, require-output hold, saves, wrench returns cargo); pushers pull/filter/persist and are solid to crew.');}

// --- Safeguards ------------------------------------------------------------------------------------------------
{const S=run('SAFETY');const clear='initialize();for(const b of blocks.values())interior.destroyFixture(b.f);blocks.clear();for(const t of terrain.values()){if(t.f)interior.destroyFixture(t.f);if(t.body)inside.destroyBody(t.body);}terrain.clear();for(const i of items)inside.destroyBody(i.body);items=[];for(const b of boxes)inside.destroyBody(b.body);boxes=[];player.setTransform(V(-4,1.8),0);';
 run(clear+'addBlock(1,1);const wedged=spawnItem("iron",V(1,1),V(0,0),16);wedged.body.setType("static")');run('for(let k=0;k<170;k++)tickSafeguards(1/60)');assert.equal(run('wedgedInSolid(wedged.body)'),false,'wedged item moved out of the block');assert.equal(run('wedged.count'),16);
 run(clear+'const launched=spawnItem("iron",V(0,1),V(500,0),16);tickSafeguards(1/60)');assert.ok(run('launched.body.getLinearVelocity().length()')<=S.maxCargoSpeed+1e-6,'launch speed capped');
 run(clear+'const broken=spawnItem("iron",V(0,1),V(0,0),16);broken.body.setTransform(V(NaN,NaN),0);tickSafeguards(1/60)');assert.ok(run('Number.isFinite(broken.body.getPosition().x)'),'NaN position repaired');
 run(clear+'player.setLinearVelocity(V(Infinity,0));tickSafeguards(1/60)');assert.ok(run('Number.isFinite(player.getPosition().x)&&Number.isFinite(player.getLinearVelocity().x)'),'broken crew body recovered');
 run(clear+`for(let k=0;k<${S.maxLooseStacks+10};k++)spawnItem("iron",V(-3+(k%8)*.8,-2+Math.floor(k/8)%5*.8),V(0,0),1);tickSafeguards(.3)`);assert.ok(run('items.length')<=Math.ceil((S.maxLooseStacks+10)/16),'stacks merged');assert.equal(run('items.reduce((n,i)=>n+i.count,0)'),S.maxLooseStacks+10,'merging keeps every item');
 run(clear+`zone="finch";setupZone(true);for(let k=0;k<${S.hardLooseStacks+15};k++)spawnItem("wrench",V(-3+(k%8)*.8,-2+Math.floor(k/8)%5*.8),V(0,0),1);tickSafeguards(.3)`);assert.equal(run('items.length'),S.hardLooseStacks,'hard limit');assert.equal(run('worldLoot.filter(i=>i.type==="wrench").length'),15,'excess ejected, not deleted');
 assert.equal(Object.keys(S.maxMachines).length,0,'no cap on loaders or pushers');
 console.log('PASS: safeguards — wedged items rescued, launch speed capped, NaN bodies repaired, stack merging without loss, hard limit ejects not deletes, no machine caps.');}
