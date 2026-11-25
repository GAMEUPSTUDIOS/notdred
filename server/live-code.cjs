'use strict';
// Dev live code (host token only), shared by ships, zones and the whole-server console.
//  - log(...values) prints lines that come back with the result (also returns its last argument, so it can wrap an
//    expression: log('speed', ship.getLinearVelocity()).x);
//  - code containing `await` runs as an async function body: `return` what you want shown;
//  - after(seconds, fn) / every(seconds, fn) schedule code on the simulation's own clock (every returns an id;
//    cancel(id) or cancel() stops them); they run each tick for at most 100 ms, like devTick.
const vm = require('node:vm');

function showValue(v) {
  let out;
  if (v === undefined) return 'undefined';
  if (typeof v === 'function') return String(v).slice(0, 400);
  try { out = JSON.stringify(v, (k, x) => typeof x === 'number' ? +x.toFixed(4) : x instanceof Map ? Object.fromEntries(x) : x instanceof Set ? [...x] : x, 1); } catch { out = undefined; }
  if (out === undefined) try { out = String(v); } catch { out = '[value]'; }
  return out.length > 8000 ? out.slice(0, 8000) + '…' : out;
}

const HELPERS = `
globalThis.__logs=[];globalThis.__timers=globalThis.__timers||[];globalThis.__timerSeq=globalThis.__timerSeq||0;
globalThis.log=function(...a){const s=a.map(x=>{if(typeof x==='string')return x;try{const j=JSON.stringify(x,(k,v)=>typeof v==='number'?+v.toFixed(4):v);return j===undefined?String(x):j;}catch{return String(x);}}).join(' ');__logs.push(s.length>2000?s.slice(0,2000)+'…':s);if(__logs.length>300)__logs.shift();return a[a.length-1];};
globalThis.after=function(sec,fn){const id=++__timerSeq;__timers.push({id,at:(+sec||0),left:(+sec||0),fn,repeat:false});return id;};
globalThis.every=function(sec,fn){const id=++__timerSeq;const s=Math.max(1/60,+sec||1/60);__timers.push({id,at:s,left:s,fn,repeat:true});return id;};
globalThis.cancel=function(id){if(id==null){const n=__timers.length;__timers.length=0;return n+' timers stopped';}const i=__timers.findIndex(t=>t.id===id);if(i>=0)__timers.splice(i,1);return i>=0;};
globalThis.timers=function(){return __timers.map(t=>({id:t.id,every:t.repeat?t.at:null,in:+t.left.toFixed(2)}));};
globalThis.__devTimers=function(dt){for(const t of [...__timers]){t.left-=dt;if(t.left>0)continue;try{t.fn();}catch(e){log('timer '+t.id+' stopped: '+(e&&e.message||e));t.repeat=false;}if(t.repeat)t.left+=t.at;else{const i=__timers.indexOf(t);if(i>=0)__timers.splice(i,1);}}};
`;
function install(ctx) { if (!ctx.__liveReady) { vm.runInContext(HELPERS, ctx, {timeout: 1000}); ctx.__liveReady = true; } }

// Run code in a context. Returns a Promise of {result, logs}. Async code may take up to 5 s.
async function run(ctx, code, {timeout = 1000, before = null, after = null} = {}) {
  install(ctx);
  ctx.__logs = [];
  code = String(code);
  const src = /\bawait\b/.test(code) ? '(async()=>{' + code + '\n})()' : code;
  if (before) before();
  let v;
  try { v = vm.runInContext(src, ctx, {timeout, filename: 'live-code'}); } finally { if (after) after(); }
  if (v && typeof v.then === 'function') v = await Promise.race([v, new Promise((_, no) => setTimeout(() => no(Error('No result after 5 s')), 5000).unref?.())]);
  return {result: showValue(v), logs: [...(ctx.__logs || [])]};
}
// The per-tick timer pump (only when timers exist).
const pump = new vm.Script('__devTimers(1/60)', {filename: 'timers'});
function tickTimers(ctx) { if (!ctx.__timers?.length) return; try { pump.runInContext(ctx, {timeout: 100}); } catch (e) { ctx.__timers.length = 0; ctx.__logs?.push('timers stopped: ' + (e?.message || e)); } }

module.exports = {run, install, tickTimers, showValue};
