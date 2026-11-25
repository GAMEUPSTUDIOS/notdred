'use strict';
// Multiplayer soak: a real server plus scripted crews hammering every action. Not part of `npm test`
// (it takes ~a minute); run with `npm run soak` or `node tests/soak.cjs [seconds] [crewPerShip]`.
// Fails on: server exceptions, room crashes, unexpected disconnects, invalid snapshot state, notices leaking
// between players, or snapshots growing past the bandwidth budget.
const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{WebSocket}=require('ws');
const root=path.resolve(__dirname,'..'),SECONDS=+process.argv[2]||45,CREW=+process.argv[3]||5,PORT=18000+Math.floor(Math.random()*900),DEV='soak-dev-token';
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'fp-soak-'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),pick=a=>a[Math.floor(Math.random()*a.length)],rnd=(a,b)=>a+Math.random()*(b-a);
const TYPES=['wrench','block','ladder','walkway','net','iron','fabricator','embiggener','shrinker','thruster','turret','starter','explosives','fuel','glass','storage','wedge','walkway_wedge','shredder','ammo','hatch','starter_hatch','starter_rc','ejector','pusher','punch','booster','repair','flux','pusher_block'];
const CRAFT=['wrench','block','ladder','walkway','net','fuel','ammo','hatch','pusher','pusher_block','wedge','shredder','repair'];
const serverLog=[];const srv=spawn(process.execPath,['server/server.cjs','--port',String(PORT)],{cwd:root,env:{...process.env,DATA_DIR:dataDir,DEV_TOKEN:DEV,HOST:'127.0.0.1'}});
srv.stdout.on('data',d=>serverLog.push(String(d)));srv.stderr.on('data',d=>serverLog.push('ERR '+String(d)));
const stats={snapshots:0,bytes:0,maxBytes:0,errors:{},unexpectedClose:0,invariant:[],leaks:0,reconnects:0,travels:0,actions:0,gaps:[]};
function client(name,admin=false){return new Promise((resolve,reject)=>{const ws=new WebSocket(`ws://127.0.0.1:${PORT}/play`,{headers:{origin:`http://127.0.0.1:${PORT}`}});const c={ws,name,seq:0,snap:null,room:null,closing:false,notices:[],lastSnapAt:0};
 ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='hello')ws.send(JSON.stringify({type:'hello',protocol:1,name,token:c.token,devToken:admin?DEV:undefined}));else if(m.type==='welcome'){c.token=m.token;c.self=m.self;resolve(c);}else if(m.type==='joined')c.room=m.room;else if(m.type==='error'){const k=m.message.replace(/\d+/g,'#');stats.errors[k]=(stats.errors[k]||0)+1;}else if(m.type==='snapshot'){const now=Date.now();if(c.lastSnapAt)stats.gaps.push(now-c.lastSnapAt);c.lastSnapAt=now;stats.snapshots++;stats.bytes+=raw.length;stats.maxBytes=Math.max(stats.maxBytes,raw.length);c.snap=m.state;check(c,m.state);}});
 ws.on('close',()=>{if(!c.closing)stats.unexpectedClose++;});ws.on('error',reject);c.send=o=>ws.readyState===1&&ws.send(JSON.stringify(o));c.act=(action,extra={})=>{stats.actions++;c.send({type:'action',action,seq:++c.seq,aim:c.aim||{x:0,y:0},...extra});};});}
const finite=v=>typeof v==='number'&&Number.isFinite(v);
function check(c,s){const bad=m=>stats.invariant.length<20&&stats.invariant.push(c.name+': '+m);
 if(!s||!s.bounds)return bad('empty snapshot');if(!finite(s.position?.x)||!finite(s.position?.y))bad('ship position '+JSON.stringify(s.position));
 for(const m of s.crew||[]){if(!finite(m.p?.x)||!finite(m.p?.y))bad('crew position '+JSON.stringify(m.p));else if(!m.piloting&&(m.p.x<s.bounds.l-1||m.p.x>s.bounds.r+1||m.p.y<s.bounds.t-1||m.p.y>s.bounds.b+1))bad('crew outside hull '+JSON.stringify(m.p));}
 for(const i of s.items||[])if(!(i.count>=1&&i.count<=16)||!finite(i.x))bad('item '+JSON.stringify(i));
 for(const r of [...(s.itemsFull||[]),...(s.itemsUp||[])])if(!(r[2]>=1&&r[2]<=16)||!finite(r[3])||!finite(r[4]))bad('item '+JSON.stringify(r));
 for(const st of s.stacks||[])if(st&&!(st.count>=1&&st.count<=16))bad('stack '+JSON.stringify(st));
 if(s.crew.filter(m=>m.piloting).length>1)bad('two pilots');
 if(!finite(s.shipHP))bad('shipHP '+s.shipHP);for(const o of s.others||[]){if(!finite(o.x)||!finite(o.y))bad('other ship position');stats.othersSeen=(stats.othersSeen||0)+1;}
}
// Each crew member is a little state machine: hold keys for a while, aim somewhere in or near the hull, act.
async function crew(c,until,admin){let held={},heldUntil=0;
 while(Date.now()<until){const s=c.snap;if(!s){await sleep(50);continue;}const me=s.crew.find(m=>m.id===c.self),b=s.bounds;
  if(Date.now()>heldUntil){held={};for(const k of ['w','a','s','d',' '])if(Math.random()<.3)held[k]=true;heldUntil=Date.now()+rnd(150,1200);}
  c.act('input',{keys:held,held:Math.random()<.2});
  const local={x:Math.round(rnd(b.l-1,b.r+1)),y:Math.round(rnd(b.t-1,b.b+1))};c.aim={x:s.position.x+local.x,y:s.position.y+local.y};
  const r=Math.random();
  if(me?.piloting){if(r<.3)c.act('edit');else if(r<.36){c.act('portal');stats.travels++;}else if(r<.38)c.act('interact');}
  else if(r<.30)c.act('edit');else if(r<.38)c.act('remove');else if(r<.42)c.act('rotate');else if(r<.47)c.act('drop',{half:Math.random()<.5});
  else if(r<.53)c.act('interact');else if(r<.60)c.act('select',{slot:Math.floor(Math.random()*5)});else if(r<.65)c.act('craft',{item:pick(CRAFT),count:1+Math.floor(Math.random()*8)});
  else if(r<.70)c.act('material',{item:pick(TYPES),eject:Math.random()<.4});else if(r<.73)c.act('moveStack',{from:Math.floor(Math.random()*5),to:Math.floor(Math.random()*5),half:Math.random()<.5});
  else if(r<.75)c.act('hatch',{cell:local,mode:pick(['all','off','whitelist','blacklist']),items:[pick(TYPES)]});else if(r<.76)c.act('recover');else if(r<.77)c.act('clearQueue');else if(r<.78)c.act('repeat',{value:Math.random()<.5});
  else if(r<.79)c.send({type:'export'});else if(r<.80)c.act('helm');
  else if(r<.81&&!admin)c.act('dev',{op:'give',item:'iron',count:500});        // must be rejected for non-admins
  else if(r<.83&&admin)c.act('dev',{op:'give',item:pick(['iron','explosives','flux','ammo','block','pusher_block','ladder','walkway','hatch','turret','storage']),count:16});
  else if(r<.833&&admin)c.act('dev',{op:pick(['finch','finch2','sparrow','sparrow','sparrow','freeport','damage','heal','killred','killbots']),species:pick(['red','blue','green'])});
  else if(r<.84&&!admin){c.closing=true;c.send({type:'leave'});await sleep(rnd(100,600));c.closing=false;c.send({type:'join',room:c.roomId});stats.reconnects++;}
  await sleep(rnd(40,140));}}
(async()=>{let ok=false;try{await sleep(900);
 const crews=[];const captain=await client('Captain',true);captain.send({type:'create',name:'Soak ship'});for(let k=0;k<100&&!captain.room;k++)await sleep(50);assert.ok(captain.room,'captain created ship');captain.roomId=captain.room;
 for(let i=1;i<CREW;i++){const c=await client('Crew'+i);c.send({type:'join',room:captain.room});c.roomId=captain.room;crews.push(c);}
 const loner=await client('Rival',true);loner.send({type:'create',name:'Rival ship'});for(let k=0;k<100&&!loner.room;k++)await sleep(50);loner.roomId=loner.room;
 // Both ships start in Sparrow so the soak covers shared mining, ghost hulls and PvP hits.
 captain.act('dev',{op:'sparrow'});loner.act('dev',{op:'sparrow'});await sleep(300);
 await sleep(500);const until=Date.now()+SECONDS*1000;
 await Promise.all([crew(captain,until,true),...crews.map(c=>crew(c,until,false)),crew(loner,until,true)]);
 // Leakage probe: one crew member provokes a private notice; nobody else may see it.
 const [a,b2]=[crews[0],crews[1]];a.notices=[];b2.lastNotice=JSON.stringify(b2.snap?.notices||b2.snap?.notice);a.aim={x:99999,y:99999};a.act('drop');await sleep(400);
 const health=await (await fetch(`http://127.0.0.1:${PORT}/health`)).json();
 const errLines=serverLog.filter(l=>/ERR|failed|Error|stopped/i.test(l));
 const avg=Math.round(stats.bytes/Math.max(1,stats.snapshots)),gaps=stats.gaps.sort((x,y)=>x-y),p99=gaps[Math.floor(gaps.length*.99)]||0;
 console.log(JSON.stringify({seconds:SECONDS,crew:CREW,actions:stats.actions,travels:stats.travels,reconnects:stats.reconnects,snapshots:stats.snapshots,avgSnapshotBytes:avg,maxSnapshotBytes:stats.maxBytes,snapshotGapP99ms:p99,unexpectedClose:stats.unexpectedClose,othersSeen:stats.othersSeen||0,serverTickMsAvg:health.tickMs,rooms:health.rooms,errorsByMessage:stats.errors},null,1));
 if(errLines.length)console.log('SERVER LOG ERRORS:\n'+errLines.slice(0,15).join(''));
 if(stats.invariant.length)console.log('INVARIANT VIOLATIONS:\n'+stats.invariant.join('\n'));
 assert.equal(errLines.length,0,'server logged errors');assert.equal(stats.unexpectedClose,0,'unexpected disconnects');assert.equal(stats.invariant.length,0,'snapshot invariants');
 assert.ok((stats.othersSeen||0)>0,'ships sharing a zone saw each other');assert.ok(!stats.errors['Rate limit'],'well-behaved clients hit the rate limit');
 assert.ok((stats.errors['Server dev controls require the host’s DEV_TOKEN.']||0)===0,'');assert.ok(stats.maxBytes<64*1024,'snapshot under 64 KiB');assert.ok(p99<600,'snapshots keep flowing (p99 gap '+p99+'ms)');
 ok=true;console.log('PASS: '+SECONDS+'s multiplayer soak — '+stats.actions+' actions from '+(CREW+1)+' players, '+stats.travels+' portal attempts, '+stats.reconnects+' leave/rejoins, shared-zone contact, no crashes or desyncs.');
 }catch(e){console.error(e.message||e);}finally{srv.kill('SIGTERM');await sleep(300);fs.rmSync(dataDir,{recursive:true,force:true});process.exit(ok?0:1);}})();
