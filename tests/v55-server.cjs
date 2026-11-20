'use strict';
// v55 (real server): a player's code (session token) keeps their rank and ship ownership across a server restart and
// on a new link (a fresh browser: same code pasted in); without it they're a new player. Ladder prediction clamp.
const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{WebSocket}=require('ws');
const root=path.resolve(__dirname,'..');process.chdir(root);
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),PORT=31000+Math.floor(Math.random()*900),dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'fp-v55-'));
let srv=null;const start=()=>{srv=spawn(process.execPath,['server/server.cjs','--port',String(PORT)],{cwd:root,env:{...process.env,DATA_DIR:dataDir}});};
const until=async(f,ms=5000,label='condition')=>{const t=Date.now();while(!(await f())){if(Date.now()-t>ms)throw Error('Timed out: '+label);await sleep(40);}};
function client(name,token){return new Promise((res,rej)=>{const ws=new WebSocket(`ws://127.0.0.1:${PORT}/play`,{headers:{origin:`http://127.0.0.1:${PORT}`}});const c={name,ws,snap:null,rooms:[]};ws.on('error',rej);
 ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='hello')ws.send(JSON.stringify({type:'hello',protocol:1,name,token}));if(m.type==='welcome'){c.token=m.token;c.rooms=m.rooms;res(c);}if(m.type==='joined')c.room=m.room;if(m.type==='snapshot')c.snap=m.state;});c.send=o=>ws.send(JSON.stringify(o));});}
const connect=async(name,token)=>{for(let i=0;;i++){try{return await client(name,token);}catch(e){if(i>60)throw e;await sleep(150);}}};
const rankOf=(c,who)=>c.snap?.crew?.find(x=>x.id===who.snap?.self?.id)?.rank;
(async()=>{let ok=false;try{start();
 const cap=await connect('Cap'),fin=await connect('Fin');cap.send({type:'create',name:'Code Ship'});await until(()=>cap.room&&cap.snap);fin.send({type:'join',room:cap.room});await until(()=>fin.snap);
 cap.send({type:'rank',crew:fin.snap.self.id,rank:'crew'});await until(()=>rankOf(cap,fin)==='crew',3000,'promoted');const room=cap.room;
 cap.ws.close();fin.ws.close();await sleep(300);srv.kill('SIGTERM');await new Promise(r=>srv.on('exit',r));start();
 // After the restart, on a "new link": the same codes bring back the rank and the ship; no code = a new guest.
 const fin2=await connect('Fin',fin.token),cap2=await connect('Cap',cap.token),stranger=await connect('Fin');
 assert.ok(cap2.rooms.find(r=>r.id===room)?.mine,'the ship is still the captain\'s');
 cap2.send({type:'join',room});fin2.send({type:'join',room});stranger.send({type:'join',room});await until(()=>cap2.snap&&fin2.snap&&stranger.snap&&cap2.snap.crew?.length===3,6000,'all aboard');
 assert.equal(rankOf(cap2,fin2),'crew','rank kept with the code');assert.equal(cap2.snap.self.rank,'captain');assert.equal(rankOf(cap2,stranger),'guest','same name without the code is a new guest');
 const ui=fs.readFileSync('dist/interface.js','utf8'),net=fs.readFileSync('dist/network.js','utf8'),game=fs.readFileSync('dist/game.js','utf8');
 assert.ok(ui.includes('id="playercode"')&&ui.includes('id="usecode"')&&/localStorage\.setItem\('freeport-session',v\)/.test(net),'player code in the lobby');
 assert.ok(/function clampToLadder\(\)/.test(game)&&/inside\.step\(p?dt\);clampToLadder\(\);/.test(net),'the browser\'s prediction keeps the ladder clamp');
 ok=true;console.log('PASS: player codes keep ranks and ship ownership across restarts and new links; ladder prediction clamped like the server.');
 for(const c of [cap2,fin2,stranger])c.ws.close();
}catch(e){console.error(e);}finally{srv?.kill();await sleep(400);fs.rmSync(dataDir,{recursive:true,force:true,maxRetries:10,retryDelay:100});process.exit(ok?0:1);}})();
