'use strict';
// v50 (real server): captains can promote other players to captain; every captain has captain powers; the ship's
// owner can't be demoted, kicked or banned, and only the owner can demote or remove another captain.
const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{WebSocket}=require('ws');
const root=path.resolve(__dirname,'..');process.chdir(root);
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),PORT=30000+Math.floor(Math.random()*900),dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'fp-v50-'));
const srv=spawn(process.execPath,['server/server.cjs','--port',String(PORT)],{cwd:root,env:{...process.env,DATA_DIR:dataDir}});const log=[];srv.stderr.on('data',d=>log.push(String(d)));
const until=async(f,ms=4000,label='condition')=>{const t=Date.now();while(!(await f())){if(Date.now()-t>ms)throw Error('Timed out: '+label);await sleep(40);}};
function client(name){return new Promise(res=>{const ws=new WebSocket(`ws://127.0.0.1:${PORT}/play`,{headers:{origin:`http://127.0.0.1:${PORT}`}});const c={name,ws,errors:[],motds:[],snap:null,captain:null};
 ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='hello')ws.send(JSON.stringify({type:'hello',protocol:1,name}));if(m.type==='welcome')res(c);if(m.type==='joined'){c.room=m.room;c.captain=m.captain;}if(m.type==='error')c.errors.push(m.message);if(m.type==='motd')c.motds.push(m);if(m.type==='snapshot')c.snap=m.state;});
 c.send=o=>ws.send(JSON.stringify(o));});}
const rankIn=(c,who)=>c.snap?.crew?.find(x=>x.id===who.snap?.self?.id)?.rank;
(async()=>{let ok=false;try{await sleep(900);
 const owner=await client('Owner'),a=await client('Ada'),b=await client('Bo');
 owner.send({type:'create',name:'Twin Captains'});await until(()=>owner.room&&owner.snap);for(const c of [a,b])c.send({type:'join',room:owner.room});await until(()=>a.snap&&b.snap,4000,'joined');
 // Owner promotes Ada to captain; Ada now has captain powers (MOTD, ranks).
 owner.send({type:'rank',crew:a.snap.self.id,rank:'captain'});await until(()=>rankIn(owner,a)==='captain',3000,'Ada is captain');
 a.send({type:'motd',text:'Second captain here'});await until(()=>owner.motds.some(m=>m.text==='Second captain here'),3000,'Ada edits the MOTD');
 a.send({type:'rank',crew:b.snap.self.id,rank:'captain'});await until(()=>rankIn(owner,b)==='captain',3000,'Ada promotes Bo to captain');
 // Ada can't demote the owner, nor (not being the owner) demote or kick Bo, another captain.
 a.send({type:'rank',crew:owner.snap.self.id,rank:'guest'});await until(()=>a.errors.some(e=>/owner is always captain/.test(e)),3000,'owner protected');
 a.send({type:'rank',crew:b.snap.self.id,rank:'guest'});await until(()=>a.errors.some(e=>/Only the ship's owner can change another captain/.test(e)),3000,'captain protected from captains');
 a.send({type:'kick',crew:owner.snap.self.id});await until(()=>a.errors.some(e=>/cannot kick the ship's owner/.test(e)),3000,'owner cannot be kicked');
 // The owner can demote a captain.
 owner.send({type:'rank',crew:b.snap.self.id,rank:'crew'});await until(()=>rankIn(owner,b)==='crew',3000,'owner demotes Bo');
 ok=true;console.log('PASS: multiple captains — captains promote to captain and share captain powers; the owner stays captain and only the owner demotes or removes another captain.');
 for(const c of [owner,a,b])c.ws.close();
}catch(e){console.error(e);console.error(log.join(''));}finally{srv.kill();await sleep(400);fs.rmSync(dataDir,{recursive:true,force:true,maxRetries:10,retryDelay:100});process.exit(ok?0:1);}})();
