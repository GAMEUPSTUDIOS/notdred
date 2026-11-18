'use strict';
// One classic-mode player's renderer, in its own worker thread so drawing never stalls the game server's 60 Hz loop.
// It keeps the headless client (classic-view.cjs) up to date with every snapshot and draws a JPEG on a steady clock
// (30 fps by default) for as long as the player keeps asking for pictures. If drawing takes longer than the frame
// budget on a busy machine, the clock slows down instead of falling behind.
const {parentPort,workerData}=require('node:worker_threads');
const {viewFactory}=require('./classic-view.cjs');
const view=viewFactory(workerData.root)(str=>parentPort.postMessage({t:'out',str}));
const FPS=workerData.fps||30;let cfg={w:640,h:400,z:20,q:.6},wantUntil=0,seq=0,timer=null,lastStatus='';
function tick(){timer=null;const start=performance.now();
 if(Date.now()<wantUntil){try{const jpg=view.render(cfg.w,cfg.h,cfg.z,cfg.q);seq++;const buf=jpg.buffer.slice(jpg.byteOffset,jpg.byteOffset+jpg.length);parentPort.postMessage({t:'frame',seq,buf,ms:performance.now()-start},[buf]);}catch(e){parentPort.postMessage({t:'error',message:String(e.message)});}}
 const spent=performance.now()-start;timer=setTimeout(tick,Math.max(1000/FPS-spent,spent*.25,2));}
// Status for the page around the picture (shields, slots, crew, fabricator), sent when it changes.
setInterval(()=>{let st=null;try{st=view.status();}catch{}const k=JSON.stringify(st);if(k!==lastStatus){lastStatus=k;parentPort.postMessage({t:'status',st});}},250);
parentPort.on('message',m=>{try{
 if(m.t==='snap')view.receive(m.str);
 else if(m.t==='welcome')view.welcome(m.m);
 else if(m.t==='joined')view.joined(m.m,m.name);
 else if(m.t==='left')view.left();
 else if(m.t==='want'){cfg={w:m.w,h:m.h,z:m.z,q:m.q};wantUntil=Date.now()+1500;if(!timer)tick();}
 else if(m.t==='key')view.key(m.type,m.key,m.shift,m.repeat);
 else if(m.t==='mouse')view.mouse(m.x,m.y,m.button,m.w,m.h);
 else if(m.t==='craft')view.craft(m.item,m.n);
 else if(m.t==='insert')view.insert();
 else if(m.t==='closefab')view.closeFab();
}catch(e){parentPort.postMessage({t:'error',message:String(e.message)});}});
parentPort.postMessage({t:'ready'});
