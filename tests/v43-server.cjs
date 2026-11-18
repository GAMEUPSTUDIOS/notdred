'use strict';
// v43: public / private ships. Private ships are hidden from other players' lists and can only be joined with the
// invite link's key; the captain and crew can always rejoin; a new link cancels the old one.
const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{WebSocket}=require('ws');
const root=path.resolve(__dirname,'..');process.chdir(root);
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),PORT=29000+Math.floor(Math.random()*900),dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'fp-v43-'));
const start=()=>{const p=spawn(process.execPath,['server/server.cjs','--port',String(PORT)],{cwd:root,env:{...process.env,DATA_DIR:dataDir,SAVE_INTERVAL_MS:'300'}});p.stderr.on('data',d=>log.push(String(d)));return p;};const log=[];let srv=start();
function client(name,token){return new Promise(res=>{const ws=new WebSocket(`ws://127.0.0.1:${PORT}/play`,{headers:{origin:`http://127.0.0.1:${PORT}`}});const c={name,ws,errors:[],rooms:null,settings:null,room:null,board:null};
 ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='hello')ws.send(JSON.stringify({type:'hello',protocol:1,name,token}));if(m.type==='welcome'){c.token=m.token;c.rooms=m.rooms;res(c);}if(m.type==='rooms'){c.rooms=m.rooms;c.room=null;}if(m.type==='joined')c.room=m.room;if(m.type==='shipsettings')c.settings=m;if(m.type==='leaderboard')c.board=m;if(m.type==='crew')c.crew=m;if(m.type==='error')c.errors.push(m.message);});
 c.send=o=>ws.send(JSON.stringify(o));});}
const until=async(f,ms=4000,label='condition')=>{const t=Date.now();while(!(await f())){if(Date.now()-t>ms)throw Error('Timed out: '+label);await sleep(40);}};
const list=async c=>{c.rooms=null;c.send({type:'list'});await until(()=>c.rooms,3000,'list');return c.rooms;};
(async()=>{let ok=false;try{await sleep(1500);
 const cap=await client('Cap'),pal=await client('Pal'),stranger=await client('Stranger');
 cap.send({type:'create',name:'Hidden Hold'});await until(()=>cap.room,3000,'created');const id=cap.room;
 cap.send({type:'shipsettings'});await until(()=>cap.settings,2000,'settings');assert.equal(cap.settings.private,false,'ships start public');assert.match(cap.settings.invite,/^[a-f0-9]{18}$/,'captain gets the invite key');
 assert.ok((await list(stranger)).some(r=>r.id===id),'public ships are listed for everyone');
 // Only the captain changes it.
 stranger.send({type:'join',room:id});await until(()=>stranger.room,3000,'stranger joins a public ship');stranger.send({type:'privacy',private:true});await until(()=>stranger.errors.some(e=>/Only the captain/.test(e)),2000,'refused');stranger.send({type:'leave'});await sleep(200);
 cap.settings=null;cap.send({type:'privacy',private:true});await until(()=>cap.settings?.private===true,2000,'made private');const key=cap.settings.invite;
 assert.ok(!(await list(stranger)).some(r=>r.id===id),'private ships are hidden from other players');assert.ok((await list(cap)).some(r=>r.id===id&&r.private),'the captain still sees it (marked private)');
 stranger.errors.length=0;stranger.send({type:'join',room:id});await until(()=>stranger.errors.some(e=>/private/.test(e)),2000,'join without the link refused');
 stranger.send({type:'join',room:id,key:'0'.repeat(18)});await until(()=>stranger.errors.length>=2,2000,'wrong key refused');assert.equal(stranger.room,null);
 pal.send({type:'join',room:id,key});await until(()=>pal.room===id,3000,'joins with the invite link');
 pal.board=null;pal.send({type:'leaderboard'});await until(()=>pal.board,2000,'board');const row=pal.board.ships.find(s=>s.name==='(private ship)');assert.ok(row&&row.id!==id,'leaderboard hides a private ship\'s name and id');
 // Crew can come back without the link; a new link cancels the old key for everyone else.
 pal.send({type:'leave'});await until(()=>pal.room===null,2000,'pal left');
 cap.crew=null;cap.send({type:'crew'});await until(()=>cap.crew,2000,'crew report');const palRow=cap.crew.crew.find(c=>c.name==='Pal');
 cap.send({type:'rank',account:palRow.short,rank:'crew'});await sleep(300);
 assert.ok((await list(pal)).some(r=>r.id===id),'crew see their private ship in the list');pal.send({type:'join',room:id});await until(()=>pal.room===id,3000,'crew rejoin without the link');pal.send({type:'leave'});await sleep(200);
 cap.settings=null;cap.send({type:'newinvite'});await until(()=>cap.settings&&cap.settings.invite!==key,2000,'new link');
 stranger.errors.length=0;stranger.send({type:'join',room:id,key});await until(()=>stranger.errors.some(e=>/private/.test(e)),2000,'old link no longer works');
 stranger.send({type:'join',room:id,key:cap.settings.invite});await until(()=>stranger.room===id,3000,'new link works');
 // The setting survives a restart.
 for(const c of [cap,stranger])c.send({type:'leave'});await sleep(500);srv.kill();await sleep(600);srv=start();await sleep(1500);
 const again=await client('Stranger',stranger.token),again2=await client('Other');assert.ok(!(await list(again2)).some(r=>r.id===id),'still private after a restart');
 const capAgain=await client('Cap',cap.token);assert.ok((await list(capAgain)).some(r=>r.id===id),'captain still sees it after a restart');
 const page=fs.readFileSync('dist/network.js','utf8');assert.ok(/function joinFromLink/.test(page)&&/searchParams.set\('key'/.test(page),'the page builds invite links and joins from them');
 ok=true;console.log('PASS: private ships — public by default, captain-only switch, hidden from other players\' lists and the leaderboard, joinable only with the invite link (wrong/old keys refused), crew rejoin without it, new link cancels the old one, saved across restarts.');
}catch(e){console.error(e);console.error(log.join(''));}finally{srv.kill();await sleep(400);fs.rmSync(dataDir,{recursive:true,force:true,maxRetries:10,retryDelay:100});process.exit(ok?0:1);}})();
