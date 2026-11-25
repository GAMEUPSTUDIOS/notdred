'use strict';
// v70: ships spawn in a Freeport at a random free spot, never docked — new ships, ships loaded from the ship list
// (even one saved docked), and ships left in a combat zone (they come back in the Freeport tied to that zone).
const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{WebSocket}=require('ws');
const root=path.resolve(__dirname,'..');process.chdir(root);const era=require('../dist/modules/era.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),PORT=29000+Math.floor(Math.random()*900),dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'fp-v70-')),DEV='v70-dev-token-123';
const log=[];const srv=spawn(process.execPath,['server/server.cjs','--port',String(PORT)],{cwd:root,env:{...process.env,DATA_DIR:dataDir,DEV_TOKEN:DEV,SAVE_INTERVAL_MS:'250',IDLE_UNLOAD_MS:'500',SHIP_RETURN_MS:'3600000'}});srv.stderr.on('data',d=>log.push(String(d)));
let seq=0;
function client(name){return new Promise(res=>{const ws=new WebSocket(`ws://127.0.0.1:${PORT}/play`,{headers:{origin:`http://127.0.0.1:${PORT}`}});const c={name,ws,snap:null,waiting:new Map()};
 ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='hello')ws.send(JSON.stringify({type:'hello',protocol:1,name,devToken:DEV}));if(m.type==='welcome')res(c);if(m.type==='joined'){c.room=m.room;c.snap=null;}if(m.type==='snapshot')c.snap=m.state;if(m.type==='evalResult'){const w=c.waiting.get(m.id);if(w){c.waiting.delete(m.id);w(m);}}});
 c.send=o=>ws.send(JSON.stringify(o));c.eval=code=>new Promise(r=>{const id=++seq;c.waiting.set(id,r);c.send({type:'eval',id,code});});});}
const until=async(f,ms=5000,label='condition')=>{const t=Date.now();while(!(await f())){if(Date.now()-t>ms)throw Error('Timed out: '+label);await sleep(40);}};
const val=async(c,code)=>{const r=await c.eval(code);if(!r.ok)throw Error(r.error);return JSON.parse(r.result);};
// Leave, wait until the server has unloaded the ship (it is then only a file), and join it again from the list.
const reload=async c=>{const room=c.room;c.send({type:'leave'});await until(async()=>{const list=await (await fetch(`http://127.0.0.1:${PORT}/health`)).json();return list.loaded===0;},6000,'ship unloaded');c.room=null;c.send({type:'join',room});await until(()=>c.room&&c.snap,5000,'rejoined');await sleep(300);};
(async()=>{let ok=false;try{await sleep(900);
 // New ships: in Freeport I, floating at random free spots (not all at one place), inside the harbour, off the piers.
 const spots=[];const cs=[];for(let k=0;k<3;k++){const c=await client('Cap'+k);cs.push(c);c.send({type:'create',name:'Spawn '+k});await until(()=>c.room&&c.snap,5000,'created');await sleep(300);
  const s=await val(c,'({zone,docked,p:ship.getPosition(),fits:freeportFits(ship.getPosition())})');assert.equal(s.zone,'freeport');assert.equal(s.docked,null,'a new ship is not docked');assert.ok(s.fits,'inside the harbour, clear of the piers and the portal');spots.push(s.p);}
 const near=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<1;assert.ok(!(near(spots[0],spots[1])&&near(spots[1],spots[2])),'new ships spawn at random spots: '+JSON.stringify(spots));
 for(const c of cs.slice(1)){c.send({type:'leave'});}
 const c=cs[0];
 // Saved docked at a pier: loading it again does not restore the dock, and it reappears somewhere else in the same Freeport.
 const d=await val(c,"fly(110,44);snapDock({rect:{x0:56,y0:53,x1:124,y1:55}});save(true);docked");assert.equal(d?.side,'floor','docked on top of pier D before saving');await sleep(400);
 await reload(c);let s=await val(c,'({zone,docked,p:ship.getPosition(),type:ship.getType(),fits:freeportFits(ship.getPosition())})');
 assert.equal(s.zone,'freeport');assert.equal(s.docked,null,'loaded ship is not docked');assert.equal(s.type,'dynamic');assert.ok(s.fits);assert.equal(c.snap.docked??null,null,'the client sees it undocked');
 // Left in a combat zone (Sparrow I): it spawns in the Freeport tied to that zone.
 c.send({type:'action',action:'dev',op:'sparrow',seq:1,aim:{x:0,y:0}});await until(()=>c.snap?.zone==='sparrow',4000,'in Sparrow');await sleep(400);
 await reload(c);s=await val(c,'({zone,docked,fits:freeportFits(ship.getPosition()),crit:criticalFor})');
 assert.equal(s.zone,era.HOME_FREEPORT.sparrow,'back in the Freeport tied to Sparrow I');assert.equal(s.docked,null);assert.ok(s.fits);assert.equal(s.crit,0);
 // And from Finch I to Freeport I.
 c.send({type:'action',action:'dev',op:'finch',seq:2,aim:{x:0,y:0}});await until(()=>c.snap?.zone==='finch',4000,'in Finch');await sleep(400);
 await reload(c);s=await val(c,'({zone,docked})');assert.equal(s.zone,era.HOME_FREEPORT.finch);assert.equal(s.docked,null);
 const errs=log.filter(l=>/Error|failed/.test(l));assert.equal(errs.length,0,errs.join(''));
 ok=true;console.log('PASS: ships spawn undocked at random free spots in a Freeport — new ships, ships loaded from the list (a saved dock is not restored), and ships left in a combat zone (the Freeport tied to it).');
}catch(e){console.error(e);console.error(log.join(''));}finally{srv.kill('SIGTERM');await sleep(300);fs.rmSync(dataDir,{recursive:true,force:true});process.exit(ok?0:1);}})();
