'use strict';
const http=require('node:http'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{WebSocketServer,WebSocket}=require('ws'),{createRoom,showValue}=require('./room.cjs'),{ZoneBus}=require('./zone-bus.cjs'),codec=require('../dist/modules/save-codec.js'),era=require('../dist/modules/era.js');
// The running build (git commit), shown in the game header and /health, so a stale server is obvious.
const BUILD_ID=(()=>{try{return require('node:child_process').execSync('git rev-parse --short HEAD',{cwd:path.resolve(__dirname,'..'),stdio:['ignore','pipe','ignore'],timeout:3000}).toString().trim();}catch{return process.env.NOTDRED_BUILD||'unknown';}})();
const root=path.resolve(__dirname,'..'),dataDir=path.resolve(process.env.DATA_DIR||path.join(root,'data'));fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
// The dev menu token. Set DEV_TOKEN to choose one; otherwise one is made on first run and kept in data/dev-token.txt
// so it stays the same across restarts. It is printed every time the server starts.
if(!process.env.DEV_TOKEN){const f=path.join(dataDir,'dev-token.txt');let t='';try{t=fs.readFileSync(f,'utf8').trim();}catch{}if(!/^[\w-]{8,}$/.test(t)){t=crypto.randomBytes(9).toString('hex');try{fs.writeFileSync(f,t+'\n',{mode:0o600});}catch{}}process.env.DEV_TOKEN=t;}
if(process.env.DEV_TOKEN.length<12)console.warn('[security] DEV_TOKEN is short ('+process.env.DEV_TOKEN.length+' characters): anyone who guesses it gets the dev menu and live code. Use 12 or more random characters.');
const cliPort=process.argv.indexOf('--port');const port=Number(process.env.PORT||(cliPort>=0?process.argv[cliPort+1]:8080));
// Limits. Stored ships are cheap (a file); loaded ships each run two physics worlds and cost CPU.
const MAX_LOADED=Number(process.env.MAX_LOADED_SHIPS||16),MAX_STORED=500,MAX_OWNED=4,MAX_CREW=8,IDLE_UNLOAD_MS=Number(process.env.IDLE_UNLOAD_MS||era.RETURN_SECONDS*1000),SAVE_INTERVAL_MS=Number(process.env.SAVE_INTERVAL_MS||10000),RETURN_MS=Number(process.env.SHIP_RETURN_MS||era.RETURN_SECONDS*1000);
const rooms=new Map(),sessions=new Map(),clients=new Set(),bus=new ZoneBus({dataDir});const id=()=>crypto.randomBytes(12).toString('hex');

// ---- Ship records ----------------------------------------------------------------------------------------
// A record exists for every saved ship; its simulation (`game`) is only created while someone is aboard
// (and for a minute afterwards), so the room limit counts active ships, not stored ones.
function record(name,owner,saved,rid=id()){if(rooms.size>=MAX_STORED)throw Error('Server ship storage is full');const r={id:rid,name:era.cleanShipName(name)||era.randomShipName(),owner,ranks:{},log:[],people:{},bans:{},votes:{},tempBans:{},motd:'',private:false,invite:crypto.randomBytes(9).toString('hex'),saved:saved||null,game:null,members:new Set(),tick:0,emptySince:Date.now(),failures:[],lastGood:saved||null};rooms.set(r.id,r);return r;}
function loadedCount(){let n=0;for(const r of rooms.values())if(r.game)n++;return n;}
function load(r){if(r.game)return r.game;if(loadedCount()>=MAX_LOADED){const idle=[...rooms.values()].filter(x=>x.game&&!x.members.size).sort((a,b)=>a.emptySince-b.emptySince)[0];if(idle)unload(idle);else throw Error('Server is busy: every ship slot is crewed. Try again soon.');}
 r.game=createRoom(r.saved,bus.hooksFor(r));r.game.setName(r.name);r.saved=null;r.layoutCache=null;r.lastZone=null;logEvent(r,r.loader||null,'loaded the ship.','load');r.loader=null;if(r.returnDue){r.returnDue=false;try{r.game.run('returnToFreeport("empty")');}catch(e){console.error('Return failed',r.id,e.message);}}return r.game;}
function unload(r){if(!r.game)return;persist(r);r.saved=r.lastGood;try{r.game.dispose();}catch{}r.game=null;r.layoutCache=null;}
/* direct call into the ship's context: vm.runInContext with a timeout starts a watchdog each time (it cost ~10% of a busy server) */function zoneOf(r){try{return r.game?r.game.zoneId():r.saved?.zone||'freeport';}catch{return 'freeport';}}
function info(r){try{if(r.game){const i=r.game.info();r.name=i.name||r.name;r.score=i.score;return i;}}catch{}return {name:r.name,score:r.score??r.lastGood?.score??0,zone:r.lastGood?.zone||'freeport'};}
// Leaderboard (press "/"): every stored ship by score.
function leaderboard(){return [...rooms.values()].map(r=>{const i=info(r);return {id:r.private?'p'+crypto.createHash('sha1').update(r.id).digest('hex').slice(0,8):r.id,name:r.private?'(private ship)':i.name,score:i.score||0,zone:era.ZONES[zoneOf(r)]?.name||'',crew:r.members.size};}).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).slice(0,25);}
// Ranks: the owner is captain; everyone else is whatever the captain set for them (stored by account), guest by default.
function rankOf(r,ws){return r.owner===ws.owner?'captain':(['captain','crew'].includes(r.ranks?.[ws.owner])?r.ranks[ws.owner]:'guest');}
// Captains (the ship's owner and anyone a captain promoted) share every captain power. The owner alone can delete the
// ship and can't be demoted, kicked or banned; only the owner can demote, kick or ban another captain.
const isCap=(r,ws)=>!!ws&&rankOf(r,ws)==='captain';
const rankOfOwner=(r,owner)=>r.owner===owner?'captain':(['captain','crew'].includes(r.ranks?.[owner])?r.ranks[owner]:'guest');
function mayManage(r,ws,owner){if(owner===r.owner)return false;if(rankOfOwner(r,owner)==='captain')return r.owner===ws.owner;return true;}
// ---- Crew control & ship log ("Manage Ship") -----------------------------------------------------------------------
// Every account that has been aboard is remembered per ship (name, short id, play time); the log keeps the last
// LOG_MAX events (joins, leaves, loads, saves, helm, zone changes, rank changes, kicks), saved with the ship.
const LOG_MAX=300;
// Ship MOTD (message of the day): plain text, set by the captain, shown to everyone who joins. Line breaks are kept;
// other control characters are removed. Clients always render it as text, never as HTML.
const MOTD_MAX=1000;
function cleanMotd(t){return String(t||'').replace(/\r\n?/g,'\n').replace(/[\x00-\x09\x0b-\x1f\x7f]/g,'').replace(/\n{4,}/g,'\n\n\n').slice(0,MOTD_MAX).trim();}
const shortId=owner=>'#'+Buffer.from(String(owner).slice(0,12),'hex').toString('base64').replace(/[+/=]/g,'').slice(0,6);
const rankFor=(r,owner)=>r.owner===owner?'captain':(['captain','crew'].includes(r.ranks?.[owner])?r.ranks[owner]:'guest');
function person(r,ws){r.people??={};const p=r.people[ws.owner]??={short:shortId(ws.owner),name:ws.name,playtime:0,first:Date.now()};p.name=ws.name;p.last=Date.now();return p;}
function logEvent(r,ws,text,kind='event'){r.log??=[];r.log.push({t:Date.now(),kind,who:ws?{name:ws.name,short:shortId(ws.owner),rank:rankOf(r,ws)}:null,text});if(r.log.length>LOG_MAX)r.log.splice(0,r.log.length-LOG_MAX);}
// Bans (captain): the account can never join again until unbanned; anyone aboard is removed at once.
// Vote kick (crew): crew members (and the captain) aboard vote to remove a guest who is aboard. A majority of the
// crew-or-captain members aboard is needed; votes lapse after VOTE_MS; a vote-kicked guest cannot rejoin for 5 minutes.
const VOTE_MS=90000,VOTEKICK_BAN_MS=5*60000;
const voters=r=>[...r.members].filter(m=>rankOf(r,m)!=='guest');
const votesNeeded=r=>Math.floor(voters(r).length/2)+1;
function removeFromShip(r,target,message){leave(target);send(target,{type:'error',message});send(target,{type:'rooms',rooms:list(target)});}
function notice(r,text){try{r.game?.zone.missionNotice(text);}catch{}}
function crewReport(r,ws){const online=new Map([...r.members].map(m=>[m.owner,m]));const rows=[];
 for(const [owner,p] of Object.entries(r.people||{})){const m=online.get(owner);let inventory=[];if(m&&r.game){try{inventory=(r.game.snapshot(m.uid)?.stacks||[]).filter(Boolean).map(x=>({type:x.type,count:x.count}));}catch{}}
  rows.push({short:p.short,name:m?.name||p.name,online:!!m,uid:m?.uid||null,owner:owner===r.owner,rank:rankFor(r,owner),playtime:Math.round((p.playtime||0)+(m?.joinedAt?(Date.now()-m.joinedAt)/1000:0)),last:p.last||0,inventory,you:owner===ws.owner});}
 for(const row of rows){const o=Object.keys(r.people).find(k=>r.people[k].short===row.short);row.banned=!!r.bans?.[o];const v=row.uid&&r.votes?.[o];row.votes=v?[...v.voters].length:0;row.voted=!!(v&&v.voters.has(ws.owner));}
 rows.sort((a,b)=>(b.online-a.online)||(b.owner-a.owner)||(b.playtime-a.playtime));return {type:'crew',ship:info(r).name,captain:isCap(r,ws),rank:rankOf(r,ws),votesNeeded:votesNeeded(r),log:(r.log||[]).slice(-200),crew:rows};}
// Chat: everyone in the same zone (all ships there) plus your own crew wherever they are. Rate-limited, plain text.
// Chat stays aboard your own ship; a comms station (ℵ14, "communication with other ships") reaches every ship in the zone.
// Comms transmissions (per ship): 5 at most, one more every 15 seconds — after five in a row you wait about a minute.
const TX_MAX=5,TX_REGEN_MS=15000;
function txNow(r,now=Date.now()){const t=r.tx||(r.tx={n:TX_MAX,t:now});if(t.n>=TX_MAX){t.n=TX_MAX;t.t=now;}else{const gain=Math.floor((now-t.t)/TX_REGEN_MS);if(gain>0){t.n=Math.min(TX_MAX,t.n+gain);t.t=t.n>=TX_MAX?now:t.t+gain*TX_REGEN_MS;}}return t;}
function txState(r){const now=Date.now(),t=txNow(r,now);return {type:'commsState',n:t.n,max:TX_MAX,regenMs:TX_REGEN_MS,nextMs:t.n>=TX_MAX?0:Math.max(0,TX_REGEN_MS-(now-t.t))};}
function shipTag(r){return String(r.id||'').slice(0,5).toUpperCase();}
// Whole-server live code (host token): the rooms, the zone bus and the connections, plus helpers to reach into any
// ship or zone. Its own context persists between runs, so variables you set stay set.
let serverCtx=null;
function serverEval(ws,code){if(!serverCtx){serverCtx=vm.createContext({console,setTimeout,clearTimeout,setInterval,clearInterval,Date,performance,process:{memoryUsage:()=>process.memoryUsage(),uptime:()=>process.uptime(),version:process.version,cpuUsage:()=>process.cpuUsage()},
  era,rooms,bus,clients,
  stats:()=>({rooms:rooms.size,loaded:[...rooms.values()].filter(r=>r.game).length,players:clients.size,tickMs:+tickMs.toFixed(2),last10s:perf.last,zones:[...bus.sims.keys()],memoryMB:Math.round(process.memoryUsage().rss/1048576)}),
  ships:()=>[...rooms.values()].map(r=>({id:r.id,name:info(r).name,zone:zoneOf(r),loaded:!!r.game,crew:[...r.members].map(m=>m.name),lagMs:r.game?.lag?+r.game.lag.ms.toFixed(2):null})),
  findShip:q=>[...rooms.values()].find(r=>r.id===q||r.id.startsWith(String(q).toLowerCase())||info(r).name.toLowerCase()===String(q).toLowerCase()),
  inShip:(q,c)=>{const r=serverCtx.findShip(q);if(!r?.game)throw Error('No loaded ship '+q);return r.game.evalCode([...r.members][0]?.uid||null,c);},
  inZone:(z,c)=>{const sim=bus.sims.get(z);if(!sim)throw Error('Zone '+z+' is not running');return sim.evalCode(c);},
  say:(text)=>{for(const c of clients)send(c,{type:'chat',from:'Server',ship:'',rank:'captain',text:String(text).slice(0,200),t:Date.now()});return 'sent';},
  me:null});vm.runInContext('globalThis.help=()=>"stats() · ships() · findShip(nameOrId) · await inShip(nameOrId, code) · await inZone(zoneId, code) · say(text) · rooms, bus, clients, era · log(...) · after/every(sec,fn)"',serverCtx);
 const tick=setInterval(()=>require('./live-code.cjs').tickTimers(serverCtx),1000/60);tick.unref();}
 serverCtx.me={name:ws.name,room:ws.room?.id};return require('./live-code.cjs').run(serverCtx,code);}
function chat(ws,text,comms=false){const r=ws.room;if(!r)throw Error('Join a ship to chat');const now=Date.now();if(now-(ws.lastChat||0)<600)throw Error('You are sending messages too fast');text=String(text||'').replace(/[\x00-\x1f<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,200);if(!text)return;ws.lastChat=now;
 if(comms&&!r.game.run(`commsCheck(${JSON.stringify(ws.uid)})`)){ws.lastChat=0;throw Error('Stand at a comms station to talk to other ships.');}
 if(comms){const t=txNow(r,now);if(t.n<=0){ws.lastChat=0;send(ws,txState(r));throw Error('No transmissions left — one recharges every 15 seconds.');}t.n--;if(t.n===TX_MAX-1)t.t=now;for(const c of r.members)send(c,txState(r));}
 const z=zoneOf(r),msg={type:'chat',from:ws.name,ship:info(r).name,shipTag:shipTag(r),rank:rankOf(r,ws),zone:era.ZONES[z]?.name||z,text,t:now,...(comms?{comms:true}:{})};
 for(const c of clients)if(c.room&&(c.room===r||comms&&zoneOf(c.room)===z))send(c,msg);}
// Private ships (captain's choice): hidden from other players' ship lists and joinable only with the invite link
// (?ship=<id>&key=<invite>). The captain, and people the captain made crew, can always see and rejoin them.
const insider=(r,ws)=>!!ws&&(r.owner===ws.owner||['captain','crew'].includes(r.ranks?.[ws.owner]));
const mayJoin=(r,ws,key)=>!r.private||insider(r,ws)||ws.admin||(typeof key==='string'&&key===r.invite);
function list(ws){return [...rooms.values()].filter(r=>!r.private||insider(r,ws)).map(r=>({private:!!r.private,id:r.id,name:info(r).name,players:r.members.size,maxPlayers:MAX_CREW,zone:zoneOf(r),mine:!!ws&&r.owner===ws.owner,rank:ws?rankOf(r,ws):'guest',crew:[...r.members].map(m=>String(m.name||'').slice(0,24)).slice(0,8),tag:shipTag(r),returnIn:r.members.size||r.returned?0:Math.max(0,Math.ceil((RETURN_MS-(Date.now()-r.emptySince))/1000))}));}
for(const file of fs.readdirSync(dataDir).filter(f=>/^[a-f0-9]+\.json$/.test(f))){try{const d=JSON.parse(fs.readFileSync(path.join(dataDir,file)));{const r=record(d.name,d.owner,codec.decode(d.ship),d.id);r.ranks=d.ranks&&typeof d.ranks==='object'?d.ranks:{};r.log=Array.isArray(d.log)?d.log.slice(-LOG_MAX):[];r.bans=d.bans&&typeof d.bans==='object'?d.bans:{};r.private=d.private===true;if(typeof d.invite==='string'&&/^[a-f0-9]{18}$/.test(d.invite))r.invite=d.invite;r.motd=typeof d.motd==='string'?cleanMotd(d.motd):'';r.people=d.people&&typeof d.people==='object'?d.people:{};r.emptySince=0;}}catch(e){console.error('Skipped invalid save',file,e.message);}}

// The once-a-minute save skips a ship whose state and settings haven't changed since its last save (play time alone
// doesn't count, but every ship is still written at least every 10 minutes). Every other save always writes.
function persist(r,periodic=false){if(!r.game)return;try{info(r);const state=r.game.run('durableState()'),meta={id:r.id,name:r.name,owner:r.owner,ranks:r.ranks||{},log:r.log||[],people:r.people||{},bans:r.bans||{},motd:r.motd||'',private:!!r.private,invite:r.invite};
 const key=crypto.createHash('sha1').update(JSON.stringify(state)).update(JSON.stringify({...meta,people:Object.keys(meta.people)})).digest('hex');if(periodic&&key===r.savedKey&&Date.now()-(r.savedAt||0)<10*60000)return;
 const file=path.join(dataDir,r.id+'.json'),tmp=file+'.tmp',ship=codec.encode(state);fs.writeFileSync(tmp,JSON.stringify({...meta,ship}),{mode:0o600});fs.renameSync(tmp,file);r.lastGood=codec.decode(ship);r.savedKey=key;r.savedAt=Date.now();}catch(e){console.error('Save failed:',r.id,e.message);}}
// A simulation error no longer ends the session: the ship is rebuilt from its last good save and the crew
// rejoin it. Three failures inside a minute means the save itself is bad; then the crew is sent to the lobby.
function recover(r,err){console.error('Room tick failed',r.id,err.stack||err);const now=Date.now();r.failures=r.failures.filter(t=>now-t<60000);r.failures.push(now);
 try{r.game.dispose();}catch{}r.game=null;
 if(r.failures.length>=3){for(const ws of [...r.members]){send(ws,{type:'error',message:'This ship keeps failing to simulate and was closed. Your last save is kept.'});leave(ws,false);send(ws,{type:'rooms',rooms:list(ws)});}r.saved=r.lastGood;return;}
 try{r.saved=r.lastGood;load(r);for(const ws of r.members){r.game.join(ws.uid,ws.name,ws.admin,rankOf(r,ws));ws.layoutSeen=new Map();send(ws,{type:'error',message:'The ship hit a simulation error and was restored from its last save.'});}}
 catch(e){console.error('Recovery failed',r.id,e.message);for(const ws of [...r.members])leave(ws,false);}}

// ---- HTTP ------------------------------------------------------------------------------------------------
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.zip':'application/zip'};
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://local');if(u.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:true,build:BUILD_ID,protocol:1,physics:'Box2D interiors (native C++), Planck exteriors',rooms:rooms.size,loaded:loadedCount(),players:clients.size,tickMs:+tickMs.toFixed(2),last10s:perf.last,zones:(()=>{const z={};for(const x of bus.lastExteriors.values())z[x.zone]=(z[x.zone]||0)+1;return z;})()}));}if(u.pathname==='/classic'||u.pathname.startsWith('/classic/'))return classic.handle(req,res,u);if(u.pathname==='/api/rooms'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(list()));}let file;try{file=path.resolve(root,'dist','.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));}catch{res.writeHead(400);return res.end();}if(!file.startsWith(path.join(root,'dist')+path.sep)){res.writeHead(403);return res.end();}fs.stat(file,(err,st)=>{if(err||!st.isFile()){res.writeHead(404);return res.end('Not found');}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});fs.createReadStream(file).pipe(res);});});
const wss=new WebSocketServer({noServer:true,maxPayload:2*1024*1024,
 // Updates are compressed (each looks much like the one before, so a small shared window shrinks them several-fold);
 // fast level-1 zlib, a 16 KB window per player. NOTDRED_DEFLATE=0 turns it off.
 perMessageDeflate:process.env.NOTDRED_DEFLATE==='0'?false:{threshold:256,zlibDeflateOptions:{level:1,memLevel:7},serverMaxWindowBits:14,clientNoContextTakeover:true,concurrencyLimit:16}});
server.on('upgrade',(req,socket,head)=>{const origin=req.headers.origin,allowed=(process.env.ALLOWED_ORIGINS||'').split(',').filter(Boolean);if(req.url!=='/play'||origin&&origin!==`http://${req.headers.host}`&&origin!==`https://${req.headers.host}`&&!originAllowed(allowed,origin)){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');return socket.destroy();}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));});

// ---- Crew sessions ---------------------------------------------------------------------------------------
// ALLOWED_ORIGINS entries are exact origins, or https://*.domain for any subdomain (npm run host uses
// https://*.trycloudflare.com, since each Cloudflare quick tunnel — including a reconnect — gets a new random address).
function originAllowed(list,origin){return list.some(a=>a===origin||(a.startsWith('https://*.')&&origin.startsWith('https://')&&origin.endsWith(a.slice(9))&&!origin.slice(8,-(a.length-9)).includes('/')));}
// Other ships in a snapshot: each ship's crew, machines and live view are encoded once per pass (r.json) and spliced
// into every viewer's message as text, so a busy ship seen by many players is serialised once, not once per viewer.
// Crew, machines and live view are encoded once per pass per ship (r.json) and spliced into every viewer's list.
function othersJSON(list){return '['+list.map(o=>{const r=rooms.get(o.id),j=r?.json,{crew,machines,live,...rest}=o;let t=JSON.stringify(rest).slice(0,-1);
 if(crew!==undefined)t+=',"crew":'+(j&&crew===r.crewCache?j.crew:JSON.stringify(crew));if(machines!==undefined)t+=',"machines":'+(j&&machines===r.machinesCache?j.machines:JSON.stringify(machines));if(live!==undefined)t+=',"live":'+(j&&live===r.liveCache?j.live:JSON.stringify(live));return t+'}';}).join(',')+']';}
// The ship's shared snapshot text (the same for everyone aboard) comes first; the member's own fields follow and win.
// Snapshots are only built for players whose connection has taken the last ones (less than SNAPSHOT_BACKLOG waiting to go
// out, compression queue included): a slow link gets fewer, fresh snapshots instead of an ever-longer delay.
const SNAPSHOT_BACKLOG=Number(process.env.SNAPSHOT_BACKLOG||96*1024);
function sendSnapshot(ws,tick,st,others,shared,tail=''){if(ws.readyState!==WebSocket.OPEN)return;const own=st==null?'{}':JSON.stringify(st),head=st!=null&&shared&&shared!=='{}'?shared.slice(0,-1)+',':'{',body=own==='{}'?head:head+own.slice(1,-1)+',';const text='{"type":"snapshot","tick":'+JSON.stringify(tick)+',"state":'+body+'"others":'+othersJSON(others)+tail+'}}';sentBytes+=text.length;ws.send(text);}
// Bytes sent to players (for /health: egress per second over the last 10 s).
let sentBytes=0;
function send(ws,o){if(ws.readyState===WebSocket.OPEN&&ws.bufferedAmount<2*1024*1024){const t=JSON.stringify(o);sentBytes+=t.length;ws.send(t);}}
function leave(ws,save=true){const r=ws.room;if(!r)return;ws.room=null;r.members.delete(ws);{const p=person(r,ws);if(ws.joinedAt)p.playtime=(p.playtime||0)+(Date.now()-ws.joinedAt)/1000;ws.joinedAt=0;ws.wasPiloting=false;}logEvent(r,ws,'left the ship.','leave');if(!r.members.size)logEvent(r,null,'saved the ship.','save');try{r.game?.leave(ws.uid);}catch(e){console.error('Leave failed',r.id,e.message);}if(save)persist(r);if(!r.members.size)r.emptySince=Date.now();}
function join(ws,r,key){if(!mayJoin(r,ws,key))throw Error('This ship is private. Ask its captain for the invite link.');if(r.owner!==ws.owner&&r.bans?.[ws.owner])throw Error('You are banned from this ship.');{const until=r.tempBans?.[ws.owner];if(until&&until>Date.now())throw Error('You were vote-kicked from this ship. Try again in '+Math.ceil((until-Date.now())/60000)+' min.');}if(r.members.size>=MAX_CREW)throw Error('Ship full');leave(ws);if(!r.game)r.loader=ws;load(r);r.game.join(ws.uid,ws.name,ws.admin,rankOf(r,ws));r.members.add(ws);ws.room=r;r.returned=false;ws.joinedAt=Date.now();person(r,ws);logEvent(r,null,'','time');logEvent(r,ws,'joined the ship.','join');ws.layoutSeen=new Map();send(ws,{type:'joined',room:r.id,name:r.name,self:ws.uid,admin:ws.admin,captain:isCap(r,ws)});send(ws,{type:'snapshot',tick:r.tick,state:{...r.game.snapshot(ws.uid),others:bus.others(r,ws.layoutSeen)}});send(ws,{type:'motd',text:r.motd||''});}
const owned=ws=>[...rooms.values()].filter(r=>r.owner===ws.owner).length;
// One handler for every client: real WebSockets, and classic-mode sessions (server/classic.cjs) that use a stand-in socket.
// ---- Abuse limits (simple and quiet) -------------------------------------------------------------------------------
// Messages: up to 90 a second per connection; past that they're dropped (one notice), and a connection still flooding
// past 400 a second is closed. Messages over 64 KB are refused except ship imports and dev live code.
// Host token: compared in constant time; 5 wrong guesses from one address lock it out for 10 minutes (behind a
// Cloudflare tunnel every player arrives from 127.0.0.1, so the visitor's real address comes from CF-Connecting-IP).
// Ships: at most 6 created or imported per player per 10 minutes (and MAX_OWNED at once); joins: 30 a minute.
const SMALL_MESSAGE=64*1024,tokenFails=new Map(),shipMade=new Map(),joinsMade=new Map();
function tokenOK(given,ip){const real=process.env.DEV_TOKEN;if(!real||typeof given!=='string'||!given)return false;const f=tokenFails.get(ip);if(f&&f.until>Date.now())return false;
 const a=crypto.createHash('sha256').update(given).digest(),b=crypto.createHash('sha256').update(real).digest(),ok=crypto.timingSafeEqual(a,b);
 if(ok){tokenFails.delete(ip);return true;}const g=f&&f.until<=Date.now()&&f.n>=5?{n:0,until:0}:(f||{n:0,until:0});g.n++;if(g.n>=5){g.until=Date.now()+10*60000;console.warn('[security] 5 wrong host tokens from '+ip+': locked out for 10 minutes');}tokenFails.set(ip,g);return false;}
function underLimit(map,key,max,ms){const now=Date.now(),list=(map.get(key)||[]).filter(t=>now-t<ms);if(list.length>=max){map.set(key,list);return false;}list.push(now);map.set(key,list);return true;}
setInterval(()=>{const now=Date.now();for(const [k,f] of tokenFails)if(f.until<now&&f.n<5)tokenFails.delete(k);for(const m of [shipMade,joinsMade])for(const [k,l] of m)if(!l.some(t=>now-t<10*60000))m.delete(k);},60000).unref();
// The visitor's address: forwarded headers are believed only from a proxy on this machine (Caddy, cloudflared), never
// from someone connecting directly (who could write anything there).
function visitorIP(req){const peer=String(req?.socket?.remoteAddress||'');const local=/^(127\.|::1$|::ffff:127\.)/.test(peer);
 if(local){const h=req.headers||{},f=h['cf-connecting-ip']||String(h['x-forwarded-for']||'').split(',')[0].trim()||h['x-real-ip'];if(f)return String(f);}return peer||'local';}
function onConnection(ws,req){clients.add(ws);ws.ip=String(req?visitorIP(req):ws.ip||'local').slice(0,64);ws.uid=id();ws.name='Crew';ws.actions=0;ws.window=Date.now();ws.seq=-1;ws.alive=true;ws.on('pong',()=>ws.alive=true);ws.on('message',raw=>{if(ws.flooded)return;try{
 if(Date.now()-ws.window>1000){ws.window=Date.now();ws.actions=0;}if(++ws.actions>90){if(ws.actions===91)send(ws,{type:'error',message:'Too many messages — slow down.'});if(ws.actions>400){ws.flooded=true;console.warn('[security] closing a flooding connection from '+ws.ip);(ws.terminate||ws.close)?.call(ws);}return;}
 {const size=typeof raw==='string'?raw.length:raw?.length||0;if(size>SMALL_MESSAGE){const head=(typeof raw==='string'?raw:Buffer.from(raw).toString('utf8',0,48)).slice(0,48);if(!/^\s*\{\s*"type"\s*:\s*"(import|eval)"/.test(head))throw Error('Message too large');}}
 const m=JSON.parse(raw);if(!m||typeof m!=='object'||Array.isArray(m))throw Error('Invalid message');
 if(m.type==='hello'){if(ws.authenticated)throw Error('Already connected');if(m.protocol!==1)throw Error('Protocol version mismatch');ws.token=typeof m.token==='string'&&/^[a-f0-9]{48}$/.test(m.token)?m.token:crypto.randomBytes(24).toString('hex');if(sessions.has(ws.token))sessions.get(ws.token).close(1000,'Reconnected elsewhere');sessions.set(ws.token,ws);ws.owner=crypto.createHash('sha256').update(ws.token).digest('hex');ws.name=String(m.name||'Crew').replace(/[<>\x00-\x1f]/g,'').slice(0,24)||'Crew';ws.admin=!!tokenOK(m.devToken,ws.ip);ws.authenticated=true;send(ws,{type:'welcome',protocol:1,build:BUILD_ID,token:ws.token,self:ws.uid,rooms:list(ws),admin:ws.admin});return;}
 if(!ws.authenticated)throw Error('Send hello first');
 if((m.type==='create'||m.type==='join'||m.type==='import')&&typeof m.player==='string'){const n=m.player.replace(/[<>\x00-\x1f]/g,'').trim().slice(0,24);if(n)ws.name=n;}
 if(m.type==='ping')return send(ws,{type:'pong',t:Number(m.t)||0});
 if(m.type==='list')return send(ws,{type:'rooms',rooms:list(ws)});
 if(m.type==='leaderboard')return send(ws,{type:'leaderboard',ships:leaderboard(),you:ws.room?.id||null});
 if(m.type==='create'){if(owned(ws)>=MAX_OWNED)throw Error('Four ships per owner. Delete one first.');if(!underLimit(shipMade,ws.owner,6,10*60000))throw Error('That\'s a lot of new ships — wait a few minutes.');return join(ws,record(m.name,ws.owner));}
 if(m.type==='import'){if(ws.room)throw Error('Leave the current ship before importing');if(!underLimit(shipMade,ws.owner,6,10*60000))throw Error('That\'s a lot of new ships — wait a few minutes.');if(owned(ws)>=MAX_OWNED)throw Error('Four ships per owner. Delete one first.');const saved=codec.decode(m.data);const r=record(m.name||'Imported ship',ws.owner,saved);try{return join(ws,r);}catch(e){rooms.delete(r.id);throw e;}}
 if(m.type==='join'){if(!underLimit(joinsMade,ws.owner||ws.uid,30,60000))throw Error('Joining too often — wait a moment.');const r=rooms.get(m.room);if(!r)throw Error('Ship not found');return join(ws,r,m.key);}
 if(m.type==='leave'){leave(ws);return send(ws,{type:'rooms',rooms:list(ws)});}
 if(m.type==='delete'){const r=rooms.get(m.room);if(!r)throw Error('Ship not found');if(r.owner!==ws.owner)throw Error('Only the captain can delete this ship');if(r.members.size)throw Error('Everyone must leave the ship first');if(r.game){try{r.game.dispose();}catch{}r.game=null;}rooms.delete(r.id);fs.rmSync(path.join(dataDir,r.id+'.json'),{force:true});return send(ws,{type:'rooms',rooms:list(ws)});}
 if(!ws.room)throw Error('Join a ship first');
 if(m.type==='chat')return chat(ws,m.text);
 if(m.type==='commsState')return ws.room&&send(ws,txState(ws.room));if(m.type==='comms')return chat(ws,m.text,true);
 if(m.type==='crew')return send(ws,crewReport(ws.room,ws));
 // Ship settings: privacy and the invite link (the link's key only goes to the captain and crew).
 if(m.type==='shipsettings'){const r=ws.room;return send(ws,{type:'shipsettings',id:r.id,private:!!r.private,invite:insider(r,ws)?r.invite:null,captain:isCap(r,ws)});}
 if(m.type==='privacy'||m.type==='newinvite'){const r=ws.room;if(!isCap(r,ws))throw Error('Only the captain can change who can join');
  if(m.type==='privacy'){r.private=!!m.private;logEvent(r,ws,'made the ship '+(r.private?'private (invite link only).':'public.'),'privacy');}
  else{r.invite=crypto.randomBytes(9).toString('hex');logEvent(r,ws,'made a new invite link (the old one no longer works).','privacy');}
  persist(r);for(const c of r.members)send(c,{type:'shipsettings',id:r.id,private:!!r.private,invite:insider(r,c)?r.invite:null,captain:isCap(r,c)});return;}
 if(m.type==='motd'){const r=ws.room;if(!isCap(r,ws))throw Error('Only the captain can edit the MOTD');r.motd=cleanMotd(m.text);logEvent(r,ws,r.motd?'updated the MOTD.':'cleared the MOTD.','motd');persist(r);for(const c of r.members)send(c,{type:'motd',text:r.motd,changed:true,by:ws.name});return;}
 if(m.type==='rank'){const r=ws.room;if(!isCap(r,ws))throw Error('Only the captain can set ranks');if(!['captain','crew','guest'].includes(m.rank))throw Error('Unknown rank');
  // By crew id (online) or by short account id from the crew list (offline too).
  const target=[...r.members].find(x=>x.uid===m.crew||(m.account&&shortId(x.owner)===m.account));const owner=target?.owner||Object.keys(r.people||{}).find(o=>m.account&&r.people[o].short===m.account);
  if(!owner||owner===ws.owner)throw Error('Crew member not found');if(!mayManage(r,ws,owner))throw Error(owner===r.owner?'The ship\'s owner is always captain.':'Only the ship\'s owner can change another captain\'s rank.');r.ranks??={};r.ranks[owner]=m.rank;if(target){r.game.setRank(target.uid,m.rank);send(target,{type:'error',message:'The captain made you '+m.rank+'.'});}
  logEvent(r,ws,'set '+(r.people?.[owner]?.short||'')+' ('+(r.people?.[owner]?.name||'?')+') to '+m.rank+'.','rank');persist(r);if(m.report)send(ws,crewReport(r,ws));return;}
 if(m.type==='ban'){const r=ws.room;if(!isCap(r,ws))throw Error('Only the captain can ban');const owner=Object.keys(r.people||{}).find(o=>r.people[o].short===m.account);if(!owner||owner===ws.owner)throw Error('Crew member not found');if(!mayManage(r,ws,owner))throw Error('You cannot ban the ship\'s owner or another captain.');
  r.bans??={};const p=r.people[owner];if(m.banned===false){delete r.bans[owner];logEvent(r,ws,'unbanned '+p.short+' ('+p.name+').','ban');}
  else{r.bans[owner]=true;logEvent(r,ws,'banned '+p.short+' ('+p.name+').','ban');const target=[...r.members].find(x=>x.owner===owner);if(target)removeFromShip(r,target,'You were banned from the ship by the captain.');notice(r,p.name+' was banned from the ship.');}
  persist(r);if(m.report)send(ws,crewReport(r,ws));return;}
 if(m.type==='votekick'){const r=ws.room;if(rankOf(r,ws)==='guest')throw Error('Only crew can vote to kick');const target=[...r.members].find(x=>x.uid===m.crew);if(!target||target===ws)throw Error('Crew member not found');if(rankOf(r,target)!=='guest')throw Error('Only guests can be vote-kicked');
  r.votes??={};const now=Date.now();let v=r.votes[target.owner];if(!v||now-v.at>VOTE_MS)v=r.votes[target.owner]={at:now,voters:new Set()};
  // Voters who have left no longer count.
  for(const o of [...v.voters])if(![...r.members].some(x=>x.owner===o&&rankOf(r,x)!=='guest'))v.voters.delete(o);
  if(v.voters.has(ws.owner))throw Error('You already voted to kick '+target.name);v.voters.add(ws.owner);const need=votesNeeded(r);
  logEvent(r,ws,'voted to kick '+shortId(target.owner)+' ('+target.name+') — '+v.voters.size+'/'+need+'.','vote');notice(r,ws.name+' voted to kick '+target.name+' ('+v.voters.size+'/'+need+').');
  if(v.voters.size>=need){delete r.votes[target.owner];r.tempBans??={};r.tempBans[target.owner]=now+VOTEKICK_BAN_MS;logEvent(r,null,shortId(target.owner)+' ('+target.name+') was vote-kicked.','kick');removeFromShip(r,target,'You were vote-kicked from the ship by its crew.');notice(r,target.name+' was vote-kicked.');}
  if(m.report)send(ws,crewReport(r,ws));return;}
 if(m.type==='kick'){const r=ws.room;if(!isCap(r,ws))throw Error('Only the captain can kick');const target=[...r.members].find(x=>x.uid===m.crew);if(!target||target===ws)throw Error('Crew member not found');if(!mayManage(r,ws,target.owner))throw Error('You cannot kick the ship\'s owner or another captain.');logEvent(r,ws,'kicked '+shortId(target.owner)+' ('+target.name+').','kick');leave(target);send(target,{type:'error',message:'You were removed from the ship by the captain.'});send(target,{type:'rooms',rooms:list(target)});if(m.report)send(ws,crewReport(r,ws));return;}
 if(m.type==='export'){return send(ws,{type:'export',data:codec.encode(ws.room.game.run('durableState()'))});}
 // Dev live code (host token only): run in this ship's simulation or in its shared zone; the answer goes back to the sender.
 if(m.type==='eval'){const r=ws.room,id=Number.isSafeInteger(m.id)?m.id:0;if(!ws.admin){send(ws,{type:'evalResult',id,ok:false,error:'Live code needs the host token.'});return;}if(!r?.game){send(ws,{type:'evalResult',id,ok:false,error:'Join a ship first.'});return;}
  const code=String(m.code||'').slice(0,200000),fail=e=>send(ws,{type:'evalResult',id,ok:false,error:String(e?.stack||e).split('\n').slice(0,6).join('\n').slice(0,2000)});
  try{let p;if(m.target==='zone'){const sim=bus.simOf(r);if(!sim)throw Error('This ship is not in a shared zone right now.');p=sim.evalCode(code);}else if(m.target==='server')p=serverEval(ws,code);else p=r.game.evalCode(ws.uid,code);
   Promise.resolve(p).then(o=>send(ws,{type:'evalResult',id,ok:true,result:o.result,logs:o.logs}),fail);}catch(e){fail(e);}
  console.log('[live code] '+(ws.name||'?')+' ran '+code.length+' chars on '+(m.target==='zone'?'the zone':m.target==='server'?'the server':'ship '+r.id));return;}
 if(m.type==='action'){if(!Number.isSafeInteger(m.seq)||m.seq<=ws.seq)return;ws.seq=m.seq;ws.room.game.command(ws.uid,m);}
 }catch(e){send(ws,{type:'error',message:String(e.message).slice(0,180)});}});
 ws.on('close',()=>{leave(ws);clients.delete(ws);if(sessions.get(ws.token)===ws)sessions.delete(ws.token);});ws.on('error',()=>{});send(ws,{type:'hello',protocol:1});}
wss.on('connection',onConnection);
// Classic mode (Internet Explorer 6 / Windows 2000 and other very old browsers): the server runs a headless copy of
// the game client per player, draws its view and serves it as pictures over plain HTTP.
const classic=require('./classic.cjs').createClassic({onConnection,root});

// ---- Simulation loop -------------------------------------------------------------------------------------
let previous=performance.now(),acc=0,frames=0,farPass=0,tickMs=0,perf={worst:0,behind:0,calls:0,since:Date.now(),last:null};
const timer=setInterval(()=>{const now=performance.now();acc+=Math.min((now-previous)/1000,.1);previous=now;let steps=0;const t0=performance.now();
 while(acc>=1/60&&steps++<3){const active=[];/* empty ships stay in the world (others see them, bots can still shoot them) until they despawn */for(const r of rooms.values())if(r.game&&(r.members.size||!r.returned)){try{/* nobody aboard: the hull stays in the zone, its inside isn't simulated (saves the server's time; it despawns after RETURN_MS) */if(r.members.size){r.game.tick(1/60);r.tick++;}active.push(r);}catch(e){recover(r,e);}}
  try{bus.step(active,1/60);}catch(e){console.error('Zone bus step failed',e.stack);}
  acc-=1/60;frames++;}
 if(steps>=3){acc=Math.min(acc,1/60);perf.behind++;}{const ms=performance.now()-t0;tickMs=tickMs*.9+ms*.1;perf.worst=Math.max(perf.worst,ms);perf.calls++;
  /* every 10 s: the worst tick and how often the server couldn't keep up (it then drops time — everything runs slow) */if(Date.now()-perf.since>10000){perf.last={worstMs:+perf.worst.toFixed(1),fellBehindPct:+(perf.behind/Math.max(1,perf.calls)*100).toFixed(1),avgMs:+tickMs.toFixed(2),egressKBps:+(sentBytes/1024/((Date.now()-perf.since)/1000)).toFixed(1)};sentBytes=0;if(perf.last.fellBehindPct>5)console.warn('Server is falling behind: '+perf.last.fellBehindPct+'% of ticks in the last 10 s (worst '+perf.last.worstMs+' ms)');perf.worst=0;perf.behind=0;perf.calls=0;perf.since=Date.now();}}
 // 20 snapshots a second (every 3rd 60 Hz tick).
 if(frames>=3){frames=0;const loaded=[...rooms.values()].filter(r=>r.game&&(r.members.size||!r.returned)),live=loaded.filter(r=>r.members.size);
  // Pass 1: every ship's exterior (layout hash changes only when the ship is rebuilt), so pass 2 never
  // lists a ship to others before its hull is known.
  // Only ships someone else can see in full need this (interest management, zone-bus.cjs VIEW_RANGE).
  const watched=bus.watched(live);farPass=(farPass+1)%4;
  for(const r of loaded){if(!watched.has(r)){r.unwatched=true;continue;}const fresh=r.unwatched!==false;r.unwatched=false;try{const layout=r.game.zone.exteriorLayout(),key=crypto.createHash('sha1').update(JSON.stringify(layout)).digest('base64').slice(0,12);if(r.layoutCache?.key!==key)r.layoutCache={key,layout};r.crewCache=r.game.zone.exteriorCrew();r.machinesCache=r.game.zone.exteriorMachines();/* other ships' live view: every snapshot; a full item list once a second */r.livePass=((r.livePass||0)+1)%20;r.liveCache=r.game.zone.exteriorLive(r.livePass===1||fresh);r.json={crew:JSON.stringify(r.crewCache),machines:JSON.stringify(r.machinesCache),live:JSON.stringify(r.liveCache)};}catch(e){recover(r,e);}}
  for(const r of live){if(!r.game)continue;try{/* a player whose connection hasn't taken the last few snapshots skips this one (built for nobody, so their deltas stay right) instead of queueing seconds of stale ones */const members=[...r.members].filter(ws=>ws.readyState===WebSocket.OPEN&&(ws.bufferedAmount||0)<SNAPSHOT_BACKLOG);if(!members.length)continue;const pass=r.game.snapshotPass(members.map(ws=>ws.uid));members.forEach((ws,k)=>{const st=pass.own[k];
    // Log: helm use, and zone changes (credited to whoever is at the helm).
    const pil=!!st?.self?.piloting;if(pil&&!ws.wasPiloting)logEvent(r,ws,'started using helm.','helm');ws.wasPiloting=pil;
    if(st&&r.lastZone&&st.zone!==r.lastZone&&!r.zoneLogged){const pilot=[...r.members].find(x=>x.wasPiloting);logEvent(r,pilot||null,'teleported the ship to '+(era.ZONES[st.zone]?.name||st.zone)+'.','zone');r.zoneLogged=true;}
    sendSnapshot(ws,r.tick,st,bus.others(r,ws.layoutSeen),pass.shared,bus.warFor(r,ws)+(farPass===0||ws.farZone!==st?.zone?(ws.farZone=st?.zone,',"far":'+JSON.stringify(bus.far(r))):''));});
   const z=zoneOf(r);r.zoneLogged=false;r.lastZone=z;}catch(e){recover(r,e);}}}
},1000/60);
const saves=setInterval(()=>{for(const r of rooms.values())if(r.game&&r.members.size)persist(r,true);try{bus.save();}catch(e){console.error('Zone save failed',e.message);}
 for(const r of rooms.values())if(r.game&&!r.members.size&&Date.now()-r.emptySince>IDLE_UNLOAD_MS)unload(r);},SAVE_INTERVAL_MS);
// Empty ships: a minute after the last crew member leaves, the ship is sent back to the Freeport tied to its zone
// (and unloaded). Ships not in memory just get the flag and go home the next time they load.
function returnEmptyShips(){const now=Date.now();for(const r of rooms.values()){if(r.members.size||r.returned||now-r.emptySince<RETURN_MS)continue;r.returned=true;{const z=zoneOf(r),home=era.HOME_FREEPORT[z];if(home&&home!==z&&era.ZONES[z]?.kind!=='safe')logEvent(r,null,'despawned and was returned to '+era.ZONES[home].name+' (empty for '+Math.round(RETURN_MS/60000)+' minutes).','zone');}
 if(r.game){try{r.game.run('returnToFreeport("empty")');}catch(e){console.error('Return failed',r.id,e.message);}unload(r);}else r.returnDue=true;}}
const returns=setInterval(returnEmptyShips,Math.min(1000,RETURN_MS/4));
const heartbeat=setInterval(()=>{for(const ws of clients){if(!ws.alive)ws.terminate();else{ws.alive=false;ws.ping();}}},15000);
function shutdown(){clearInterval(timer);try{classic.dispose();}catch{}clearInterval(returns);clearInterval(saves);clearInterval(heartbeat);for(const ws of clients)leave(ws);for(const r of rooms.values())persist(r);try{bus.save();}catch{}wss.close();server.close(()=>process.exit(0));for(const ws of clients)ws.close();setTimeout(()=>process.exit(0),1000).unref();}process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
server.listen(port,process.env.HOST||'127.0.0.1',()=>{console.log('notdred.io server listening on '+(process.env.HOST||'127.0.0.1')+':'+port);console.log('Dev token (paste it into the Token box on the main menu for the dev menu): '+process.env.DEV_TOKEN);});
