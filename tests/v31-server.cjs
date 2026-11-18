'use strict';
// v31: multiplayer only. Ships that stay critical, or sit empty, for RETURN_SECONDS go back to the Freeport tied to
// their zone; the main menu lists every ship on the server (other players' too).
const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{WebSocket}=require('ws');
const root=path.resolve(__dirname,'..');process.chdir(root);
const {createRoom}=require('../server/room.cjs'),{ZoneBus}=require('../server/zone-bus.cjs'),era=require('../dist/modules/era.js');

// ---- The client has no single-player mode left -------------------------------------------------------------
{const ui=fs.readFileSync('dist/interface.js','utf8'),boot=fs.readFileSync('dist/bootstrap.js','utf8'),game=fs.readFileSync('dist/game.js','utf8'),net=fs.readFileSync('dist/network.js','utf8');
 assert.ok(!/Local sandbox|Single-player|joinLocal|Testing Lab/.test(ui),'no local/single-player lobby entries');
 assert.ok(/id="serverurl"/.test(ui)&&/id="devtoken"/.test(ui),'the menu asks for the server address and token');
 assert.ok(!/localStorage\.getItem\('freeport-v1'\)/.test(boot),'no local save is loaded');
 assert.ok(!/step\(1\/60\)/.test(game.slice(game.indexOf('function frame('),game.indexOf('function frame(')+400)),'the page never simulates a ship itself');
 assert.ok(!/localMethods\.(edit|interact|craft|save|leaveShip)\(/.test(net),'actions only go to the server');
 assert.deepEqual(Object.keys(era.HOME_FREEPORT).sort(),Object.keys(era.ZONES).sort(),'every zone has a home Freeport');
 assert.equal(era.HOME_FREEPORT.finch2,'freeport2');assert.equal(era.HOME_FREEPORT.sparrow,'freeport3');assert.equal(era.HOME_FREEPORT.finch,'freeport');
 console.log('PASS: multiplayer only — the menu takes a server address and token, no local saves or local simulation, every zone maps to a home Freeport.');}

// ---- Critical ships are towed home after a minute -----------------------------------------------------------
{const bus=new ZoneBus();const r={id:'A',name:'Alpha'};r.game=createRoom(null,bus.hooksFor(r));r.game.join('A-crew','Cap',true,'captain');const run=c=>r.game.run(c);
 const step=n=>{for(let i=0;i<n;i++){r.game.tick(1/60);bus.step([r],1/60);}};
 r.game.command('A-crew',{action:'dev',op:'finch2'});step(3);assert.equal(run('zone'),'finch2');
 run('shipHP=0');step(60);assert.ok(run('criticalFor')>.9,'the critical timer runs');assert.ok(r.game.snapshot('A-crew').criticalFor>.9,'and is sent to the crew');
 run('shipHP=50');step(2);assert.ok(run('criticalFor')>.9,'shields coming back do not stop it');
 run('shipHP=0;criticalFor='+(era.RETURN_SECONDS-.1));step(20);assert.equal(run('zone'),'freeport2','towed to the Freeport tied to Finch II');assert.equal(run('criticalFor'),0);
 step(3);assert.ok(bus.sims.get('freeport2')?.api.fleet.has('A'),'and it is in that Freeport’s shared world');
 console.log('PASS: critical ships — a '+era.RETURN_SECONDS+' s timer while critical (started by going critical), then towed to the zone’s Freeport (Finch II → Freeport II).');}

// ---- Real server: empty ships go home, other players' ships are listed ---------------------------------------
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),PORT=23000+Math.floor(Math.random()*900),DEV='v31-dev',dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'fp-v31-'));
const srv=spawn(process.execPath,['server/server.cjs','--port',String(PORT)],{cwd:root,env:{...process.env,DATA_DIR:dataDir,DEV_TOKEN:DEV,SAVE_INTERVAL_MS:'400',SHIP_RETURN_MS:'1500'}});const log=[];srv.stderr.on('data',d=>log.push(String(d)));
function client(name,admin){return new Promise(res=>{const ws=new WebSocket(`ws://127.0.0.1:${PORT}/play`,{headers:{origin:`http://127.0.0.1:${PORT}`}});const c={ws,seq:0,snaps:[],errors:[],rooms:null};
 ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='hello')ws.send(JSON.stringify({type:'hello',protocol:1,name,devToken:admin?DEV:undefined}));if(m.type==='welcome'){c.rooms=m.rooms;res(c);}if(m.type==='rooms')c.rooms=m.rooms;if(m.type==='joined')c.room=m.room;if(m.type==='error')c.errors.push(m.message);if(m.type==='snapshot')c.snaps.push(m.state);});
 c.send=o=>ws.send(JSON.stringify(o));c.act=(action,x={})=>c.send({type:'action',action,seq:++c.seq,aim:{x:0,y:0},...x});});}
const until=async(f,ms=4000,label='condition')=>{const t=Date.now();while(!f()){if(Date.now()-t>ms)throw Error('Timed out: '+label);await sleep(25);}};
(async()=>{let ok=false;try{await sleep(800);
 const a=await client('Ann',true),b=await client('Bob',true);
 a.send({type:'create',name:'Wanderer'});await until(()=>a.room&&a.snaps.length>1);a.act('dev',{op:'sparrow'});await until(()=>a.snaps.at(-1).zone==='sparrow',3000,'in Sparrow');
 b.send({type:'list'});await until(()=>b.rooms?.some(r=>r.name==='Wanderer'),3000,'listed');const seen=b.rooms.find(r=>r.name==='Wanderer');
 assert.equal(seen.mine,false,'another player’s ship shows up for Bob');assert.equal(seen.players,1);assert.equal(seen.zone,'sparrow');
 // Ann leaves: the ship is empty; the menu shows the return countdown, then it goes home to Freeport III.
 a.send({type:'leave'});await until(()=>a.rooms?.find(r=>r.name==='Wanderer')?.players===0,3000,'empty');
 a.send({type:'list'});await sleep(150);assert.ok(a.rooms.find(r=>r.name==='Wanderer').returnIn>0,'menu shows the return timer');
 await sleep(2300);a.send({type:'list'});await sleep(150);const back=a.rooms.find(r=>r.name==='Wanderer');assert.equal(back.zone,'freeport3','returned to the Freeport tied to Sparrow');assert.equal(back.returnIn,0);
 a.snaps.length=0;a.send({type:'join',room:back.id});await until(()=>a.snaps.length>1);assert.equal(a.snaps.at(-1).zone,'freeport3','rejoining finds it in Freeport III');
 // A ship that is not in memory when its minute runs out goes home the next time it loads.
 b.send({type:'create',name:'Drifter'});await until(()=>b.room&&b.snaps.length>1);b.act('dev',{op:'finch2'});await until(()=>b.snaps.at(-1).zone==='finch2',3000,'Finch II');
 b.send({type:'leave'});await sleep(2600);b.send({type:'list'});await sleep(150);assert.equal(b.rooms.find(r=>r.name==='Drifter').zone,'freeport2','Finch II → Freeport II');
 ok=true;console.log('PASS: real server — other players’ ships listed in the menu, an empty ship shows a return timer and goes back to its zone’s Freeport after the minute (Sparrow → Freeport III, Finch II → Freeport II).');
}catch(e){console.error(e);console.error(log.join(''));}finally{srv.kill();await sleep(400);fs.rmSync(dataDir,{recursive:true,force:true,maxRetries:10,retryDelay:100});process.exit(ok?0:1);}})();
