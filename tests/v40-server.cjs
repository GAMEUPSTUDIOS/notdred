'use strict';
// v40: Classic mode for very old browsers (IE6 / Windows 2000) and reduced mode for slow computers.
const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),{WebSocket}=require('ws');
const root=path.resolve(__dirname,'..');process.chdir(root);
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),PORT=27000+Math.floor(Math.random()*900),dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'fp-v40-'));
const srv=spawn(process.execPath,['server/server.cjs','--port',String(PORT)],{cwd:root,env:{...process.env,DATA_DIR:dataDir}});const log=[];srv.stderr.on('data',d=>log.push(String(d)));
const get=(p)=>new Promise((res,rej)=>http.get(`http://127.0.0.1:${PORT}${p}`,r=>{const b=[];r.on('data',d=>b.push(d));r.on('end',()=>res({status:r.statusCode,type:r.headers['content-type'],body:Buffer.concat(b)}));}).on('error',rej));
const api=async p=>{const r=await get(p);return eval(r.body.toString());};// responses are object literals for IE6's eval
const until=async(f,ms=4000,label='condition')=>{const t=Date.now();while(!(await f())){if(Date.now()-t>ms)throw Error('Timed out: '+label);await sleep(50);}};
(async()=>{let ok=false;try{await sleep(900);
 // The pages: classic page is old-school HTML/ES3; the main page asks before rendering.
 const page=(await get('/classic')).body.toString(),js=page.split('<script type="text/javascript">')[1].split('</script>')[0];
 for(const bad of ['=>','`','let ','const ','class ','JSON.','.forEach(','addEventListener('])assert.ok(!js.replace(/\/\*[\s\S]*?\*\//g,'').includes(bad),'classic page avoids '+bad);
 const index=(await get('/')).body.toString();assert.ok(index.indexOf('window.confirm(')<index.indexOf('<canvas'),'old browsers are asked before the page renders');assert.ok(/modechooser/.test(index)&&/NOTDRED_LITE/.test(index),'slow-computer chooser and reduced mode');
 // A classic session is an ordinary client to the server.
 const c=await api('/classic/connect?name=Old%20Timer');assert.ok(c.session&&/^[a-f0-9]{48}$/.test(c.token),'session and account token');const S=c.session;
 await api('/classic/send?s='+S+'&m='+encodeURIComponent(JSON.stringify({type:'create',name:'Win2000 Express'})));
 let st=null;await until(async()=>{const p=await api('/classic/poll?s='+S);st=p.status||st;return st;},5000,'joined');
 assert.equal(st.ship,'Win2000 Express');assert.equal(st.rank,'captain');assert.equal(st.slots[0].type,'wrench');assert.equal(st.zone,'Freeport I');
 const f=await get('/classic/frame?s='+S+'&w=480&h=300&z=20');assert.equal(f.status,200);assert.match(f.type,/image\/jpeg/);assert.ok(f.body[0]===0xff&&f.body[1]===0xd8&&f.body.length>3000,'a JPEG picture of the game ('+f.body.length+' bytes)');
 // 30 frames a second: drawing happens in a worker on its own clock, and each request gets the newest frame.
 {const t0=Date.now();let n=0;while(Date.now()-t0<2000){await get('/classic/frame?s='+S+'&w=640&h=400&z=20&n='+n);n++;}assert.ok(n/2>=24,'about 30 fps back-to-back ('+(n/2).toFixed(1)+')');assert.ok(n/2<=40,'paced by the renderer, not faster ('+(n/2).toFixed(1)+')');}
 {const h=JSON.parse((await get('/health')).body.toString());assert.ok(h.tickMs<8,'the game loop is not slowed by classic drawing ('+h.tickMs+' ms)');}
 // Keys reach the game: number keys select slots, E at the helm takes it.
 await api('/classic/key?s='+S+'&k=2&d=1');await api('/classic/key?s='+S+'&k=2&d=0');await until(async()=>(await api('/classic/poll?s='+S)).status?.selected===1,3000,'slot 2');
 await api('/classic/key?s='+S+'&k=1&d=1');await api('/classic/key?s='+S+'&k=1&d=0');await api('/classic/key?s='+S+'&k=e&d=1');await api('/classic/key?s='+S+'&k=e&d=0');
 await until(async()=>(await api('/classic/poll?s='+S)).status?.piloting,3000,'took the helm with E');
 // Other players see the classic ship, and a modern player aboard it hears the classic player's chat.
 const ws=new WebSocket(`ws://127.0.0.1:${PORT}/play`,{headers:{origin:`http://127.0.0.1:${PORT}`}});const heard=[];let rooms=null;
 ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='hello')ws.send(JSON.stringify({type:'hello',protocol:1,name:'Modern'}));if(m.type==='welcome'){rooms=m.rooms;}if(m.type==='chat')heard.push(m);});
 await until(()=>rooms,3000,'modern client');assert.ok(rooms.some(r=>r.name==='Win2000 Express'&&r.players===1),'classic ship listed for modern players');ws.send(JSON.stringify({type:'join',room:rooms.find(r=>r.name==='Win2000 Express').id}));await sleep(600);
 await api('/classic/send?s='+S+'&m='+encodeURIComponent(JSON.stringify({type:'chat',text:'hello from 2000'})));await until(()=>heard.some(m=>m.text==='hello from 2000'&&m.from==='Old Timer'),3000,'chat');
 // Classic sessions can only send lobby/chat messages directly; game actions go through the headless client.
 assert.ok((await api('/classic/send?s='+S+'&m='+encodeURIComponent(JSON.stringify({type:'action',action:'dev',op:'finch'})))).error,'raw actions refused');
 // Leaving: the session ends and the ship empties.
 await api('/classic/quit?s='+S);assert.equal((await api('/classic/poll?s='+S)).ended,true,'session closed');
 await until(async()=>{ws.send(JSON.stringify({type:'list'}));await sleep(100);return true;},1000);
 ok=true;console.log('PASS: classic mode — ES3 page, old browsers asked before render, slow-computer chooser, sessions as normal clients (30 fps JPEG frames drawn in a worker thread, keys replayed into the real client: slots, helm), shared world and chat with modern players, raw actions refused, quit ends the session.');ws.close();
}catch(e){console.error(e);console.error(log.join(''));}finally{srv.kill();await sleep(400);fs.rmSync(dataDir,{recursive:true,force:true,maxRetries:10,retryDelay:100});process.exit(ok?0:1);}})();
