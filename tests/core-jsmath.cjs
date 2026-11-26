'use strict';
// C++ core: jsmath (V8 12.4's fdlibm, copied into the core) gives Node's Math functions bit for bit, in both builds —
// over random doubles of every magnitude, the special values, and the inputs the game itself feeds them (terrain
// hashes, angles, distances). Run under the Node the server uses (22): another V8 may round differently.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');process.chdir(root);
const native=require('../server/core.cjs'),{loadCore}=require('../dist/core-wasm.js');
const buf=new ArrayBuffer(8),f64=new Float64Array(buf),u64=new BigUint64Array(buf);
const hex=d=>{f64[0]=d;return u64[0].toString(16).padStart(16,'0');};
let seed=12345;const rnd=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
const special=[0,-0,1,-1,Infinity,-Infinity,NaN,Number.MIN_VALUE,-Number.MIN_VALUE,Number.MAX_VALUE,-Number.MAX_VALUE,Math.PI,-Math.PI,Math.PI/2,Math.PI/4,2*Math.PI,1e-300,1e300,0.5,-0.5,2,1e-8,709.78,-745.1,1e22,2**53,2**1023];
function inputs(kind,n){const a=[...special];
 for(let i=0;i<n;i++){const r=rnd();
  if(kind==='angle')a.push((r-.5)*20);
  else if(kind==='unit')a.push(r*2-1);
  else if(kind==='pos')a.push(Math.exp((r-.5)*80));
  else if(kind==='wide')a.push((rnd()<.5?-1:1)*Math.pow(10,(r-.5)*600));
  else a.push((r-.5)*2e6);}
 return a;}
// The game's own inputs: terrain hashes over the zone grids (x*127.1+y*311.7) and finch noise coordinates.
const game=[];for(let x=-200;x<=200;x+=1)for(let y=-120;y<=120;y+=3)game.push(x*127.1+y*311.7,x*12.9898+y*78.233,x/23+31);
const one={acos:['unit'],acosh:['pos'],asin:['unit'],asinh:['wide'],atan:['wide','angle'],cos:['angle','wide','big'],exp:['angle','pos'],atanh:['unit'],log:['pos','wide'],log1p:['pos'],log2:['pos'],log10:['pos'],expm1:['angle'],cbrt:['wide'],sin:['angle','wide','big'],tan:['angle','big'],cosh:['angle'],sinh:['angle'],tanh:['angle']};
const two={atan2:[['angle','angle'],['wide','wide']],pow:[['pos','angle'],['pos','unit'],['angle','angle']],hypot:[['angle','angle'],['wide','wide'],['big','big']]};
(async()=>{const wasm=await loadCore(fs.readFileSync('dist/core.wasm'),fs.readFileSync('dist/core-data.json','utf8'));let checks=0;
 const run=(fn,a,b)=>{const want=a.map((x,i)=>hex(b?Math[fn](x,b[i]):Math[fn](x)));
  for(const [name,core] of [['native',native],['wasm',wasm]]){const got=core.call({op:'math',fn,a:a.map(hex),...(b?{b:b.map(hex)}:{})}).r;
   for(let i=0;i<a.length;i++)if(got[i]!==want[i])assert.fail(`${name} Math.${fn}(${a[i]}${b?','+b[i]:''}): core ${got[i]} js ${want[i]}`);checks+=a.length;}};
 for(const [fn,kinds] of Object.entries(one))for(const k of kinds)run(fn,inputs(k,20000));
 for(const fn of ['sin','cos','atan','exp','log'])run(fn,game);
 for(const [fn,pairs] of Object.entries(two))for(const [ka,kb] of pairs){const a=inputs(ka,20000),b=inputs(kb,20000);
  // every special against every special too
  for(const x of special)for(const y of special){a.push(x);b.push(y);}run(fn,a,b);}
 console.log('PASS: C++ core jsmath — Math functions bit for bit with Node '+process.versions.node+' (V8 '+process.versions.v8+') in both builds ('+checks+' values).');process.exit(0);
})().catch(e=>{console.error(e.message||e);process.exit(1);});
