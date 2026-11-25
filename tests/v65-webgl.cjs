'use strict';
// v65: the WebGL renderer (dist/modules/webgl2d.js) draws the same game as the 2D canvas. A real server and a real
// browser draw one scene both ways (zone, ship, tiles, machines, turrets, text, minimap); the pictures must match
// closely (mean difference under 8/255 per colour) with no page errors, and ?renderer=2d forces the 2D canvas.
// Skipped without Playwright or without WebGL in the test browser.
const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
let chromium;try{({chromium}=require('playwright'));}catch{console.log('SKIP: WebGL renderer test (Playwright is not installed here).');process.exit(0);}
const root=path.resolve(__dirname,'..'),PORT=35000+Math.floor(Math.random()*900),dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'fp-gl-'));
const srv=spawn(process.execPath,['server/server.cjs','--port',String(PORT)],{cwd:root,env:{...process.env,SHIP_RETURN_MS:'1',DATA_DIR:dataDir,DEV_TOKEN:'gl-token-123456'}});let log='';srv.stdout.on('data',d=>log+=d);srv.stderr.on('data',d=>log+=d);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// Minimal PNG decoder (8-bit RGB/RGBA, non-interlaced: what Chromium screenshots are).
function png(buf){let o=8,w,h,ct,idat=[];while(o<buf.length){const len=buf.readUInt32BE(o),type=buf.toString('ascii',o+4,o+8),d=buf.subarray(o+8,o+8+len);if(type==='IHDR'){w=d.readUInt32BE(0);h=d.readUInt32BE(4);ct=d[9];}else if(type==='IDAT')idat.push(d);o+=12+len;}
 const bpp=ct===6?4:3,raw=zlib.inflateSync(Buffer.concat(idat)),out=Buffer.alloc(w*h*bpp),st=w*bpp;let prev=Buffer.alloc(st);
 for(let y=0;y<h;y++){const f=raw[y*(st+1)],line=raw.subarray(y*(st+1)+1,(y+1)*(st+1)),cur=out.subarray(y*st,(y+1)*st);
  for(let i=0;i<st;i++){const a=i>=bpp?cur[i-bpp]:0,b=prev[i],c=i>=bpp?prev[i-bpp]:0;let v=line[i];if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;else if(f===4){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);v+=pa<=pb&&pa<=pc?a:pb<=pc?b:c;}cur[i]=v&255;}prev=cur;}
 return {w,h,bpp,data:out};}
(async()=>{let ok=false,b;try{
 for(let i=0;i<100&&!/listening/.test(log);i++)await sleep(100);
 try{b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});}catch(e){console.log('SKIP: WebGL renderer test (no browser).');ok=true;return;}
 const shots={};
 for(const mode of ['2d','webgl']){const p=await b.newPage({viewport:{width:1200,height:760}});const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept('GL Ship'));
  await p.goto(`http://127.0.0.1:${PORT}/?renderer=${mode}`);await p.waitForTimeout(1000);await p.evaluate(()=>{const m=document.getElementById('modechooser');if(m)m.style.display='none';});
  await p.fill('#serverurl',`ws://127.0.0.1:${PORT}/play`);await p.fill('input[placeholder^="Host token"]','gl-token-123456');await p.click('text=Connect');await p.waitForTimeout(1000);await p.click('text=New Ship');
  await p.waitForFunction(()=>typeof netState!=='undefined'&&netState&&netState.crew&&netState.crew.length>0,null,{timeout:15000});
  const isGL=await p.evaluate(()=>!!ctx.isWebGL);if(mode==='2d')assert.equal(isGL,false,'?renderer=2d gives the 2D canvas');else if(!isGL){console.log('SKIP: WebGL renderer test (this browser has no WebGL).');ok=true;await p.close();return;}
  await p.evaluate(()=>{zoom=zoomWanted=zoomShown=16;for(const id of ['motd'])document.getElementById(id)?.remove();});await p.waitForTimeout(1200);
  shots[mode]=png(await p.screenshot({clip:{x:250,y:120,width:700,height:480}}));assert.deepEqual(errors,[],mode+': no page errors');await p.close();await new Promise(r=>setTimeout(r,2500));/* the empty ship despawns (SHIP_RETURN_MS=1) */}
 const A=shots['2d'],B=shots.webgl;let sum=0,n=0;for(let i=0;i<A.data.length;i++){if(A.bpp===4&&i%4===3)continue;sum+=Math.abs(A.data[i]-B.data[i]);n++;}const mean=sum/n;
 assert.ok(mean<8,'WebGL and 2D pictures match (mean difference '+mean.toFixed(2)+'/255)');
 ok=true;console.log('PASS: WebGL renderer draws the same picture as the 2D canvas (mean difference '+mean.toFixed(2)+'/255); ?renderer=2d forces 2D.');
}catch(e){console.error(e);console.error(log.slice(-600));}finally{try{await b?.close();}catch{}srv.kill();setTimeout(()=>{try{fs.rmSync(dataDir,{recursive:true,force:true});}catch{}process.exit(ok?0:1);},300);}})();
