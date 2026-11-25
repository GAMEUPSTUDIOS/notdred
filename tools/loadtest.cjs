#!/usr/bin/env node
'use strict';
// notdred.io load test: simulated players and ships against a real server, to see how many a machine can carry and
// to shake out MMO / PvP-war bugs.
//
//   node tools/loadtest.cjs                          24 ships (3 players each) fighting in Sparrow I for 45 s
//   node tools/loadtest.cjs --ships 40 --crew 2      bigger war
//   node tools/loadtest.cjs --ramp 8,16,32,48        grow in stages and report each one (find this machine's limit)
//   node tools/loadtest.cjs --zone finch2 --seconds 90
//   node tools/loadtest.cjs --url ws://127.0.0.1:8080/play --token <DEV_TOKEN>   against a running server (see below)
//
// By default it starts its own private server on a free port with a throwaway data folder, so it measures this
// machine without touching your real ships. With --url it uses that server instead: its ships are created there and
// deleted again at the end, and that server's MAX_LOADED_SHIPS (16 by default) caps how many can be loaded at once.
//
// Every ship: a captain (with the host token, to set the test up) who flies and fights from the helm, plus crew who
// walk, jump and switch items aboard. Captains steer toward the nearest other ship and fire their RCs at it; a share
// of ships (--travel) keep leaving through Freeport's portal and coming back. Ships that stay critical are towed home
// after a few seconds (--sink, instead of the real 10 minutes) so kills get credited.
// Reported per stage: server tick time (average, worst, % of ticks it fell behind), server CPU and memory, snapshot
// rate, size and gaps per player, bandwidth (before compression and on the wire), ping, errors, and the war's
// damage / disables / kills. The simulated players run on this machine too and take CPU of their own, so on a small
// machine the real capacity (players on their own computers) is somewhat higher than reported.
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{WebSocket}=require('ws');
const root=path.resolve(__dirname,'..');
const arg=(name,def)=>{const i=process.argv.indexOf('--'+name);if(i<0)return def;const v=process.argv[i+1];return v==null||v.startsWith('--')?true:v;};
if(arg('help',false)){console.log(fs.readFileSync(__filename,'utf8').split('\n').slice(2,23).map(l=>l.replace(/^\/\/ ?/,'')).join('\n'));process.exit(0);}
const SHIPS=+arg('ships',24),CREW=Math.max(1,+arg('crew',3)),SECONDS=+arg('seconds',45),ZONE=String(arg('zone','sparrow')),TRAVEL=+arg('travel',.15),SINK=+arg('sink',6),
 RAMP=String(arg('ramp','')).split(',').map(Number).filter(n=>n>0),URL_ARG=arg('url',null),TOKEN=arg('token',null),JSON_OUT=!!arg('json',false),QUIET=!!arg('quiet',false);
const STAGES=RAMP.length?RAMP:[SHIPS];
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),rnd=(a,b)=>a+Math.random()*(b-a),pct=(a,p)=>{if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(s.length*p))];};
const log=(...a)=>{if(!QUIET)console.log(...a);};

// ---- server ------------------------------------------------------------------------------------------------------
let srv=null,port=0,dataDir=null,devToken=TOKEN,wsUrl=URL_ARG,httpBase=null;const serverLog=[];
async function startServer(){
 if(wsUrl){if(!devToken)throw Error('--url needs --token (the server\'s DEV_TOKEN) to set ships up.');const u=new URL(wsUrl);httpBase=(u.protocol==='wss:'?'https:':'http:')+'//'+u.host;return;}
 port=20000+Math.floor(Math.random()*20000);dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'notdred-load-'));devToken='load-'+Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2);
 const most=Math.max(...STAGES);
 srv=spawn(process.execPath,['server/server.cjs','--port',String(port)],{cwd:root,env:{...process.env,DATA_DIR:dataDir,DEV_TOKEN:devToken,HOST:'127.0.0.1',MAX_LOADED_SHIPS:String(most+8),SHIP_RETURN_MS:'3600000',IDLE_UNLOAD_MS:'3600000'}});
 srv.stdout.on('data',d=>serverLog.push(String(d)));srv.stderr.on('data',d=>serverLog.push('ERR '+String(d)));
 wsUrl=`ws://127.0.0.1:${port}/play`;httpBase=`http://127.0.0.1:${port}`;
 for(let i=0;i<100;i++){try{const r=await fetch(httpBase+'/health');if(r.ok)return;}catch{}await sleep(100);}throw Error('server did not start:\n'+serverLog.join(''));}
async function health(){try{return await (await fetch(httpBase+'/health')).json();}catch{return null;}}
// CPU and memory of our own server process (Linux /proc); null against a remote server.
let cpuPrev=null;function procStats(){if(!srv)return null;try{const st=fs.readFileSync(`/proc/${srv.pid}/stat`,'utf8').split(') ')[1].split(' '),ticks=+st[11]+ +st[12],now=Date.now(),hz=100;
 const rss=+(/VmRSS:\s+(\d+)/.exec(fs.readFileSync(`/proc/${srv.pid}/status`,'utf8'))||[0,0])[1];let cpu=null;if(cpuPrev)cpu=(ticks-cpuPrev.ticks)/hz/((now-cpuPrev.now)/1000)*100;cpuPrev={ticks,now};return {cpu,rssMB:rss/1024};}catch{return null;}}

// ---- players -----------------------------------------------------------------------------------------------------
const ships=[];const M={};const wireNow=()=>{let n=0;for(const sh of ships)for(const c of [sh.cap,...sh.crew])n+=c.ws._socket?.bytesRead||0;return n;};
function resetMetrics(){Object.assign(M,{wire0:wireNow(),snaps:0,bytes:0,maxBytes:0,gaps:[],rtt:[],errors:{},closes:0,shots:0,cpu:[],tick:[],worst:0,behind:[],egress:[],t0:Date.now()});}resetMetrics();
let evalSeq=0;
function client(name,admin){return new Promise((resolve,reject)=>{const ws=new WebSocket(wsUrl,{headers:{origin:httpBase}});const c={ws,name,seq:0,skip:0,snap:null,room:null,closing:false,lastSnapAt:0,waiting:new Map(),war:null};
 ws.on('message',raw=>{/* the load generator shares the machine: crew only fully read one snapshot in ten (sizes and timing are counted for all) */
  if(raw.length>200&&raw[9]===115/* {"type":"s… */){const now=Date.now();if(c.lastSnapAt)M.gaps.push(now-c.lastSnapAt);c.lastSnapAt=now;M.snaps++;M.bytes+=raw.length;M.maxBytes=Math.max(M.maxBytes,raw.length);if(++c.skip%(admin?2:10))return;/* captains steer ten times a second: every other snapshot is enough */try{const s=JSON.parse(raw).state;if(s.far)c.far=s.far;if('war' in s)c.war=s.war;c.snap=s;}catch{}return;}
  let m;try{m=JSON.parse(raw);}catch{return;}
  if(m.type==='hello')ws.send(JSON.stringify({type:'hello',protocol:1,name,devToken:admin?devToken:undefined}));
  else if(m.type==='welcome'){c.self=m.self;c.admin=m.admin;resolve(c);}
  else if(m.type==='joined'){c.room=m.room;c.joinedAt=Date.now();}
  else if(m.type==='pong'){if(m.t)M.rtt.push(Date.now()-m.t);}
  else if(m.type==='evalResult'){const w=c.waiting.get(m.id);if(w){c.waiting.delete(m.id);w(m);}}
  else if(m.type==='error'){const k=String(m.message).replace(/\d+/g,'#').slice(0,90);M.errors[k]=(M.errors[k]||0)+1;}
  else if(m.type==='snapshot'){const now=Date.now();if(c.lastSnapAt)M.gaps.push(now-c.lastSnapAt);c.lastSnapAt=now;M.snaps++;M.bytes+=raw.length;M.maxBytes=Math.max(M.maxBytes,raw.length);const s=m.state;
   if(s.far)c.far=s.far;if('war' in s)c.war=s.war;c.snap=s;}});
 ws.on('close',(code,why)=>{if(!c.closing){M.closes++;const k='closed '+code+(why?.length?' '+why:'');M.errors[k]=(M.errors[k]||0)+1;}});ws.on('error',e=>{if(!c.welcomed)reject(e);});
 c.send=o=>{if(ws.readyState===1)ws.send(JSON.stringify(o));};c.act=(action,extra={})=>c.send({type:'action',action,seq:++c.seq,aim:c.aim||{x:0,y:0},...extra});
 c.eval=(code,target='ship')=>new Promise(res=>{const id=++evalSeq;c.waiting.set(id,res);c.send({type:'eval',id,target,code});setTimeout(()=>{if(c.waiting.delete(id))res({ok:false,error:'timeout'});},8000);});});}
const waitFor=async(fn,ms=8000)=>{const t=Date.now();while(Date.now()-t<ms){if(fn())return true;await sleep(40);}return false;};

// ---- one ship ----------------------------------------------------------------------------------------------------
async function addShip(n){
 const cap=await client('LT'+n+' captain',true);if(!cap.admin)throw Error('the host token was refused');
 cap.send({type:'create',name:'Load '+n});if(!await waitFor(()=>cap.room&&cap.snap))throw Error('ship '+n+' was not created: '+JSON.stringify(M.errors));
 const crew=[];for(let k=1;k<CREW;k++){const c=await client('LT'+n+' crew'+k,false);c.send({type:'join',room:cap.room});crew.push(c);}
 const sh={n,cap,crew,traveler:Math.random()<TRAVEL,phase:'war',until:0,critSince:0,target:null};ships.push(sh);
 await toWar(sh);for(const c of crew)crewLoop(sh,c);pilotLoop(sh);return sh;}
// Arm and take the helm: done with live code (host token), as a dev would set a test up.
async function arm(sh){await sh.cap.eval("for(const m of mounts)if(m.type==='turret'){m.ammo=Math.max(m.ammo||0,240);m.ammoType=m.ammoType||'ammo';}if(!piloting){player.setTransform(V(helm.x,helm.y-.2),0);takeHelm();}piloting");}
async function toWar(sh){sh.cap.act('dev',{op:ZONE});await waitFor(()=>sh.cap.snap?.zone===ZONE,5000);await arm(sh);sh.phase='war';sh.until=Date.now()+rnd(15000,30000);}
async function pilotLoop(sh){const c=sh.cap;let fireAt=0,wander={x:0,y:0},wanderUntil=0;
 while(!sh.stop){await sleep(100);const s=c.snap;if(!s||!s.position)continue;const me=s.position;
  if(s.self&&!s.self.piloting&&s.zone===ZONE&&!sh.arming){sh.arming=true;arm(sh).finally(()=>sh.arming=false);}
  // Travelers: every so often fly to Freeport, go out through its top portal for real (Q at the bar), then come back.
  if(sh.traveler&&sh.phase==='war'&&Date.now()>sh.until){sh.phase='travel';(async()=>{try{sh.cap.act('dev',{op:'freeport'});await waitFor(()=>c.snap?.zone==='freeport',5000);await arm(sh);await c.eval("fly(0,-205)");await sleep(300);c.act('portal');await waitFor(()=>c.snap?.zone==='finch',4000);M.travels=(M.travels||0)+1;await sleep(rnd(1500,4000));}finally{await toWar(sh);}})();}
  if(sh.phase!=='war'||s.zone!==ZONE)continue;
  // Critical for a while: tow home now (stands in for the 10-minute rule so kills happen during a short test).
  if(SINK>0){if(s.shipHP<=0){sh.critSince||=Date.now();if(Date.now()-sh.critSince>SINK*1000&&!sh.sinking){sh.sinking=true;c.eval("returnToFreeport('critical');shipHP=shipMaxHP();zone").then(()=>{M.sinks=(M.sinks||0)+1;sh.critSince=0;setTimeout(()=>toWar(sh).finally(()=>sh.sinking=false),rnd(500,2500));});}}else sh.critSince=0;}
  const others=[...(s.others||[]).map(o=>({x:o.x,y:o.y,vx:o.vx,vy:o.vy,hp:o.hp})),...(c.far||[]).map(f=>({x:f[1],y:f[2],vx:0,vy:0,hp:f[3]}))];
  let t=null,best=Infinity;for(const o of others){const d=Math.hypot(o.x-me.x,o.y-me.y);if(d<best){best=d;t=o;}}
  const keys={};if(Date.now()>wanderUntil){wander={x:rnd(-1,1),y:rnd(-1,1)};wanderUntil=Date.now()+rnd(600,2500);}
  let gx=wander.x,gy=wander.y;if(t){const dx=t.x-me.x,dy=t.y-me.y,d=Math.max(1,best);if(best>45){gx=dx/d+wander.x*.4;gy=dy/d+wander.y*.4;}else if(best<18){gx=-dx/d;gy=-dy/d;}else{gx=-dy/d*(wander.x>0?1:-1)+wander.x*.3;gy=dx/d*(wander.x>0?1:-1)+wander.y*.3;}}
  if(gx>.3)keys.d=true;if(gx<-.3)keys.a=true;if(gy>.3)keys.s=true;if(gy<-.3)keys.w=true;c.act('input',{keys});
  if(t&&best<140&&Date.now()>fireAt){fireAt=Date.now()+rnd(250,500);const lead=best/90;c.aim={x:t.x+(t.vx||0)*lead,y:t.y+(t.vy||0)*lead};c.act('edit');M.shots++;}}}
async function crewLoop(sh,c){let held={},until=0;while(!sh.stop){await sleep(rnd(90,160));const s=c.snap;if(!s)continue;
 if(Date.now()>until){held={};for(const k of ['a','d',' '])if(Math.random()<.35)held[k]=true;until=Date.now()+rnd(200,1200);}c.act('input',{keys:held});
 if(Math.random()<.05)c.act('select',{slot:Math.floor(Math.random()*5)});}}

// ---- run ---------------------------------------------------------------------------------------------------------
async function sample(){const h=await health();if(h?.last10s){M.behind.push(h.last10s.fellBehindPct);M.worst=Math.max(M.worst,h.last10s.worstMs);if(h.last10s.egressKBps!=null)M.egress.push(h.last10s.egressKBps);}if(h)M.tick.push(h.tickMs);const p=procStats();if(p?.cpu!=null)M.cpu.push(p.cpu);M.rss=p?.rssMB??M.rss;M.health=h;}
function warTotals(){let best=null;for(const sh of ships){const w=sh.cap.war;if(w&&w.zone===ZONE&&(!best||w.v>best.v))best=w;}if(!best)return {ships:0,damage:0,disables:0,kills:0,deaths:0,feed:0};
 const t={ships:best.ships,damage:0,disables:0,kills:0,deaths:0,feed:(best.feed||[]).length};for(const r of best.board){t.damage+=r.damage;t.disables+=r.disables;t.kills+=r.kills;t.deaths+=r.deaths;}return t;}
function report(n){const secs=(Date.now()-M.t0)/1000,players=ships.reduce((a,s)=>a+1+s.crew.length,0),avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
 const r={ships:n,players,seconds:+secs.toFixed(0),serverTickMs:+avg(M.tick).toFixed(2),worstTickMs:M.worst,fellBehindPct:+Math.max(0,...M.behind).toFixed(1),cpuPct:M.cpu.length?+avg(M.cpu).toFixed(0):null,memMB:M.rss?+M.rss.toFixed(0):null,
  snapshotsPerPlayerPerSec:+(M.snaps/players/secs).toFixed(1),avgSnapshotKB:+(M.bytes/Math.max(1,M.snaps)/1024).toFixed(2),maxSnapshotKB:+(M.maxBytes/1024).toFixed(1),perPlayerKBps:+(M.bytes/players/secs/1024).toFixed(1),wirePerPlayerKBps:+((wireNow()-M.wire0)/players/secs/1024).toFixed(1),
  serverEgressKBps:M.egress.length?+avg(M.egress).toFixed(0):+(M.bytes/secs/1024).toFixed(0),gapP50ms:pct(M.gaps,.5),gapP99ms:pct(M.gaps,.99),pingP50ms:pct(M.rtt,.5),pingP99ms:pct(M.rtt,.99),
  shotsFired:M.shots,travels:M.travels||0,towed:M.sinks||0,war:warTotals(),disconnects:M.closes,errors:M.errors};
 r.ok=r.fellBehindPct<3&&r.gapP99ms<400&&r.disconnects===0&&!Object.keys(r.errors).length;return r;}
function print(r){if(JSON_OUT)return;const w=r.war;console.log(`\n── ${r.ships} ships · ${r.players} players · ${r.seconds}s in ${ZONE} ──`);
 console.log(`server   tick ${r.serverTickMs} ms avg, worst ${r.worstTickMs} ms, fell behind ${r.fellBehindPct}% of ticks`+(r.cpuPct!=null?`, CPU ${r.cpuPct}%, memory ${r.memMB} MB`:''));
 console.log(`network  ${r.snapshotsPerPlayerPerSec} snapshots/s per player, ${r.avgSnapshotKB} KB avg (max ${r.maxSnapshotKB}), ${r.perPlayerKBps} KB/s per player before compression, ${r.wirePerPlayerKBps} KB/s on the wire`);
 console.log(`lag      snapshot gaps p50 ${r.gapP50ms} ms / p99 ${r.gapP99ms} ms, ping p50 ${r.pingP50ms} ms / p99 ${r.pingP99ms} ms`);
 console.log(`war      ${r.shotsFired} volleys, ${w.damage} damage, ${w.disables} disables, ${w.kills} kills, ${w.deaths} deaths (${w.ships} ships on the board), ${r.towed} towed home, ${r.travels} portal trips`);
 console.log(`health   ${r.disconnects} disconnects, errors ${JSON.stringify(r.errors)} → ${r.ok?'OK':'STRUGGLING'}`);}
(async()=>{const results=[];let code=1;try{await startServer();log(`load test against ${wsUrl}${srv?' (private server, throwaway data)':''}`);
 const pinger=setInterval(()=>{for(const sh of ships)sh.cap.send({type:'ping',t:Date.now()});},2000);
 for(const n of STAGES){log(`stage: growing to ${n} ships…`);while(ships.length<n){try{await addShip(ships.length+1);}catch(e){log('  could not add ship '+(ships.length+1)+': '+e.message);break;}}
  /* settle: the server's 10-second health window then holds no ship loading */await sleep(10500);resetMetrics();procStats();const end=Date.now()+SECONDS*1000;while(Date.now()<end){await sleep(2000);await sample();}
  const r=report(ships.length);results.push(r);print(r);}
 clearInterval(pinger);
 const errs=serverLog.filter(l=>/ERR|Error|failed|stopped/.test(l)&&!/falling behind/.test(l));if(errs.length&&!JSON_OUT){console.log('\nserver log errors:\n'+errs.slice(0,12).join(''));}
 if(arg('fields',false)&&ships[0]?.cap.snap){const s=ships[0].cap.snap,sizes=Object.entries(s).map(([k,v])=>[k,JSON.stringify(v)?.length||0]).sort((x,y)=>y[1]-x[1]);console.log('\nsnapshot fields of one captain (bytes): '+sizes.slice(0,16).map(([k,n])=>k+' '+n).join(', '));
  const o=s.others?.[0];if(o)console.log('one nearby ship (bytes): '+Object.entries(o).map(([k,v])=>[k,JSON.stringify(v)?.length||0]).sort((x,y)=>y[1]-x[1]).slice(0,10).map(([k,n])=>k+' '+n).join(', '));}
 if(JSON_OUT)console.log(JSON.stringify({zone:ZONE,crew:CREW,stages:results,serverErrors:errs.slice(0,12)},null,1));
 else{const ok=results.filter(r=>r.ok);console.log('\n'+(ok.length?`This machine kept up with ${ok[ok.length-1].ships} ships / ${ok[ok.length-1].players} players`+(ok.length<results.length?`; at ${results[ok.length]?.ships} ships it started to struggle.`:'.'):'This machine struggled at every stage.'));}
 code=results.every(r=>r.ok)&&!errs.length?0:2;}
 catch(e){console.error(e.stack||e);}
 finally{for(const sh of ships){sh.stop=true;}await sleep(200);
  if(!srv){/* remote: leave and delete the test ships */for(const sh of ships){for(const c of [sh.cap,...sh.crew]){c.closing=true;c.send({type:'leave'});}}await sleep(800);for(const sh of ships){if(sh.cap.room)sh.cap.send({type:'delete',room:sh.cap.room});}await sleep(800);}
  for(const sh of ships)for(const c of [sh.cap,...sh.crew]){c.closing=true;try{c.ws.close();}catch{}}
  if(srv){srv.kill('SIGTERM');await sleep(400);try{fs.rmSync(dataDir,{recursive:true,force:true});}catch{}}process.exit(code);}})();
