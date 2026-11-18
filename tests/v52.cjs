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
run('bindCrew("cap");for(const i of [...items])inside.destroyBody(i.body);items.length=0;');const fy=run('bounds.b-1');run(`player.setTransform(V(-2,${fy}),0);storeCrew();globalThis.it=spawnItem("iron",V(1,${fy}),V(0,0),5);giveItem("pusher",1);storeCrew();`);
for(let i=0;i<30;i++)r.game.tick(1/60);r.game.command('cap',{action:'select',slot:run('(bindCrew("cap"),slots.indexOf("pusher"))')});const wp=run(`(p=>({x:p.x,y:p.y}))(ship.getWorldPoint(V(1,${fy})))`),x0=run('it.body.getPosition().x');
for(let k=0;k<20;k++){r.game.command('cap',{action:'input',keys:{},held:true,aim:wp});r.game.tick(1/60);r.game.tick(1/60);}
assert.ok(run('it.body.getPosition().x')>x0+.5,'the handheld pusher pushes');assert.ok(Array.isArray(r.game.snapshot('cap').crew[0].beam),'beam in the snapshot');assert.ok(Array.isArray(r.game.zone.exteriorCrew()[0].b),'beam for other ships');
assert.ok(/pusher:\['item-pusher_hand'/.test(require('node:fs').readFileSync('dist/game.js','utf8'))&&require('node:fs').existsSync('dist/sprites/item-pusher_hand.png'),'handheld pusher icon');
console.log('PASS: handheld pusher pushes, its beam reaches every client, own icon.');
console.log('PASS: turrets, turret controllers and thrusters can\'t be rotated (placing, R, old saves).');
process.exit(0);
