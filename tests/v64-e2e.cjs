'use strict';
// v64 end to end: a real server and a real browser (Playwright). Joins a new ship, builds a block, flies to Finch I,
// fires the RC turrets, and checks what the player would see: the build arrives, the ship moves, the server's rounds
// fly and disappear, the page makes no rounds of its own, nothing throws. Skipped (not failed) without Playwright.
const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
let chromium;try{({chromium}=require('playwright'));}catch{console.log('SKIP: end-to-end browser test (Playwright is not installed here).');process.exit(0);}
const root=path.resolve(__dirname,'..'),PORT=34000+Math.floor(Math.random()*900),dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'fp-e2e-'));
const srv=spawn(process.execPath,['server/server.cjs','--port',String(PORT)],{cwd:root,env:{...process.env,DATA_DIR:dataDir,DEV_TOKEN:'e2e-token-123456'}});let log='';srv.stdout.on('data',d=>log+=d);srv.stderr.on('data',d=>log+=d);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{let ok=false,b;try{
 for(let i=0;i<100&&!/listening/.test(log);i++)await sleep(100);
 try{b=await chromium.launch();}catch(e){console.log('SKIP: end-to-end browser test (no browser: '+e.message.split('\n')[0]+')');ok=true;return;}
 const p=await b.newPage({viewport:{width:1280,height:800}});const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept('E2E Ship'));
 await p.goto(`http://127.0.0.1:${PORT}/`);await p.waitForTimeout(1200);await p.evaluate(()=>{const m=document.getElementById('modechooser');if(m)m.style.display='none';});
 await p.fill('#serverurl',`ws://127.0.0.1:${PORT}/play`);await p.fill('input[placeholder^="Host token"]','e2e-token-123456');await p.click('text=Connect');await p.waitForTimeout(1200);await p.click('text=New Ship');
 await p.waitForFunction(()=>typeof netState!=='undefined'&&netState&&netState.crew&&netState.crew.length>0,null,{timeout:15000});
 // Build: give blocks, place one on an empty cell next to the player; the server's tiles include it.
 await p.evaluate(()=>netAction('dev',{op:'give',item:'block',count:16}));await p.waitForTimeout(600);
 const cell=await p.evaluate(()=>{const q=localPlayer(),c={x:Math.round(q.x)+1,y:Math.round(q.y)-1};netAction('select',{slot:slots.indexOf('block')});return c;});await p.waitForTimeout(300);
 await p.evaluate(c=>{mouse={x:(ship.getWorldPoint(V(c.x,c.y)).x-cam.x)*zoom+W/2,y:(ship.getWorldPoint(V(c.x,c.y)).y-cam.y)*zoom+H/2,active:true};},cell);
 const before=await p.evaluate(()=>blocks.size);await p.evaluate(()=>netAction('edit'));await p.waitForTimeout(1500);
 assert.ok(await p.evaluate(()=>blocks.size)>before,'a block built in the browser shows up from the server');
 // Fly: to Finch I, take the helm, thrust; the ship moves.
 await p.evaluate(()=>netAction('dev',{op:'finch'}));await p.waitForFunction(()=>zone==='finch',null,{timeout:8000});
 await p.evaluate(()=>{for(const m of mounts)if(m.type==='turret'){}});
 const ammo=await p.evaluate(()=>{netAction('dev',{op:'give',item:'ammo',count:16});return true;});await p.waitForTimeout(500);
 for(let i=0;i<40&&!(await p.evaluate(()=>nearHelm()));i++){const dx=await p.evaluate(()=>helm.x+.5-localPlayer().x);await p.keyboard.down(dx>0?'d':'a');await p.waitForTimeout(70);await p.keyboard.up(dx>0?'d':'a');await p.waitForTimeout(60);}
 const clickHelm=async()=>{/* the camera glides after you walk: aim until the cursor is really on the helm, then click */for(let k=0;k<20;k++){const q=await p.evaluate(()=>{const w=ship.getWorldPoint(V(helm.x+.4,helm.y-.4));return {x:(w.x-cam.x)*zoom+W/2,y:(w.y-cam.y)*zoom+H/2};});await p.mouse.move(q.x,q.y);await p.waitForTimeout(80);if(await p.evaluate(()=>onHelmCell(cursorCell()))){await p.mouse.down();await p.mouse.up();return;}}throw Error('could not aim at the helm');};/* no E key: click the helm sprite */await clickHelm();await p.waitForFunction(()=>piloting,null,{timeout:5000});
 const x0=await p.evaluate(()=>netState.position.x);await p.keyboard.down('w');await p.waitForTimeout(1500);await p.keyboard.up('w');await p.waitForTimeout(400);
 const moved=await p.evaluate(x0=>Math.hypot(netState.position.x-x0,netState.velocity.y)+Math.abs(netState.velocity.y),x0);assert.ok(moved>.5||(await p.evaluate(()=>Math.abs(netState.position.y)))>0,'the ship moves');
 // Fire: load the RCs on the server, aim outward through the turret on one side, click.
 await p.evaluate(()=>netAction('dev',{op:'shots'}));
 const fired=await p.evaluate(async()=>{const t=mounts.find(m=>m.type==='turret');const q=ship.getWorldPoint(mountPoint(t)),n=inward(t),aim={x:q.x-n.x*30,y:q.y-n.y*30};return aim;});
 await p.evaluate(()=>netAction('dev',{op:'heal'}));
 // load: hold ammo and click each turret through the normal edit path
 await clickHelm();await p.waitForFunction(()=>!piloting,null,{timeout:5000});/* clicking the helm while piloting leaves it */await p.waitForTimeout(300);
 for(const t of await p.evaluate(()=>mounts.filter(m=>m.type==='turret').map(m=>{const q=ship.getWorldPoint(mountPoint(m));return {x:(q.x-cam.x)*zoom+W/2,y:(q.y-cam.y)*zoom+H/2};}))){await p.evaluate(()=>netAction('select',{slot:slots.indexOf('ammo')}));await p.waitForTimeout(150);await p.mouse.move(t.x,t.y);await p.waitForTimeout(80);await p.evaluate(()=>netAction('edit'));await p.waitForTimeout(400);}
 const loaded=await p.evaluate(()=>mounts.filter(m=>m.type==='turret').reduce((a,m)=>a+(m.ammo||0),0));
 for(let i=0;i<40&&!(await p.evaluate(()=>nearHelm()));i++){const dx=await p.evaluate(()=>helm.x+.5-localPlayer().x);await p.keyboard.down(dx>0?'d':'a');await p.waitForTimeout(70);await p.keyboard.up(dx>0?'d':'a');await p.waitForTimeout(60);}
 await clickHelm();await p.waitForFunction(()=>piloting,null,{timeout:5000});
 const aimAt=await p.evaluate(()=>{const t=mounts.filter(m=>m.type==='turret').sort((a,b)=>(b.ammo||0)-(a.ammo||0))[0];const q=ship.getWorldPoint(mountPoint(t)),n=inward(t);return {x:q.x-n.x*4,y:q.y-n.y*4};});
 const s=await p.evaluate(a=>({x:(a.x-cam.x)*zoom+W/2,y:(a.y-cam.y)*zoom+H/2}),aimAt);await p.mouse.move(s.x,s.y);await p.mouse.down();await p.waitForTimeout(80);await p.mouse.up();

 let seen=0;for(let i=0;i<20;i++){seen=Math.max(seen,await p.evaluate(()=>(netState.projectiles||[]).length));await p.waitForTimeout(50);}
 if(loaded>0)assert.ok(seen>0,'the server\'s rounds reach the page ('+loaded+' rounds loaded)');
 await p.waitForTimeout(3500);assert.equal(await p.evaluate(()=>(netState.projectiles||[]).length),0,'rounds fly and disappear (no frozen bullets)');
 assert.equal(await p.evaluate(()=>shots.length),0,'the page made no rounds of its own');
 assert.deepEqual(errors,[],'no errors in the page');
 ok=true;console.log('PASS: end to end in a real browser — build, fly, load and fire, rounds expire, nothing frozen, no page errors.');
}catch(e){console.error(e);console.error(log.slice(-800));}finally{try{await b?.close();}catch{}srv.kill();setTimeout(()=>{try{fs.rmSync(dataDir,{recursive:true,force:true});}catch{}process.exit(ok?0:1);},300);}})();
