'use strict';
// C++ core: the zone generator gives exactly the JavaScript's grids (every cell's solid/centre/kind, start, size,
// connectors, layout fields) for every zone in era.js and a spread of seeds, in both builds.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');process.chdir(root);
const ZG=require('../dist/zone-generator.js'),era=require('../dist/modules/era.js'),native=require('../server/core.cjs'),{loadCore}=require('../dist/core-wasm.js');
(async()=>{const wasm=await loadCore(fs.readFileSync('dist/core.wasm'),fs.readFileSync('dist/core-data.json','utf8'));let checks=0;
 const seeds=[0,1,7,12345,987654321,2147483647,-5,4294967295,123.5];
 for(const [id,z] of Object.entries(era.ZONES))if(z.gen)for(const seed of seeds){const js=ZG.generate(seed,z.gen),want=JSON.parse(JSON.stringify({...js,solid:Array.from(js.solid),centers:Array.from(js.centers),...(js.kinds?{kinds:Array.from(js.kinds)}:{})}));
  for(const [name,core] of [['native',native],['wasm',wasm]]){const got=core.call({op:'zone.generate',seed,opts:z.gen});
   for(const k of Object.keys(want))assert.equal(JSON.stringify(got[k]),JSON.stringify(want[k]),`${name} · ${id} seed ${seed}: ${k}`);checks++;}}
 // the defaults (no options) and small custom ones
 for(const opts of [{},{width:41,height:25,threshold:.5,salt:3},{layout:'pit'},{layout:'block',width:31,ring:4}])for(const seed of [3,99]){const js=ZG.generate(seed,opts),want=JSON.parse(JSON.stringify({...js,solid:Array.from(js.solid),centers:Array.from(js.centers),...(js.kinds?{kinds:Array.from(js.kinds)}:{})}));
  for(const [name,core] of [['native',native],['wasm',wasm]]){const got=core.call({op:'zone.generate',seed,opts});for(const k of Object.keys(want))assert.equal(JSON.stringify(got[k]),JSON.stringify(want[k]),`${name} · ${JSON.stringify(opts)} seed ${seed}: ${k}`);checks++;}}
 console.log('PASS: C++ core zone generator — every zone and seed gives the JavaScript grid exactly, in both builds ('+checks+' grids).');process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
