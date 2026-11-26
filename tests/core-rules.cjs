'use strict';
// C++ core, stage 1: the game data file is current, both builds (native for the server, WebAssembly for the page)
// load it, and the small era.js rules give exactly the JavaScript results for every zone, item, turret and a spread
// of ship sizes and names.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');process.chdir(root);
execFileSync(process.execPath,['tools/core-data.cjs','--check'],{stdio:'pipe'});
const {createRoom}=require('../server/room.cjs');const js=createRoom(null,{});const J=code=>JSON.parse(js.run('JSON.stringify('+code+')'));
const native=require('../server/core.cjs'),{loadCore}=require('../dist/core-wasm.js');
(async()=>{const wasm=await loadCore(fs.readFileSync('dist/core.wasm'),fs.readFileSync('dist/core-data.json','utf8'));
 let checks=0;
 const same=(fn,args,jsCode,label)=>{const want=J(jsCode);for(const [name,core] of [['native',native],['wasm',wasm]]){const got=core.call({op:'rule',fn,args}).result;
  assert.equal(JSON.stringify(got),JSON.stringify(want??null),name+' '+fn+'('+(label||JSON.stringify(args))+')');checks++;}};
 const zones=Object.keys(J('ZONES'));
 for(const z of [...zones,'nowhere'])same('zoneHalf',[z],`zoneHalf(${JSON.stringify(z)})`),same('isCombatZone',[z],`isCombatZone(${JSON.stringify(z)})`),same('zoneDef',[z],`zoneDef(${JSON.stringify(z)})`);
 let seed=7;const rnd=n=>(seed=(seed*16807)%2147483647)%n;
 for(let k=0;k<60;k++){const l=-rnd(40),t=-rnd(40),b={l,r:l+5+rnd(75),t,b:t+4+rnd(75)};for(const f of ['shipMaxHP','shipSize','shipExpansions'])same(f,[b],`${f}(${JSON.stringify(b)})`);}
 for(const z of [...zones,'nowhere'])for(const size of [0,50,88,110,111,150,219,220,221,609,6400])same('pvpMultiplier',[size,z],`pvpMultiplierFor(${size},${JSON.stringify(z)})`);
 for(const m of [{},{starterRC:true},{kind:'burst'},{kind:'auto',ammoType:'sniper'},{kind:'turret',ammoType:'ammo'},{kind:'nonsense',ammoType:'slug'},{starterRC:true,ammoType:'flak'}])
  same('turretReload',[m],`turretReload(${JSON.stringify(m)})`),same('turretCapacity',[m],`turretCapacity(${JSON.stringify(m)})`);
 for(const t of [...J('TYPES'),'nothing','fabricator','trash'])same('itemMaxHp',[t],`itemMaxHp(${JSON.stringify(t)})`),same('isAmmo',[t],`isAmmo(${JSON.stringify(t)})`),same('recipeNeeds',[t],`recipeNeeds(${JSON.stringify(t)})`);
 const names=['','  Rusty   Kettle  ','<b>bold</b>','a\u0000b\u001fc\n\td','  spaced　out﻿','x'.repeat(40),'😀'.repeat(20),'ab'+'😀'.repeat(16),'Ünïcødé  ship','tab\tand line'];
 for(const n of names){const want=J(`cleanShipName(${JSON.stringify(n)})`).replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g,'�');
  for(const [name,core] of [['native',native],['wasm',wasm]]){assert.equal(core.call({op:'rule',fn:'cleanShipName',args:[n]}).result,want,name+' cleanShipName('+JSON.stringify(n)+')');checks++;}}
 js.dispose?.();console.log('PASS: C++ core stage 1 — data file current; native and WebAssembly builds match the JavaScript rules ('+checks+' checks: zones, ship sizes, shields, PvP scaling, turrets, item health, recipes, ship names).');process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
