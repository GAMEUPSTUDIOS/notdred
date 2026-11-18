'use strict';
// v52: turrets, turret controllers and thrusters can't be rotated — they always face out from their hull wall.
const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');process.chdir(root);
const {createRoom}=require('../server/room.cjs'),codec=require('../dist/modules/save-codec.js');
const r={id:'T'};r.game=createRoom(null,{});r.game.join('cap','Cap',true,'captain');const run=r.game.run;
run('bindCrew("cap");');
// Placing with a turned build rotation still gives an unrotated mount.
for(const t of ['turret','thruster','turret_controller']){const c=run(`(()=>{for(let x=bounds.l+1;x<bounds.r;x++){const m=mountAt({x,y:bounds.t},"${t}");if(m&&mountValid(m))return {x,y:bounds.t};}})()`);
 assert.ok(c,'room for a '+t);run(`buildRotation=1;giveItem("${t}",1);selectSlot(slots.indexOf("${t}"));commitBuild(${JSON.stringify(c)},"${t}",1);`);
 const m=run(`(m=>m&&{type:m.type,rotation:m.rotation||0})(mountHit(${JSON.stringify(c)}))`);assert.ok(m,t+' placed');assert.equal(m.rotation,0,t+' not rotated');
 // R (with the wrench, or holding the item) refuses.
 run(`tool="walk";globalThis.cursorCell=()=>(${JSON.stringify(c)});rotateSelection();`);assert.equal(run(`mountHit(${JSON.stringify(c)}).rotation||0`),0,'R does not turn the '+t);
 const before=run('buildRotation');run(`tool="${t}";rotateSelection();`);assert.equal(run('buildRotation'),before,'R with a '+t+' in hand does nothing');}
// Old saves with rotated mounts load facing out of their wall.
const sv=JSON.parse(JSON.stringify(run('state()')));for(const m of sv.mounts)m.rotation=2;const r2=createRoom(codec.decode(codec.encode(sv)),{});r2.join('c','C',true,'captain');
assert.ok(r2.run('mounts.every(m=>!m.rotation)'),'rotation dropped on load');
// Handheld pusher: pushes a stack, its beam reaches the snapshot (own crew and other ships), and it has its own icon.
run('bindCrew("cap");for(const i of [...items])inside.destroyBody(i.body);items.length=0;');const fy=run('bounds.b-1');run(`player.setTransform(V(-4,${fy}),0);storeCrew();globalThis.it=spawnItem("iron",V(2,${fy}),V(0,0),5);giveItem("pusher",1);storeCrew();`);
for(let i=0;i<30;i++)r.game.tick(1/60);r.game.command('cap',{action:'select',slot:run('(bindCrew("cap"),slots.indexOf("pusher"))')});const wp=run(`(p=>({x:p.x,y:p.y}))(ship.getWorldPoint(V(2,${fy})))`),x0=run('it.body.getPosition().x');
for(let k=0;k<20;k++){r.game.command('cap',{action:'input',keys:{},held:true,aim:wp});r.game.tick(1/60);r.game.tick(1/60);}
assert.ok(run('it.body.getPosition().x')>x0+.5,'the handheld pusher pushes a stack 6 tiles away');assert.equal(run('HAND_PUSHER_RANGE'),1000);assert.ok(Array.isArray(r.game.snapshot('cap').crew[0].beam),'beam in the snapshot');assert.ok(Array.isArray(r.game.zone.exteriorCrew()[0].b),'beam for other ships');
assert.ok(/pusher:\['item-pusher_hand'/.test(require('node:fs').readFileSync('dist/game.js','utf8'))&&require('node:fs').existsSync('dist/sprites/item-pusher_hand.png'),'handheld pusher icon');
// Right click on a recycler recycles what's in hand (online: the 'remove' action), tools included; Shift + right click with the wrench dismantles it.
{const g=createRoom(null,{});g.join('c','C',true,'captain');const run2=g.run,st=n=>{for(let i=0;i<n;i++)g.tick(1/60);};run2('bindCrew("c");for(const t of [...terrain.values()])if(t.body){inside.destroyBody(t.body);terrain.delete(t.key);}');const fy2=run2('bounds.b-1');
 run2(`globalThis.rc=spawnMachine("recycler",V(1.5,${fy2-1}));player.setTransform(V(-1,${fy2}),0);storeCrew();`);const aim=run2(`(p=>({x:p.x,y:p.y}))(ship.getWorldPoint(V(1.5,${fy2-1})))`);
 for(const t of ['wrench','shredder','pusher']){run2(`bindCrew("c");giveItem("${t}",1);storeCrew();`);g.command('c',{action:'select',slot:run2(`(bindCrew("c"),slots.indexOf("${t}"))`),aim});g.command('c',{action:'remove',aim});
  assert.equal(run2(`(bindCrew("c"),slots.filter(x=>x==="${t}").length)`),t==='wrench'?1:0,t+' went into the recycler');assert.ok(run2('!!rc.job'),t+' is being recycled');st(240);assert.ok(!run2('rc.job'),'done');}
 assert.equal(run2('items.filter(i=>i.type==="pusher_block").length'),1,'the handheld pusher came out as a stationary pusher');
 run2('bindCrew("c");giveItem("wrench",1);storeCrew();');g.command('c',{action:'select',slot:run2('(bindCrew("c"),slots.indexOf("wrench"))'),aim});g.command('c',{action:'input',keys:{shift:true},held:false,aim});g.command('c',{action:'remove',aim});
 assert.ok(run2('![...terrain.values()].some(t=>t.type==="recycler")'),'Shift + right click with the wrench dismantles the recycler');}
console.log('PASS: right click on a recycler recycles what you hold (wrench, shredder, handheld pusher); Shift + right click with the wrench dismantles it.');
console.log('PASS: handheld pusher pushes, its beam reaches every client, own icon.');
console.log('PASS: turrets, turret controllers and thrusters can\'t be rotated (placing, R, old saves).');
process.exit(0);
