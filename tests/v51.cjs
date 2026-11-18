'use strict';
// v51: shield boosters charge before they heal (a bar shows the charge), one at a time; turret icons always come from
// the original pack's turret pieces.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');process.chdir(root);
const {createRoom}=require('../server/room.cjs'),era=require('../dist/modules/era.js'),codec=require('../dist/modules/save-codec.js');
const r={id:'S'};r.game=createRoom(null,{});r.game.join('cap','Cap',true,'captain');const run=r.game.run;const step=n=>{for(let i=0;i<n;i++)r.game.tick(1/60);};
const T=era.SHIELDS.boosterChargeSeconds;assert.ok(T>0);
run('zone="finch";setupZone(true);shipHP=100;bindCrew("cap");giveItem("booster",2);storeCrew();');
r.game.command('cap',{action:'select',slot:run('slots.indexOf("booster")')});r.game.command('cap',{action:'edit',aim:{x:0,y:0}});step(Math.ceil(60*era.SHIELDS.boosterUseSeconds)+5);
assert.equal(run('inventory.booster'),1,'booster spent when used');assert.ok(run('boosterLeft')>0,'charging');assert.ok(run('shipHP')<=100+era.SHIELDS.regenPerSecond*3,'no heal yet');
assert.ok(r.game.snapshot('cap').boosterLeft>0,'charge reaches the client for the bar');assert.ok(r.game.zone.exterior().booster,'and other ships');
r.game.command('cap',{action:'edit',aim:{x:0,y:0}});step(10);assert.equal(run('inventory.booster'),1,'a second booster waits while one charges');
const sv=codec.decode(codec.encode(JSON.parse(JSON.stringify(run('state()')))));assert.ok(sv.boosterLeft>0,'saved with the ship');
step(Math.ceil(60*T));assert.equal(run('boosterLeft'),0);assert.ok(run('shipHP')>=100+era.SHIELDS.boosterAmount,'heals when the charge completes');
const game=fs.readFileSync('dist/game.js','utf8');assert.ok(/function drawBoosterBar/.test(game)&&/if\(boosterLeft>0\)drawBoosterBar/.test(game),'bar drawn under the shield bar');
assert.ok(/turret:\['official-turret_action_rc'\]/.test(game)&&!/item-turret_rc'/.test(game),'RC turret icon from the pack pieces');
console.log('PASS: shield boosters charge for '+T+' s before healing (bar shown, one at a time, saved); turret icons from the original pack pieces.');
process.exit(0);
