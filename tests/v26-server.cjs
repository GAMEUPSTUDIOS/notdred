'use strict';
// v26 on the server: one mission schedule for every ship (dev "spawn mission", gold portals, everybody sent home
// when it closes), random names for unnamed ships, captain-only renames and the "/" leaderboard.
const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{WebSocket}=require('ws');
const root=path.resolve(__dirname,'..');process.chdir(root);
const {createRoom}=require('../server/room.cjs'),{ZoneBus}=require('../server/zone-bus.cjs'),era=require('../dist/modules/era.js');

// ---- Zone bus: shared mission schedule ---------------------------------------------------------------------
{const bus=new ZoneBus();
 function ship(id,name){const r={id,name};r.game=createRoom(null,bus.hooksFor(r));r.game.join(id+'-crew',name,true,true);r.run=c=>r.game.run(c);return r;}
 const A=ship('A','Alpha'),B=ship('B','Bravo'),ships=[A,B];
 const step=(n=1)=>{for(let i=0;i<n;i++){for(const r of ships)r.game.tick(1/60);bus.step(ships,1/60);}};
 step(2);assert.equal(A.run('currentMission().active'),null);
 A.game.command('A-crew',{action:'dev',op:'mission',zone:'pits'});step(2);
 assert.equal(bus.mission.active,'pits');for(const r of ships)assert.equal(r.run('currentMission().active'),'pits','every ship sees the mission');
 assert.ok(B.run('zonePortals().some(q=>q.mission&&q.to==="pits")'),'gold portal in Freeport for other ships too');
 assert.ok(B.run('notices=[...crew.values()][0].notices||[];notices.some(n=>/Mission started/.test(n))'),'announced to every ship');
 for(const r of ships)r.run('piloting=true;player.setActive(false);travelZone("pits","entry")');step(2);
 assert.equal(A.run('zoneData.pits.seed'),B.run('zoneData.pits.seed'),'same mission layout');assert.equal(A.run('rocks.size'),B.run('rocks.size'));
 const t0=A.run('[...rocks.values()].filter(r=>r.kind==="treasure").length');A.game.command('A-crew',{action:'dev',op:'treasure'});step(3);
 assert.equal(B.run('[...rocks.values()].filter(r=>r.kind==="treasure").length'),t0+1,'new treasure appears for everyone');
 A.game.command('A-crew',{action:'dev',op:'endmission'});step(3);for(const r of ships)assert.equal(r.run('zone'),'freeport','ships sent home when it closes');
 assert.equal(B.run('zonePortals().some(q=>q.mission)'),false);
 console.log('PASS: zone bus — one mission schedule for all ships, dev spawn, shared layout and treasure, gold portals, everyone home on close.');}

// ---- Real server ------------------------------------------------------------------------------------------
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),PORT=21000+Math.floor(Math.random()*900),DEV='v26-dev',dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'fp-v26-'));
const srv=spawn(process.execPath,['server/server.cjs','--port',String(PORT)],{cwd:root,env:{...process.env,DATA_DIR:dataDir,DEV_TOKEN:DEV,SAVE_INTERVAL_MS:'500'}});const log=[];srv.stderr.on('data',d=>log.push(String(d)));
function client(name,admin){return new Promise(res=>{const ws=new WebSocket(`ws://127.0.0.1:${PORT}/play`,{headers:{origin:`http://127.0.0.1:${PORT}`}});const c={ws,seq:0,msgs:[],snaps:[],errors:[],notices:[]};
 ws.on('message',raw=>{const m=JSON.parse(raw);c.msgs.push(m);if(m.type==='hello')ws.send(JSON.stringify({type:'hello',protocol:1,name,devToken:admin?DEV:undefined}));if(m.type==='welcome')res(c);if(m.type==='joined'){c.room=m.room;c.joinedName=m.name;}if(m.type==='rooms')c.rooms=m.rooms;if(m.type==='leaderboard')c.board=m;if(m.type==='error')c.errors.push(m.message);if(m.type==='snapshot'){c.snaps.push(m.state);c.notices.push(...(m.state.notices||[]));}});
 c.send=o=>ws.send(JSON.stringify(o));c.act=(action,x={})=>c.send({type:'action',action,seq:++c.seq,aim:{x:0,y:0},...x});});}
const until=async(f,ms=4000,label='condition')=>{const t=Date.now();while(!f()){if(Date.now()-t>ms)throw Error('Timed out: '+label);await sleep(25);}};
(async()=>{let ok=false;try{await sleep(800);
 const cap=await client('Cap',true),mate=await client('Mate');
 cap.send({type:'create',name:''});await until(()=>cap.room,4000,'create');assert.match(cap.joinedName,/^\w+ \w+$/,'blank name → random name');
 await until(()=>cap.snaps.length>1);assert.equal(cap.snaps.at(-1).name,cap.joinedName,'snapshot carries the ship name');
 mate.send({type:'join',room:cap.room});await until(()=>mate.snaps.length>1);
 mate.act('rename',{name:'Mutiny'});await sleep(300);assert.notEqual(mate.snaps.at(-1).name,'Mutiny','only the captain renames');
 cap.act('rename',{name:'Kestrel'});await until(()=>cap.snaps.at(-1).name==='Kestrel',3000,'rename');
 cap.act('rename',{name:'Again'});await sleep(300);assert.equal(cap.snaps.at(-1).name,'Kestrel','once per hour');
 cap.send({type:'list'});await until(()=>cap.rooms?.some(r=>r.name==='Kestrel'),3000,'list shows new name');
 // Score from a bot kill shows on the leaderboard.
 cap.act('dev',{op:'finch'});await sleep(200);cap.act('dev',{op:'killbots',species:'red'});await until(()=>(cap.snaps.at(-1).score||0)>0,3000,'score');
 const other=await client('Other');other.send({type:'create',name:'Second Ship'});await until(()=>other.room);
 mate.send({type:'leaderboard'});await until(()=>mate.board,3000,'leaderboard');
 assert.equal(mate.board.ships[0].name,'Kestrel','ranked by score');assert.ok(mate.board.ships.some(s=>s.name==='Second Ship'));assert.equal(mate.board.you,cap.room);
 // Dev spawn mission reaches every client's snapshot.
 cap.act('dev',{op:'mission',zone:'canary'});await until(()=>other.snaps.at(-1)?.mission?.active==='canary',3000,'mission in snapshot');
 assert.ok(other.notices.some(n=>/Mission started: Canary/.test(n)),'other ships are told');
 ok=true;console.log('PASS: real server — random names, captain-only hourly rename, names in lists/snapshots, leaderboard by score, dev-spawned mission reaches every ship.');
}catch(e){console.error(e);console.error(log.join(''));}finally{srv.kill();await sleep(400);fs.rmSync(dataDir,{recursive:true,force:true,maxRetries:10,retryDelay:100});process.exit(ok?0:1);}})();
