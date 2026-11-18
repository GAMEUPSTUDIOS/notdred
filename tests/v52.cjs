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
console.log('PASS: turrets, turret controllers and thrusters can\'t be rotated (placing, R, old saves).');
process.exit(0);
