'use strict';
// v27: turret loading/ejecting, per-turret reload times, easier bots, staggered bot volleys, arrival grace and
// bot-free portals.
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');process.chdir(root);
const generator=require('../dist/zone-generator.js'),codec=require('../dist/modules/save-codec.js'),era=require('../dist/modules/era.js');
const elements={},element=()=>({style:{},classList:{toggle(){}},getContext:()=>({}),addEventListener(){},querySelectorAll:()=>[],showModal(){this.open=true},close(){this.open=false},textContent:'',open:false,innerHTML:''});
const s={ZoneGenerator:generator,ShipCodec:codec,planck:require('../dist/vendor/planck.min.js'),document:{querySelector:()=>element(),getElementById:id=>elements[id]??=element(),querySelectorAll:()=>[]},window:{addEventListener(){}},localStorage:{getItem(){return null},setItem(){}},requestAnimationFrame(){},setTimeout,clearTimeout,console};
vm.createContext(s);for(const f of ['era','construction','cargo','machinery','safeguards','combat','zones','missions','hatches','controller'])vm.runInContext(fs.readFileSync('dist/modules/'+f+'.js','utf8'),s);vm.runInContext(fs.readFileSync('dist/game.js','utf8'),s);
const run=c=>vm.runInContext('{'+c+'}',s);run('initialize()');
const ticks=n=>run(`for(let k=0;k<${n};k++)step(1/60)`);
const clear='initialize();for(const b of blocks.values())interior.destroyFixture(b.f);blocks.clear();for(const t of terrain.values()){if(t.f)interior.destroyFixture(t.f);if(t.body)inside.destroyBody(t.body);}terrain.clear();for(const i of items)inside.destroyBody(i.body);items=[];for(const b of boxes)inside.destroyBody(b.body);boxes=[];player.setTransform(V(-4,1.8),0);';


// --- Turret loading -------------------------------------------------------------------------------------------
{const at='const m=mounts.find(m=>m.type==="turret"&&m.side==="left");globalThis.T=m;player.setTransform(V(bounds.l+1.8,mountPoint(m).y+.8),0);mouse={x:0,y:0,active:true};';
 const clickTurret='{const w=ship.getWorldPoint(mountPoint(T));W=H=0;zoom=1;cam={x:w.x,y:w.y};mouse={x:0,y:0,active:true};edit();}';
 // Loading the whole held stack: the turret must remember the ammo type (the slot is empty by then).
 run('initialize();'+at+'T.ammo=0;giveItem("sniper",12);selectSlot(slots.indexOf("sniper"));'+clickTurret);
 assert.equal(run('T.ammo'),12);assert.equal(run('T.ammoType'),'sniper','type kept after the stack runs out');assert.equal(run('inventory.sniper'),0);
 run('selectSlot(slots.indexOf(null));'+clickTurret);assert.deepEqual(JSON.parse(run('JSON.stringify(items.map(i=>[i.type,i.count]))')),[['sniper',12]],'ejects real sniper ammo, not "undefined"');
 // Holding more than the turret needs: it takes only what fits and leaves the rest in hand.
 run('initialize();'+at+'T.ammo=10;T.ammoType="ammo";giveItem("ammo",16);selectSlot(slots.indexOf("ammo"));'+clickTurret);assert.equal(run('T.ammo'),16);assert.equal(run('inventory.ammo'),10,'stack split: 6 taken, 10 kept');
 run(clickTurret);assert.equal(run('inventory.ammo'),10,'full turret takes nothing');
 // Reaching a side turret from right beside the hull is not "blocked".
 run('initialize();const m=mounts.find(m=>m.type==="turret"&&m.side==="left");player.setTransform(V(-4.2,1.864),0)');assert.equal(run('buildBlocked(mountPoint(mounts.find(m=>m.type==="turret"&&m.side==="left")))'),false);
 console.log('PASS: turret loading — ammo type kept when the stack runs out (no "undefined" eject), stacks split to fit, full turrets take nothing, side turrets reachable up close.');}

// --- Turret reload -------------------------------------------------------------------------------------------
{assert.ok(era.TURRETS.turret.reload<era.TURRETS.starter_rc.reload,'RC turret reloads faster than the starter RC');
 run('initialize();zone="finch";setupZone(true);botsPaused=true;shots=[];W=H=0;zoom=1;cam={x:0,y:0};piloting=true;for(const m of mounts)if(m.type==="turret"){m.ammo=16;m.ammoType="ammo";}const r=mounts.find(m=>m.side==="right");globalThis.R=r;const sp=ship.getPosition();mouse={x:sp.x+40,y:sp.y,active:true}');
 run('fireRC()');assert.equal(run('R.ammo'),15);run('fireCooldown=0;fireRC()');assert.equal(run('R.ammo'),15,'still reloading');
 run(`for(let k=0;k<Math.ceil(TURRETS.starter_rc.reload*60)+1;k++)tickZone(1/60);fireCooldown=0;fireRC()`);assert.equal(run('R.ammo'),14,'fires again after its reload');
 assert.ok(run('(R.ammoType="sniper",turretReload(R))')>run('(R.ammoType="ammo",turretReload(R))'),'sniper reloads slower');
 run('R.starterRC=false');assert.ok(run('turretReload(R)')<run('(R.starterRC=true,turretReload(R))'));
 console.log('PASS: per-turret reload — each RC has its own timer, RC turret faster than starter RC, slower for heavy ammo.');}

// --- Bots -------------------------------------------------------------------------------------------------------
{const B=era.BOT_TYPES,R=era.BOT_RULES;
 for(const sp of ['red','blue'])assert.ok(B[sp].hp<=16*era.AMMO.ammo.damage,sp+' dies to a handful of standard rounds');
 // v33: green bots are huge tanks; red raiders are much larger than before.
 assert.ok(B.green.hp>=40*era.AMMO.ammo.damage&&B.green.radius>=2.5*B.blue.radius,'green bots are very big with a lot of health');assert.ok(B.red.radius>=4,'red raiders are large');
 // Volleys leave one shot at a time, then a long cooldown.
 run('initialize();zone="finch";setupZone(true);for(const b of allBots())b.fire=999;const rb=findBot("red",0);const sp=ship.getPosition();rb.body.setTransform(V(sp.x-40,sp.y),0);ship.setTransform(V(sp.x,sp.y),0);rb.fire=0;enemyShots=[];');
 // Park the ship well away from every portal for these checks.
 run('{const g=zoneGrid();for(let i=0;i<g.centers.length;i++)if(g.centers[i]){const p=V(g.minX+i%g.width*g.cell,g.minY+Math.floor(i/g.width)*g.cell);if(!nearPortal(p,BOT_RULES.portalKeepout+20)&&!shipOverlapsRock(p)&&!shipOverlapsRock(V(p.x-14,p.y))){ship.setTransform(p,0);findBot("red",0).body.setTransform(V(p.x-14,p.y),0);break;}}}');
 run('botAct(findBot("red",0),BOT_TYPES.red,findBot("red",0).body.getPosition(),ship.getPosition(),14,true,.01)');assert.equal(run('enemyShots.length'),1,'first shot only');
 run(`for(let k=0;k<Math.ceil(${R.volleyGap*2}*100)+2;k++)botAct(findBot("red",0),BOT_TYPES.red,findBot("red",0).body.getPosition(),ship.getPosition(),14,true,.01)`);assert.equal(run('enemyShots.length'),B.red.shots,'rest of the volley follows');assert.ok(run('findBot("red",0).fire')>=B.red.interval-1,'then a long cooldown');
 // New bots hold fire for the arrival grace.
 run('initialize();zone="finch";setupZone(true)');assert.ok(run('Math.min(...allBots().map(b=>b.fire))')>=R.arrivalGrace,'arrival grace');
 // Portals are bot-free: none spawn there, one placed there is pushed out, and a ship parked on a portal is ignored.
 for(const z of ['finch','sparrow'])assert.equal(run(`initialize();zone="${z}";setupZone(true);allBots().filter(b=>nearPortal(b.body.getPosition(),BOT_RULES.portalKeepout)).length`),0,z+': no bots spawn by a portal');
 run('initialize();zone="sparrow";setupZone(true);botsPaused=false;const q=zonePortals()[0];ship.setTransform(V(q.x,q.y),0);for(const b of allBots())b.fire=0;const rb=findBot("red",0);rb.body.setTransform(V(q.x+6,q.y),0);rb.body.setLinearVelocity(V(0,0));const bl=findBot("blue",0);bl.body.setTransform(V(q.x,q.y+7),0);shipHP=shipMaxHP();enemyShots=[];');
 run('for(let k=0;k<180;k++)step(1/60)');assert.equal(run('shipHP'),run('shipMaxHP()'),'a ship on a portal is not attacked');
 assert.ok(run('P.Vec2.distance(findBot("red",0).body.getPosition(),V(zonePortals()[0].x,zonePortals()[0].y))')>R.portalKeepout-4,'bot driven out of the portal zone');
 console.log('PASS: bots — die in a few hits, one-at-a-time volleys with long cooldowns, arrival grace, never spawn/loiter at portals, ignore ships parked on a portal.');}

// --- Repair of saves hit by the v26 bug ---------------------------------------------------------------------------
{run('initialize();const m=mounts.find(m=>m.type==="turret");m.ammo=9;m.ammoType="empty";spawnItem("ammo",V(0,1),V(0,0),5)');
 const sv=JSON.parse(JSON.stringify(run('state()')));sv.items[0].type='empty';sv.boxes[0].materials.empty=7;
 // An old save as written before this fix: the turret's bad type, plus (via plain JSON) bad loose items and box contents.
 sv.mounts.find(m=>m.type==='turret').ammoType='empty';
 run(`initialize(${JSON.stringify(sv)})`);
 assert.equal(run('mounts.find(m=>m.type==="turret").ammoType'),'ammo','turret type repaired');assert.ok(run('items.some(i=>i.type==="ammo"&&i.count===5)'),'"empty" loose item restored as ammo');assert.ok(run('boxes[0].materials.ammo')>=7&&run('boxes[0].materials.empty')===undefined);
 run('const m=mounts.find(m=>m.type==="turret");globalThis.T=m;player.setTransform(V(bounds.l+1.8,mountPoint(m).y+.8),0);giveItem("ammo",16);selectSlot(slots.indexOf("ammo"));{const w=ship.getWorldPoint(mountPoint(T));W=H=0;zoom=1;cam={x:w.x,y:w.y};mouse={x:0,y:0,active:true};edit();}');
 assert.equal(run('T.ammo'),16,'a repaired, partly filled turret tops up');
 console.log('PASS: saves hit by the v26 bug load repaired — turrets, loose items, boxes; partly filled turrets top up again.');}
{run('initialize();spawnItem("empty",V(0,1),V(0,0),4);mounts.find(m=>m.type==="turret").ammoType="empty"');const enc=codec.encode(JSON.parse(JSON.stringify(run('state()'))));assert.ok(enc.length>0,'a ship holding a bad item still saves');assert.ok(run('items.some(i=>i.type==="ammo"&&i.count===4)'));
 console.log('PASS: saving repairs bad items in place, so saves no longer fail silently.');}

// --- Critical shots phase through the hull ------------------------------------------------------------------------
{const clr='initialize();for(const b of blocks.values())interior.destroyFixture(b.f);blocks.clear();for(const t of [...terrain.values()])if(!isStarterTile(t)){if(t.f)interior.destroyFixture(t.f);terrain.delete(key(t.x,t.y));}CRITICAL.shrinkChance=0;';
 // Shields up: the hull stops the shot and shields drain; tiles are untouched.
 run(clr+'addBlock(0,-2);damageShip(100,V(bounds.r,-2),V(-1,0))');assert.equal(run('blocks.get(key(0,-2)).hp??100'),100);assert.ok(run('shipHP<shipMaxHP()'));
 // Critical: the shot goes through the hull and hits the FIRST tile on its path, not the hull or the nearest tile.
 run(clr+'shipHP=0;addBlock(0,-2);addBlock(3,-2);damageShip(100,V(bounds.r,-2),V(-1,0))');
 assert.ok(run('blocks.get(key(3,-2)).hp')<100,'first tile on the path is hit');assert.equal(run('blocks.get(key(0,-2)).hp??100'),100,'tile behind it is shielded by it');
 const per=100*era.TILE_DAMAGE_FACTOR;let hits=0;while(run('blocks.has(key(3,-2))')&&hits<50){run('damageShip(100,V(bounds.r,-2),V(-1,0))');hits++;}
 assert.equal(hits,Math.ceil(100/per)-1,'health depletes hit by hit until it breaks');run('damageShip(100,V(bounds.r,-2),V(-1,0))');assert.ok(run('blocks.get(key(0,-2)).hp')<100,'then the next tile in line takes hits');
 // Nothing in the way: the shot leaves through the far side.
 run(clr+'shipHP=0');const out=run('JSON.stringify(damageShip(100,V(3,bounds.t),V(0,1)))');assert.ok(JSON.parse(out).exit.y>run('bounds.b'),'passes straight through');
 // A bot bullet in flight does the same: it keeps flying through an empty critical ship.
 run(clr+'zone="finch";setupZone(true);botsPaused=true;shipHP=0;addBlock(-2,-2);const sp=ship.getPosition();enemyShots=[{p:V(sp.x+12,sp.y-2),v:V(-60,0),life:2,type:"ammo",damage:100,owner:null}];for(let k=0;k<20;k++)tickCombat(1/60)');
 assert.ok(run('blocks.get(key(-2,-2)).hp')<100,'bot bullet reaches the inner tile');
 run('CRITICAL.shrinkChance=.08');
 console.log('PASS: critical ships — shots phase through the hull, hit the first tile on their path until it breaks, then the next; empty paths pass straight through.');}

// An attachment where the shot lands takes the hit (the round stops there): a light round dents the starter RC, a heavy
// one breaks it (starter items are no longer immune, v72).
{run('initialize();shipHP=0;CRITICAL.shrinkChance=0;globalThis.rc=mounts.find(m=>m.side==="right");const before=terrainOfType("fabricator")[0]?.hp??100;damageShip(50,mountPoint(rc),V(-1,0));globalThis.fabAfter=terrainOfType("fabricator")[0]?.hp??100');
 assert.ok(run('rc.hp')<100&&run('mounts.includes(rc)'),'the RC soaks a light round');run('damageShip(1000,mountPoint(rc),V(-1,0))');assert.equal(run('mounts.filter(m=>m.side==="right").length'),0,'a heavy one breaks it');run('CRITICAL.shrinkChance=.08');console.log('PASS: attachments in the line of fire take critical shots and break.');}

// --- Loaders are solid, drop instead of throwing, and fill only what each machine uses ------------------------------
{const clr='initialize();for(const b of blocks.values())interior.destroyFixture(b.f);blocks.clear();for(const t of terrain.values()){if(t.f)interior.destroyFixture(t.f);if(t.body)inside.destroyBody(t.body);}terrain.clear();for(const i of items)inside.destroyBody(i.body);items=[];for(const b of boxes)inside.destroyBody(b.body);boxes=[];player.setTransform(V(-4,1.8),0);';
 // Crew cannot walk through a loader (or a pusher).
 for(const type of ['loader','pusher_block']){run(clr+`addTerrain("${type}",-1,2,0);player.setTransform(V(-3.5,1.8),0);keys={d:true}`);ticks(120);run('keys={}');assert.ok(run('localPlayer().x<-1.6'),type+' is solid to crew');}
 // Loose cargo cannot pass through a loader either.
 run(clr+'addTerrain("loader",0,1,0);globalThis.it=spawnItem("iron",V(-2,1),V(12,0),16);it.body.setGravityScale?.(0)');ticks(60);assert.ok(run('it.body.getPosition().x<-.4'),'items stop at a loader');
 // Pusher beams stop at loaders and other pushers.
 run(clr+'addTerrain("pusher_block",-4,2,0);addTerrain("loader",-2,2,1);globalThis.far=spawnItem("iron",V(1,2),V(0,0),16)');ticks(8);assert.ok(run('Math.abs(far.body.getLinearVelocity().x)<.3'),'beam blocked by a loader');
 // Floor output: the stack is set down on the tile in front, not thrown.
 run(clr+'addTerrain("loader",0,2,0);spawnItem("iron",V(-1,2),V(0,0),16)');ticks(100);
 assert.ok(run('(i=>i&&Math.abs(i.body.getPosition().x-1)<.5&&i.body.getLinearVelocity().length()<.5)(items.find(i=>i.type==="iron"))'),'dropped on the facing tile');
 // Fabricators accept only their recipes' ingredients from a loader.
 run(clr+'const f=addTerrain("fabricator",1,0);f.kind="munitions";f.materials={};addTerrain("loader",0,2,0);spawnItem("wrench",V(-1,2),V(0,0),1)');ticks(120);
 assert.equal(run('terrainAt({x:1,y:0}).materials.wrench'),undefined,'a wrench is not loaded into a fabricator');assert.equal(run('terrain.get(key(0,2)).cargo.length'),0,'the loader does not keep it');assert.ok(run('items.some(i=>i.type==="wrench"&&Math.abs(i.body.getPosition().x-1)<.6)'),'it drops it on the tile it faces');
 run(clr+'const f=addTerrain("fabricator",1,0);f.kind="munitions";f.materials={};addTerrain("loader",0,2,0);spawnItem("explosives",V(-1,2),V(0,0),8)');ticks(120);assert.equal(run('terrainAt({x:1,y:0}).materials.explosives'),8,'ingredients go in');
 // Only ammo goes into a turret.
 run('initialize();const rc=mounts.find(m=>m.side==="right"&&m.type==="turret");rc.ammo=0;const lt={type:"loader",x:bounds.r-2,y:mountPoint(rc).y,rotation:0,cargo:[]};globalThis.n1=loaderGive(lt,{x:bounds.r,y:mountPoint(rc).y},{type:"iron",count:16},V(1,0));globalThis.n2=loaderGive(lt,{x:bounds.r,y:mountPoint(rc).y},{type:"ammo",count:16},V(1,0))');
 assert.equal(run('n1'),0,'iron refused by a turret');assert.equal(run('n2'),16,'ammo accepted');
 console.log('PASS: loaders and pushers are solid (crew and cargo), beams stop at them, loaders set items down instead of throwing them, fabricators take only ingredients and turrets only ammo.');}

// --- Fabricators and the helm stand on walkways ---------------------------------------------------------------------
{const clr='initialize();for(const b of blocks.values())interior.destroyFixture(b.f);blocks.clear();for(const t of [...terrain.values()])if(t.type!=="fabricator"){if(t.f)interior.destroyFixture(t.f);terrain.delete(key(t.x,t.y));}for(const i of items)inside.destroyBody(i.body);items=[];';
 run(clr+'addTerrain("walkway",0,1);addTerrain("walkway",1,1);player.setTransform(V(-1,1.8),0)');
 assert.equal(run('validity({x:0,y:-2},"fab_munitions")'),'','a fabricator can be placed where it fits, resting on a surface');
 run('giveItem("fab_munitions",1);selectSlot(slots.indexOf("fab_munitions"));commitBuild({x:0,y:-2},"fab_munitions",0)');ticks(90);
 assert.ok(Math.abs(run('(()=>{const f=[...terrain.values()].find(t=>t.kind==="munitions");return f.body.getPosition().y+1.5;})()')-.5)<.1,'it rests on the walkways');
 run(clr+'for(const b of boxes)inside.destroyBody(b.body);boxes.length=0;/* the starting expando box hangs here (v66: nothing is built into a box) */addTerrain("walkway",3,1);addTerrain("walkway",4,1);player.setTransform(V(1,1.8),0)');
 assert.equal(run('validity({x:3,y:0},"helm")'),'','helm on walkways');assert.ok(run('validity({x:3,y:-1},"helm")')!=='','not floating');
 // The walkways under it can't be pulled out while it stands there, and it never moves.
 run(clr+'addTerrain("walkway",0,1);addTerrain("walkway",1,1);player.setTransform(V(-1,1.8),0);giveItem("fab_munitions",1);selectSlot(slots.indexOf("fab_munitions"));commitBuild({x:0,y:-2},"fab_munitions",0)');ticks(90);
 run('selectSlot(slots.indexOf("wrench"));player.setTransform(V(3,1.8),0);removeAt({x:0,y:1});removeAt({x:1,y:1})');ticks(90);
 assert.ok(run('!terrain.has(key(0,1))'),'the support can be removed');assert.ok(run('![...terrain.values()].some(t=>t.kind==="munitions")&&(items.some(i=>i.type==="fab_munitions")||slots.includes("fab_munitions"))'),'the fabricator on it comes down as its packaged item');
 console.log('PASS: fabricators placed where they fit, resting on walkways, fixed in place (removing a support drops the machine as its item); the helm stands on walkways, not floating.');}

// --- Loader pickup hotbox: thrown, dropped nearby, or falling through --------------------------------------------------
{const clr='initialize();for(const b of blocks.values())interior.destroyFixture(b.f);blocks.clear();for(const t of terrain.values()){if(t.f)interior.destroyFixture(t.f);if(t.body)inside.destroyBody(t.body);}terrain.clear();for(const i of items)inside.destroyBody(i.body);items=[];for(const b of boxes)inside.destroyBody(b.body);boxes=[];player.setTransform(V(-4,1.8),0);';
 const held='terrain.get(key(0,2)).cargo.reduce((n,c)=>n+c.count,0)+items.filter(i=>i.type==="iron"&&i.body.getPosition().x>.6).reduce((n,i)=>n+i.count,0)';
 run(clr+'addTerrain("loader",0,2,0);spawnItem("iron",V(-3.5,1.6),V(9,0),16)');ticks(90);assert.equal(run(held),16,'item thrown at the loader is taken');
 run(clr+'addTerrain("loader",0,2,0);spawnItem("iron",V(-1.1,-1.5),V(0,0),16)');ticks(90);assert.equal(run(held),16,'item falling into the hotbox is taken');
 run(clr+'addTerrain("loader",0,2,0);spawnItem("iron",V(-1.5,1.9),V(0,0),16)');ticks(90);assert.equal(run(held),16,'item dropped just behind it is taken');
 run(clr+'addTerrain("loader",0,2,0);spawnItem("iron",V(-3,2),V(0,0),16)');ticks(90);assert.equal(run(held),0,'items well away are left alone');
 // Mid-air catch: an item crossing the hotbox between cycles is caught while the loader is empty.
 run(clr+'addTerrain("loader",0,2,0);terrain.get(key(0,2)).cooldown=1;globalThis.fly=spawnItem("iron",V(-1,-2.5),V(0,9),16)');let vAtCatch=null;for(let k=0;k<40&&vAtCatch==null;k++){const v=run('fly.body.getLinearVelocity().length()');ticks(1);if(run('terrain.get(key(0,2)).cargo.length'))vAtCatch=v;}assert.ok(vAtCatch>3,'caught in flight, still moving at '+vAtCatch);
 console.log('PASS: loader hotbox — takes items thrown at it, dropped behind it or falling through it (even mid-cycle), ignores items further away.');}
