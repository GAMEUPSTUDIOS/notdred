'use strict';
// v28 single-player rules: silica and icy glass, Canary seekers, Pits boulder pockets, turret ore, burst and auto
// turrets through turret controllers.
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');process.chdir(root);
const generator=require('../dist/zone-generator.js'),codec=require('../dist/modules/save-codec.js'),era=require('../dist/modules/era.js');
const elements={},element=()=>({style:{},classList:{toggle(){}},getContext:()=>({}),addEventListener(){},querySelectorAll:()=>[],showModal(){this.open=true},close(){this.open=false},textContent:'',open:false,innerHTML:''});
const s={ZoneGenerator:generator,ShipCodec:codec,planck:require('../dist/vendor/planck.min.js'),document:{querySelector:()=>element(),getElementById:id=>elements[id]??=element(),querySelectorAll:()=>[]},window:{addEventListener(){}},localStorage:{getItem(){return null},setItem(){}},requestAnimationFrame(){},setTimeout,clearTimeout,console};
vm.createContext(s);for(const f of ['era','construction','cargo','machinery','safeguards','combat','zones','missions','hatches','controller'])vm.runInContext(fs.readFileSync('dist/modules/'+f+'.js','utf8'),s);vm.runInContext(fs.readFileSync('dist/game.js','utf8'),s);
const run=c=>vm.runInContext('{'+c+'}',s);run('initialize()');
const ticks=n=>run(`for(let k=0;k<${n};k++)step(1/60)`);
const clear='initialize();for(const b of blocks.values())interior.destroyFixture(b.f);blocks.clear();for(const t of terrain.values())if(t.f)interior.destroyFixture(t.f);terrain.clear();for(const i of items)inside.destroyBody(i.body);items=[];for(const b of boxes)inside.destroyBody(b.body);boxes=[];player.setTransform(V(-4,1.8),0);';


const clr='initialize();for(const b of blocks.values())interior.destroyFixture(b.f);blocks.clear();for(const t of [...terrain.values()])if(!isStarterTile(t)){if(t.f)interior.destroyFixture(t.f);terrain.delete(key(t.x,t.y));}for(const i of items)inside.destroyBody(i.body);items=[];for(const b of boxes)inside.destroyBody(b.body);boxes=[];';
// --- Silica and glass ------------------------------------------------------------------------------------------------
{assert.deepEqual(JSON.parse(run('JSON.stringify(recipeNeeds("glass"))')),{silica:1},'glass is made from silica');
 for(const t of ['pusher','pusher_block'])assert.ok(run(`recipeNeeds("${t}").silica`)>0,t+' needs silica');
 run('initialize();activeFab=[...terrain.values()].find(t=>t.type==="fabricator");activeFab.kind="engineering";activeFab.materials={silica:3};activeFab.queue=[];craft("glass");for(let n=0;n<200;n++)tickFabricators(1/60)');assert.equal(run('items.filter(i=>i.type==="glass").reduce((n,i)=>n+i.count,0)'),2,'one silica → two glass');
 // Icy: a crate slides much further on glass than on blocks, and so does a player letting go of the keys.
 const slide=floor=>{run(clr+`for(let x=-4;x<=4;x++){if(${floor==='glass'})addTerrain("glass",x,2);else addBlock(x,2);}globalThis.c=spawnItem("iron",V(-3.5,1.1),V(3,0),16)`);ticks(60);return run('c.body.getPosition().x');};
 assert.ok(slide('glass')>slide('block')+1,'cargo slides on glass');
 const coast=floor=>{run(clr+`for(let x=-4;x<=4;x++){if(${floor==='glass'})addTerrain("glass",x,2);else addBlock(x,2);}player.setTransform(V(-3,.9),0);keys={d:true}`);ticks(40);run('keys={}');ticks(10);return Math.abs(run('player.getLinearVelocity().x'));};
 assert.ok(coast('glass')>1&&coast('block')<.2,'crew skid on glass, stop at once on blocks');
 console.log('PASS: silica — glass recipe (1 silica → 2 glass), pushers need silica, glass is icy for cargo and crew.');}

// --- Canary seekers ----------------------------------------------------------------------------------------------------
{run('initialize();startMission("canary");zone="canary";setupZone(true);botsPaused=false');
 const n=run('[...rocks.values()].filter(r=>r.kind==="seeker").length');assert.ok(n>=60,'lots of dormant seekers buried in the square ('+n+')');assert.equal(run('botsOf("seeker").length'),0,'dormant until shot');
 run('const r=[...rocks.values()].find(r=>r.kind==="seeker"&&[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>!rocks.has(key(r.x-dx*4,r.y-dy*4))&&!zoneSolid(r.x-dx*4,r.y-dy*4)))||(()=>{const r=[...rocks.values()].find(r=>r.kind==="seeker");for(const [dx,dy] of [[-1,0]])removeRock(key(r.x+dx*4,r.y+dy*4));return r;})();globalThis.sk=r;shots=[{type:"ammo",p:V(r.x-6,r.y),v:V(0,0),life:2,maxLife:2}];{let d=V(r.x-shots[0].p.x,r.y-shots[0].p.y);}');
 run('{const r=sk;const dirs=[[1,0],[-1,0],[0,1],[0,-1]];for(const [dx,dy] of dirs){const ox=r.x-dx*4,oy=r.y-dy*4;if(!rocks.has(key(ox,oy))){shots=[{type:"ammo",p:V(ox-dx*1.9,oy-dy*1.9),v:V(dx*90,dy*90),life:2,maxLife:2}];break;}}}');
 for(let k=0;k<20;k++)run('tickShots(1/60)');
 assert.equal(run('rocks.has(sk.id)'),false,'tile is gone');assert.equal(run('botsOf("seeker").length'),1,'a seeker woke up');
 run('const b=botsOf("seeker")[0];damageBot(1e9,"seeker",b.index)');assert.ok(run('worldLoot.some(i=>i.type==="silica")'),'dead seeker drops silica');
 assert.equal(run('Object.keys(zoneData.canary.bots||{}).includes("seeker")&&zoneData.canary.bots.seeker.some(r=>r?.dead)'),false,'seekers do not respawn');
 console.log('PASS: Canary seekers — dormant tiles, wake when shot, drop silica, never respawn.');}

// --- The Pits: hall, boulder shaft, buried treasure ------------------------------------------------------------------
{run('initialize();startMission("pits");piloting=true;player.setActive(false);travelZone("pits");botsPaused=true');
 const g=run('(()=>{const g=zoneGrid();return {pit:g.pit,minX:g.minX,minY:g.minY,cell:g.cell};})()');const cy=y=>g.minY+y*g.cell;
 assert.ok(run('ship.getPosition().y')>=cy(g.pit.hall.y0)&&run('ship.getPosition().y')<=cy(g.pit.hall.y1),'ships arrive in the hall');
 for(const q of JSON.parse(run('JSON.stringify(zonePortals())')))assert.ok(q.y>=cy(g.pit.hall.y0)&&q.y<=cy(g.pit.hall.y1),'portals in the hall');
 const kinds=JSON.parse(run('JSON.stringify([...new Set([...rocks.values()].map(r=>r.kind))].sort())'));assert.deepEqual(kinds.filter(k=>k!=='treasure'),['flux','hazard','ore','rock'],'hazard walls, diamond ore, flux blocks and rock');
 const nb=run('boulders.length');assert.ok(nb>=15,'the shaft is packed with boulders ('+nb+')');assert.ok(run('boulders.every(b=>b.r>0)'),'round boulders');
 // Boulders fall and pile up in the shaft (gravity), but stay above the treasure band.
 run('for(let k=0;k<240;k++)world.step(1/60)');assert.ok(run(`boulders.every(b=>b.body.getPosition().y<${cy(g.pit.band.y0)})`),'boulders rest on the treasure');
 // Hazard walls cannot be shot through or mined.
 run('const h=[...rocks.values()].find(r=>r.kind==="hazard"&&!rocks.has(key(r.x-4,r.y))&&!zoneSolid(r.x-4,r.y));globalThis.hz=h;shots=[{type:"breaker",p:V(h.x-3.6,h.y),v:V(110,0),life:2,maxLife:2}];for(let k=0;k<10;k++)tickShots(1/60)');
 assert.equal(run('rocks.has(hz.id)'),true,'hazard wall survives a breaker round');
 // A ship can shove boulders: drive one sideways.
 run('globalThis.top=boulders.reduce((a,b)=>a.body.getPosition().y<b.body.getPosition().y?a:b);globalThis.bp={...top.body.getPosition()};top.body.applyLinearImpulse(V(0,-top.body.getMass()*25),top.body.getWorldCenter(),true);for(let k=0;k<10;k++)world.step(1/60)');assert.ok(run('bp.y-top.body.getPosition().y')>.5,'boulders can be shoved');
 // Boulders come in many sizes and fill all three holes, which fan out going up.
 const radii=JSON.parse(run('JSON.stringify(boulders.map(b=>b.r))'));assert.ok(Math.max(...radii)-Math.min(...radii)>3,'boulders of varying size ('+Math.min(...radii).toFixed(1)+'–'+Math.max(...radii).toFixed(1)+')');
 // Three separate holes, each with its own loot room: below the hall they never connect, and they fan out going up.
 const holes=run(`(()=>{const g=zoneGrid(),W=g.width,seen=new Int8Array(g.solid.length).fill(-1);return g.pit.rooms.map((r,n)=>{const q=[[r.x0+1,r.y0]];let other=false,cells=0;while(q.length){const [x,y]=q.pop(),i=y*W+x;if(y<=g.pit.hall.y1||g.solid[i]||seen[i]===n)continue;if(seen[i]>=0)other=true;seen[i]=n;cells++;q.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);}
  const loot=[...rocks.values()].filter(k=>{const gx=Math.round((k.x-g.minX)/g.cell);return gx>=r.x0&&gx<=r.x1&&k.y>g.minY+r.y1*g.cell;});return {other,cells,ore:loot.filter(k=>k.kind==='ore').length,flux:loot.filter(k=>k.kind==='flux').length,treasure:loot.filter(k=>k.kind==='treasure').length,
  boulders:boulders.filter(b=>{const p=b.body.getPosition(),gx=(p.x-g.minX)/g.cell;return Math.abs(gx-(r.x0+r.x1)/2)<14;}).length};});})()`);
 assert.equal(holes.length,3,'three holes');for(const [n,h] of holes.entries()){assert.equal(h.other,false,'hole '+n+' is walled off from the others below the hall');assert.ok(h.ore>0&&h.flux>0,'hole '+n+' has its own ore and flux');assert.ok(h.treasure>0,'hole '+n+' has its own treasure');assert.ok(h.boulders>0,'hole '+n+' is choked with boulders');}
 const holeX=(y,k)=>{const L=g.pit.holes.list[k];return L.bottomX+(L.topX-L.bottomX)*(g.pit.holes.bottom-y)/(g.pit.holes.bottom-g.pit.holes.top);};assert.ok(holeX(g.pit.holes.top,2)-holeX(g.pit.holes.top,0)>holeX(g.pit.holes.bottom,2)-holeX(g.pit.holes.bottom,0)+10,'holes fan out going up');
 // Yank pulls a boulder toward the shooter; punch shoves it away. Ordinary rounds barely move it.
 const kick=t=>run(`(()=>{const b=boulders.reduce((a,c)=>a.r>c.r?a:c);b.body.setLinearVelocity(V(0,0));const p=b.body.getPosition();shots=[{type:"${t}",p:V(p.x,p.y-b.r-3),v:V(0,90),life:2,maxLife:2}];for(let k=0;k<6;k++)tickShots(1/60);return b.body.getLinearVelocity().y;})()`);
 const vy={punch:kick('punch'),yank:kick('yank'),ammo:kick('ammo')};assert.ok(vy.punch>4,'punch shoves the boulder away ('+vy.punch.toFixed(1)+')');assert.ok(vy.yank<-4,'yank drags it toward the shooter ('+vy.yank.toFixed(1)+')');assert.ok(Math.abs(vy.ammo)<1,'a normal round barely moves it');
 // Treasure appears only in the treasure band's rock; turret ore drops RC/burst/auto with equal odds.
 assert.ok(run(`[...rocks.values()].filter(r=>r.kind==="treasure").every(r=>r.y>=${cy(g.pit.band.y0)})`),'treasure is buried at the bottom');
 const drops=[0,.4,.8].map(roll=>run(`initialize();zone="finch";setupZone(true);worldLoot.splice(0);const r=[...rocks.values()].find(r=>r.kind==="ore");mineRock(r.id,${roll});worldLoot.find(i=>i.type.startsWith("turret")).type`));
 assert.deepEqual(drops,['turret','turret_burst','turret_auto'],'turret ore: RC, burst or auto');
 console.log('PASS: The Pits — hazard-walled hall with the portals, three separate fanning holes, each with its own loot room, choked with boulders of many sizes (yank pulls them out, punch shoves them), buried diamond ore/flux/treasure at the bottom; hazard walls unbreakable; turret ore drops RC/burst/auto.');}

// --- Burst and auto turrets through hull turret controllers ----------------------------------------------------------
{const setup='initialize();zone="finch";setupZone(true);botsPaused=true;for(const m of [...mounts])if(m.type==="turret"){ship.destroyFixture(m.f);mounts.splice(mounts.indexOf(m),1);}';
 const place=(type,x,y)=>run(`giveItem("${type}",1);selectSlot(slots.indexOf("${type}"));commitBuild({x:${x},y:${y}},"${type}",0)`);
 run(setup);place('turret_burst','bounds.r',-3);place('turret_auto','bounds.l',-3);
 assert.deepEqual(JSON.parse(run('JSON.stringify(mounts.filter(m=>m.type==="turret").map(m=>m.kind).sort())')),['auto','burst'],'both turrets placed');
 assert.equal(run('turretCapacity(mounts.find(m=>m.kind==="burst"))'),32,'burst holds 32');
 // The controller only goes on the hull — never on the floor inside.
 assert.ok(run('validity({x:0,y:-1},"turret_controller")')!=='','not inside the ship');
 place('turret_controller','bounds.r',0);assert.equal(run('mounts.filter(m=>m.type==="turret_controller"&&m.side==="right").length'),1,'placed in the right wall');
 run('for(const m of mounts)if(m.type==="turret"){m.ammo=turretCapacity(m);m.ammoType="ammo";}player.setTransform(V(bounds.r-1.2,1.8),0)');
 run('interact()');assert.equal(run('manning'),'right:0','manning the wall controller');
 assert.deepEqual(JSON.parse(run('JSON.stringify(controlledTurrets(controllerByKey(manning)).map(m=>m.kind))')),['burst'],'it works the turrets in its own wall only');
 // The pilot's RC fire does not fire these turrets.
 run('piloting=true;W=H=0;zoom=1;cam={x:0,y:0};const sp=ship.getPosition();mouse={x:sp.x+40,y:sp.y-10,active:true};fireRC();piloting=false');assert.equal(run('mounts.find(m=>m.kind==="burst").ammo'),32,'not an RC');
 // One trigger pull: a 4-round burst.
 run('const sp=ship.getPosition();mouse={x:sp.x+40,y:sp.y-6,active:true};controllerFire();for(let k=0;k<40;k++)tickTurrets(1/60)');assert.equal(run('mounts.find(m=>m.kind==="burst").ammo'),32-era.TURRETS.burst.burst,'one burst');
 // The auto turret on the left wall needs a controller in the left wall; then holding the trigger keeps it firing.
 run('keys={d:true};stepController(1/60);keys={}');assert.equal(run('manning'),null,'walking leaves the controller');
 place('turret_controller','bounds.l',0);run('player.setTransform(V(bounds.l+1.2,1.8),0);interact();const sp=ship.getPosition();mouse={x:sp.x-40,y:sp.y-6,active:true};pusherHeld=true;for(let k=0;k<60;k++){stepController(1/60);tickTurrets(1/60);}pusherHeld=false');
 assert.equal(run('manning'),'left:0');assert.ok(run('mounts.find(m=>m.kind==="auto").ammo')<=16-5,'auto fire while held');
 // Save, reload and wrench back the right items.
 const sv=JSON.parse(JSON.stringify(run('state()')));run(`initialize(${JSON.stringify(codec.decode(codec.encode(sv)))})`);assert.equal(run('mounts.filter(m=>m.type==="turret_controller").length'),2,'controllers saved');assert.equal(run('mountItem(mounts.find(m=>m.kind==="burst"))'),'turret_burst');
 // Up to four turrets per controller; a fifth on the same wall needs a second controller.
 run(setup+'bounds={l:-5,r:5,t:-20,b:3};rebuildShell();rebuildMounts();updateShipMass();for(const m of [...mounts])if(m.side==="right"){ship.destroyFixture(m.f);mounts.splice(mounts.indexOf(m),1);}');
 for(const y of [-19,-16,-13,-10,-7])place('turret_burst','bounds.r',y);place('turret_controller','bounds.r',-4);
 assert.equal(run('mounts.filter(m=>m.kind==="burst"&&m.side==="right").length'),5);
 assert.equal(run('controlledTurrets(mounts.find(m=>m.type==="turret_controller")).length'),4,'one controller works four');
 place('turret_controller','bounds.r',-1);assert.deepEqual(JSON.parse(run('JSON.stringify(mounts.filter(m=>m.type==="turret_controller").sort((a,b)=>a.at-b.at).map(c=>controlledTurrets(c).length))')),[4,1],'the second picks up the fifth');
 // A floor controller from the earlier build is returned to the inventory on load.
 run('initialize();terrain.set(key(0,-1),{type:"turret_controller",x:0,y:-1,rotation:0});repairAmmoTypes()');assert.ok(run('inventory.turret_controller>=1&&!terrainAt({x:0,y:-1})'),'old floor controllers refunded');
 console.log('PASS: turret controllers — hull-only, work up to 4 burst/auto turrets in their own wall (a second controller for more), burst per pull, auto while held, saved and refunded.');}

// --- Silver bots: Finch II and Sparrow I only; they drop iron ---------------------------------------------------------------
{for(const z of Object.keys(era.ZONES))run(`initialize();zone="${z}";setupZone(true)`),assert.equal(run('botsOf("silver").length'),['finch2','sparrow'].includes(z)?era.ZONES[z].bots.silver:0,z+' silver bots');
 run('initialize();zone="finch2";setupZone(true);worldLoot.splice(0);const b=botsOf("silver")[0];damageBot(1e9,"silver",b.index)');assert.ok(run('worldLoot.some(i=>i.type==="iron"&&i.count===16)'),'silver bots drop iron');
 console.log('PASS: silver bots — only in Finch II and Sparrow I, drop iron.');}
