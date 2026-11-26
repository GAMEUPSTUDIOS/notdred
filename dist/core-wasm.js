// Loads the C++ game core's WebAssembly build (dist/core.wasm) in the page, or in Node for tests:
//   const core=await loadCore(wasmBytesOrResponse, dataJSON); core.call({op:'rule',fn:'shipMaxHP',args:[bounds]})
// The core needs almost nothing from WASI: a clock, random bytes and stderr for messages; the rest are stubs.
(function(root){
'use strict';
async function loadCore(source,data){
 let mem=null,lastError='';const enc=new TextEncoder(),dec=new TextDecoder();
 const wasi={fd_write(fd,iovs,n,written){const v=new DataView(mem.buffer);let s='',t=0;for(let i=0;i<n;i++){const p=v.getUint32(iovs+i*8,true),l=v.getUint32(iovs+i*8+4,true);s+=dec.decode(new Uint8Array(mem.buffer,p,l));t+=l;}v.setUint32(written,t,true);if(s.trim()){lastError=s.trim();if(!/^core error:/.test(lastError))console.warn('[core]',s.trimEnd());}return 0;},
  fd_close:()=>0,fd_seek:()=>70,fd_fdstat_get:()=>8,fd_prestat_get:()=>8,fd_prestat_dir_name:()=>8,environ_sizes_get(c,s){const v=new DataView(mem.buffer);v.setUint32(c,0,true);v.setUint32(s,0,true);return 0;},environ_get:()=>0,
  args_sizes_get(c,s){const v=new DataView(mem.buffer);v.setUint32(c,0,true);v.setUint32(s,0,true);return 0;},args_get:()=>0,
  clock_time_get(id,prec,out){new DataView(mem.buffer).setBigUint64(out,BigInt(Math.round(performance.now()*1e6)),true);return 0;},
  random_get(p,n){const a=new Uint8Array(mem.buffer,p,n);for(let i=0;i<n;i++)a[i]=Math.random()*256|0;return 0;},proc_exit(c){throw Error('core exited ('+c+')');},sched_yield:()=>0};
 const imports={wasi_snapshot_preview1:new Proxy(wasi,{get:(o,k)=>o[k]||(()=>52)})};
 let inst;if(typeof Response!=='undefined'&&source instanceof Response)inst=(await WebAssembly.instantiateStreaming(source,imports)).instance;else inst=(await WebAssembly.instantiate(source,imports)).instance;
 const x=inst.exports;mem=x.memory;x._initialize?.();
 function callText(text){const b=enc.encode(text),p=x.nd_alloc(b.length);new Uint8Array(mem.buffer,p,b.length).set(b);let r;lastError='';try{r=x.nd_call(p,b.length);}catch(e){core.broken=true;throw Error(lastError||String(e));}x.nd_free(p);return dec.decode(new Uint8Array(mem.buffer,r,x.nd_result_len()));}
 const core={broken:false,callText,call(req){const r=JSON.parse(callText(JSON.stringify(req)));if(r&&r.error)throw Error('core: '+r.error);return r;}};
 if(data!=null)core.call({op:'init',data:typeof data==='string'?data:JSON.stringify(data)});
 return core;}
root.loadCore=loadCore;if(typeof module!=='undefined'&&module.exports)module.exports={loadCore};
})(typeof window!=='undefined'?window:globalThis);
