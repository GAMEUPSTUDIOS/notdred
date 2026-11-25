'use strict';
// v74: what the page shows of loose objects stays true to the server. A real server and a real browser: a pile of
// loose items aboard; then the ship's layout changes several times (each change rebuilds the page's physics worlds).
// Every item must stay on screen, once, in the current world, where the server has it — before the fix the page kept
// bodies from the dropped worlds and removing one through the new world deleted some other body's collision entry
// (objects blinked out, fell through, or showed twice). Also: a canvas the game draws on again (the minimap's rock
// layer) shows its new picture with the WebGL renderer, not the first one it uploaded.
// Skipped without Playwright.
const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
let chromium;try{({chromium}=require('playwright'));}catch{console.log('SKIP: render test (Playwright is not installed here).');process.exit(0);}
const root=path.resolve(__dirname,'..'),PORT=36000+Math.floor(Math.random()*900),dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'fp-v74-')),TOKEN='v74-token-123456';
const srv=spawn(process.execPath,['server/server.cjs','--port',String(PORT)],{cwd:root,env:{...process.env,DATA_DIR:dataDir,DEV_TOKEN:TOKEN}});let log='';srv.stdout.on('data',d=>log+=d);srv.stderr.on('data',d=>log+=d);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{let ok=false,b;try{
 for(let i=0;i<100&&!/listening/.test(log);i++)await sleep(100);
 try{b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});}catch(e){console.log('SKIP: render test (no browser).');ok=true;return;}
 const p=await b.newPage({viewport:{width:1200,height:760}});const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept('Render Ship'));
 await p.goto(`http://127.0.0.1:${PORT}/`);await p.waitForTimeout(1000);await p.evaluate(()=>{const m=document.getElementById('modechooser');if(m)m.style.display='none';});
 await p.fill('#serverurl',`ws://127.0.0.1:${PORT}/play`);await p.fill('input[placeholder^="Host token"]',TOKEN);await p.click('text=Connect');await p.waitForTimeout(1000);await p.click('text=New Ship');
 await p.waitForFunction(()=>typeof netState!=='undefined'&&netState&&netState.crew&&netState.crew.length>0,null,{timeout:15000});
 const ship=code=>p.evaluate(code=>new Promise(res=>runLiveCode('ship',code,res)),code).then(r=>{assert.ok(r.ok,'live code: '+r.error);return JSON.parse(r.result);});
 // A pile of loose items, settled.
 await ship(`for(let k=0;k<48;k++)spawnItem(['iron','flux','ammo','block'][k%4],V(-3.5+(k%8),-2.2-Math.floor(k/8)*.7),V(0,0),1+k%5);items.length`);await p.waitForTimeout(3500);
 const serverItems=()=>ship('JSON.stringify(items.map(i=>{const q=i.body.getPosition();return [i.nid,i.type,i.count,q.x,q.y];}))').then(JSON.parse);
 // The page: every item once, a body in the current interior world, where the server has it; no stray item bodies.
 const check=async label=>{await p.waitForTimeout(700);const srvList=await serverItems();
  const page=await p.evaluate(()=>{let stray=0,itemBodies=0;const mine=new Set(items.map(i=>i.body)),other=new Set([...boxes.map(x=>x.body),...[...terrain.values()].map(t=>t.body).filter(Boolean)]);for(let bd=inside.getBodyList();bd;bd=bd.getNext()){const f=bd.getFixtureList();if(f&&f.getFilterCategoryBits()===8&&!other.has(bd)){itemBodies++;if(!mine.has(bd))stray++;}}
   return {n:items.length,map:netItemsById.size,inWorld:items.every(i=>i.body.m_world===inside&&!i.body.m_destroyed),stray,itemBodies,list:[...netItemsById].map(([id,i])=>{const q=i.body.getPosition();return [id,i.type,i.count,q.x,q.y];})};});
  assert.equal(page.n,srvList.length,label+': as many items as on the server');assert.equal(page.map,srvList.length);assert.ok(page.inWorld,label+': every item is in the current physics world');
  assert.equal(page.stray,0,label+': no stray copies');assert.equal(page.itemBodies,srvList.length,label+': one body per item');
  const byId=new Map(page.list.map(r=>[r[0],r]));for(const [id,type,count,x,y] of srvList){const c=byId.get(id);assert.ok(c,label+': item '+id+' is shown');assert.equal(c[1],type);assert.equal(c[2],count);assert.ok(Math.hypot(c[3]-x,c[4]-y)<.35,label+': item '+id+' where the server has it '+JSON.stringify([c,[x,y]]));}};
 await check('settled pile');
 // Layout changes (each rebuilds the page's worlds), one after another and then two at once.
 for(let k=0;k<3;k++){await ship(`bounds={...bounds,r:bounds.r+1};rebuildShell();rebuildMounts();updateShipMass();1`);await check('after layout change '+(k+1));}
 await ship(`bounds={...bounds,l:bounds.l-1};rebuildShell();rebuildMounts();updateShipMass();1`);await p.waitForTimeout(120);await ship(`bounds={...bounds,t:bounds.t-1};rebuildShell();rebuildMounts();updateShipMass();1`);await check('after two quick changes');
 // Something removed and something moved after the rebuilds: the page follows (its bodies are still the live ones).
 await ship(`(()=>{const i=items.pop();inside.destroyBody(i.body);items[0].body.setTransform(V(items[0].body.getPosition().x,items[0].body.getPosition().y-1.5),0);items[0].body.setAwake(true);return 1;})()`);await check('after a removal and a move');
 // WebGL: a canvas drawn on again is uploaded again.
 const gl=await p.evaluate(()=>{if(!ctx.isWebGL)return null;const cv=document.createElement('canvas');cv.width=cv.height=64;const g=cv.getContext('2d');
  const probe=()=>{const c=document.createElement('canvas');c.width=c.height=8;const x=createGL2D(c);return {x,c};};
  // one renderer, one canvas: draw it red, then blue (version bumped), read the pixel each time
  const t=probe();if(!t.x)return null;const glc=t.c.getContext('webgl');const px=()=>{const a=new Uint8Array(4);glc.readPixels(4,4,1,1,glc.RGBA,glc.UNSIGNED_BYTE,a);return [...a];};
  g.fillStyle='#ff0000';g.fillRect(0,0,64,64);t.x.drawImage(cv,0,0,8,8);t.x.flush();const red=px();
  g.fillStyle='#0000ff';g.fillRect(0,0,64,64);cv.__glVersion=1;t.x.drawImage(cv,0,0,8,8);t.x.flush();const blue=px();return {red,blue};});
 if(gl){assert.ok(gl.red[0]>200&&gl.red[2]<50,'first picture: red '+gl.red);assert.ok(gl.blue[2]>200&&gl.blue[0]<50,'redrawn canvas shows its new picture: '+gl.blue);}else console.log('(no WebGL in this browser: texture check skipped)');
 assert.deepEqual(errors,[],'no page errors');
 ok=true;console.log('PASS: loose items stay shown once, in the live physics world and where the server has them, through repeated layout rebuilds; redrawn canvases update with WebGL.');
}catch(e){console.error(e);console.error(log.slice(-800));}finally{try{await b?.close();}catch{}srv.kill();setTimeout(()=>{try{fs.rmSync(dataDir,{recursive:true,force:true});}catch{}process.exit(ok?0:1);},300);}})();
