'use strict';
// v41: ship MOTD — plain text the captain edits; every rank (and classic players) get it on joining and when it changes.
const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),{WebSocket}=require('ws');
const root=path.resolve(__dirname,'..');process.chdir(root);
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),PORT=28000+Math.floor(Math.random()*900),dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'fp-v41-'));
const start=()=>{const p=spawn(process.execPath,['server/server.cjs','--port',String(PORT)],{cwd:root,env:{...process.env,DATA_DIR:dataDir,SAVE_INTERVAL_MS:'300'}});p.stderr.on('data',d=>log.push(String(d)));return p;};const log=[];let srv=start();
function client(name,token){return new Promise(res=>{const ws=new WebSocket(`ws://127.0.0.1:${PORT}/play`,{headers:{origin:`http://127.0.0.1:${PORT}`}});const c={name,ws,motds:[],errors:[],snaps:0};
 ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='hello')ws.send(JSON.stringify({type:'hello',protocol:1,name,token}));if(m.type==='welcome'){c.token=m.token;res(c);}if(m.type==='joined')c.room=m.room;if(m.type==='motd')c.motds.push(m);if(m.type==='error')c.errors.push(m.message);if(m.type==='snapshot')c.snaps++;});
 c.send=o=>ws.send(JSON.stringify(o));});}
const get=p=>new Promise((res,rej)=>http.get(`http://127.0.0.1:${PORT}${p}`,r=>{const b=[];r.on('data',d=>b.push(d));r.on('end',()=>res(Buffer.concat(b).toString()));}).on('error',rej));
const until=async(f,ms=4000,label='condition')=>{const t=Date.now();while(!(await f())){if(Date.now()-t>ms)throw Error('Timed out: '+label);await sleep(40);}};
(async()=>{let ok=false;try{await sleep(900);
 const cap=await client('Cap'),mate=await client('Mate');
 cap.send({type:'create',name:'Notice Board'});await until(()=>cap.room&&cap.motds.length,3000,'motd on join');assert.equal(cap.motds[0].text,'','empty to start');
 mate.send({type:'join',room:cap.room});await until(()=>mate.motds.length,3000,'mate joins');
 // Only the captain edits; plain text is kept (line breaks yes, other control characters no, 1000 characters max).
 mate.send({type:'motd',text:'mutiny'});await until(()=>mate.errors.some(e=>/Only the captain/.test(e)),2000,'refused');
 cap.send({type:'motd',text:'Welcome aboard!\r\nRules:\n1. <b>no</b> griefing\u0007\n'+'x'.repeat(2000)});
 await until(()=>mate.motds.some(m=>m.changed),3000,'broadcast');const m=mate.motds.find(x=>x.changed);
 assert.ok(m.text.startsWith('Welcome aboard!\nRules:\n1. <b>no</b> griefing\n'),'line breaks kept, control characters removed, text left as typed (clients show it as text)');assert.equal(m.text.length,1000,'1000 characters max');assert.equal(m.by,'Cap');
 // Joining later gets it straight away; classic players too.
 const late=await client('Late');late.send({type:'join',room:cap.room});await until(()=>late.motds.length,3000,'late joiner');assert.equal(late.motds[0].text,m.text);
 const c=eval(await get('/classic/connect?name=Retro'));await get('/classic/send?s='+c.session+'&m='+encodeURIComponent(JSON.stringify({type:'join',room:cap.room})));
 let seen=null;await until(async()=>{const p=eval(await get('/classic/poll?s='+c.session));seen=seen||p.messages.find(x=>x.type==='motd');return seen;},4000,'classic motd');assert.equal(seen.text,m.text);
 const page=await get('/classic');assert.ok(/Team MOTD/.test(page)&&/id="motdeditbtn"/.test(page)&&page.includes("show('motdeditbtn',cap&&!motdEditing"),'classic: Team MOTD panel, Edit only for the captain');
 // It is saved with the ship.
 for(const x of [cap,mate,late])x.send({type:'leave'});await get('/classic/quit?s='+c.session);await sleep(500);srv.kill();await sleep(500);srv=start();await sleep(900);
 const again=await client('Cap',cap.token);again.send({type:'join',room:cap.room});await until(()=>again.motds.length,4000,'after restart');assert.equal(again.motds[0].text,m.text,'MOTD survives a restart');
 const net=fs.readFileSync('dist/network.js','utf8');assert.ok(net.includes('Team MOTD')&&net.includes("if(netCaptain){const e=document.createElement('button');e.textContent='Edit'")&&!/msmotd/.test(net),'full client: Team MOTD panel, Edit only for the captain, not in Manage Ship');
 ok=true;console.log('PASS: ship MOTD — captain-only edits, plain text cleaned and capped at 1000, sent to every rank on join and on change, classic players too, saved with the ship.');
}catch(e){console.error(e);console.error(log.join(''));}finally{srv.kill();await sleep(400);fs.rmSync(dataDir,{recursive:true,force:true,maxRetries:10,retryDelay:100});process.exit(ok?0:1);}})();
