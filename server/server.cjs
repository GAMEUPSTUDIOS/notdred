'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{WebSocketServer,WebSocket}=require('ws'),{createRoom}=require('./room.cjs'),{ZoneBus}=require('./zone-bus.cjs'),codec=require('../dist/modules/save-codec.js'),era=require('../dist/modules/era.js');
const root=path.resolve(__dirname,'..'),dataDir=path.resolve(process.env.DATA_DIR||path.join(root,'data'));fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
// The dev menu token. Set DEV_TOKEN to choose one; otherwise one is made on first run and kept in data/dev-token.txt
// so it stays the same across restarts. It is printed every time the server starts.
if(!process.env.DEV_TOKEN){const f=path.join(dataDir,'dev-token.txt');let t='';try{t=fs.readFileSync(f,'utf8').trim();}catch{}if(!/^[\w-]{8,}$/.test(t)){t=crypto.randomBytes(9).toString('hex');try{fs.writeFileSync(f,t+'\n',{mode:0o600});}catch{}}process.env.DEV_TOKEN=t;}
const cliPort=process.argv.indexOf('--port');const port=Number(process.env.PORT||(cliPort>=0?process.argv[cliPort+1]:8080));
// Limits. Stored ships are cheap (a file); loaded ships each run two physics worlds and cost CPU.
const MAX_LOADED=Number(process.env.MAX_LOADED_SHIPS||16),MAX_STORED=500,MAX_OWNED=4,MAX_CREW=8,IDLE_UNLOAD_MS=Number(process.env.IDLE_UNLOAD_MS||60000),SAVE_INTERVAL_MS=Number(process.env.SAVE_INTERVAL_MS||10000),RETURN_MS=Number(process.env.SHIP_RETURN_MS||era.RETURN_SECONDS*1000);
const rooms=new Map(),sessions=new Map(),clients=new Set(),bus=new ZoneBus({dataDir});const id=()=>crypto.randomBytes(12).toString('hex');

// ---- Ship records ----------------------------------------------------------------------------------------
// A record exists for every saved ship; its simulation (`game`) is only created while someone is aboard
// (and for a minute afterwards), so the room limit counts active ships, not stored ones.
function record(name,owner,saved,rid=id()){if(rooms.size>=MAX_STORED)throw Error('Server ship storage is full');const r={id:rid,name:era.cleanShipName(name)||era.randomShipName(),owner,ranks:{},log:[],people:{},bans:{},votes:{},tempBans:{},motd:'',private:false,invite:crypto.randomBytes(9).toString('hex'),saved:saved||null,game:null,members:new Set(),tick:0,emptySince:Date.now(),failures:[],lastGood:saved||null};rooms.set(r.id,r);return r;}
function loadedCount(){let n=0;for(const r of rooms.values())if(r.game)n++;return n;}
function load(r){if(r.game)return r.game;if(loadedCount()>=MAX_LOADED){const idle=[...rooms.values()].filter(x=>x.game&&!x.members.size).sort((a,b)=>a.emptySince-b.emptySince)[0];if(idle)unload(idle);else throw Error('Server is busy: every ship slot is crewed. Try again soon.');}
 r.game=createRoom(r.saved,bus.hooksFor(r));r.game.setName(r.name);r.saved=null;r.layoutCache=null;r.lastZone=null;logEvent(r,r.loader||null,'loaded the ship.','load');r.loader=null;if(r.returnDue){r.returnDue=false;try{r.game.run('returnToFreeport("empty")');}catch(e){console.error('Return failed',r.id,e.message);}}return r.game;}
function unload(r){if(!r.game)return;persist(r);r.saved=r.lastGood;try{r.game.dispose();}catch{}r.game=null;r.layoutCache=null;}
function zoneOf(r){try{return r.game?r.game.run('zone'):r.saved?.zone||'freeport';}catch{return 'freeport';}}
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
function chat(ws,text,comms=false){const r=ws.room;if(!r)throw Error('Join a ship to chat');const now=Date.now();if(now-(ws.lastChat||0)<600)throw Error('You are sending messages too fast');text=String(text||'').replace(/[\x00-\x1f<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,200);if(!text)return;ws.lastChat=now;
 if(comms&&!r.game.run(`commsCheck(${JSON.stringify(ws.uid)})`)){ws.lastChat=0;throw Error('Stand at a comms station to talk to other ships.');}
 const z=zoneOf(r),msg={type:'chat',from:ws.name,ship:info(r).name,rank:rankOf(r,ws),zone:era.ZONES[z]?.name||z,text,t:now,...(comms?{comms:true}:{})};
 for(const c of clients)if(c.room&&(c.room===r||comms&&zoneOf(c.room)===z))send(c,msg);}
// Private ships (captain's choice): hidden from other players' ship lists and joinable only with the invite link
// (?ship=<id>&key=<invite>). The captain, and people the captain made crew, can always see and rejoin them.
const insider=(r,ws)=>!!ws&&(r.owner===ws.owner||['captain','crew'].includes(r.ranks?.[ws.owner]));
const mayJoin=(r,ws,key)=>!r.private||insider(r,ws)||ws.admin||(typeof key==='string'&&key===r.invite);
function list(ws){return [...rooms.values()].filter(r=>!r.private||insider(r,ws)).map(r=>({private:!!r.private,id:r.id,name:info(r).name,players:r.members.size,maxPlayers:MAX_CREW,zone:zoneOf(r),mine:!!ws&&r.owner===ws.owner,returnIn:r.members.size||r.returned?0:Math.max(0,Math.ceil((RETURN_MS-(Date.now()-r.emptySince))/1000))}));}
for(const file of fs.readdirSync(dataDir).filter(f=>/^[a-f0-9]+\.json$/.test(f))){try{const d=JSON.parse(fs.readFileSync(path.join(dataDir,file)));{const r=record(d.name,d.owner,codec.decode(d.ship),d.id);r.ranks=d.ranks&&typeof d.ranks==='object'?d.ranks:{};r.log=Array.isArray(d.log)?d.log.slice(-LOG_MAX):[];r.bans=d.bans&&typeof d.bans==='object'?d.bans:{};r.private=d.private===true;if(typeof d.invite==='string'&&/^[a-f0-9]{18}$/.test(d.invite))r.invite=d.invite;r.motd=typeof d.motd==='string'?cleanMotd(d.motd):'';r.people=d.people&&typeof d.people==='object'?d.people:{};r.emptySince=0;}}catch(e){console.error('Skipped invalid save',file,e.message);}}

function persist(r){if(!r.game)return;try{info(r);const state=r.game.run('durableState()'),file=path.join(dataDir,r.id+'.json'),tmp=file+'.tmp',ship=codec.encode(state);fs.writeFileSync(tmp,JSON.stringify({id:r.id,name:r.name,owner:r.owner,ranks:r.ranks||{},log:r.log||[],people:r.people||{},bans:r.bans||{},motd:r.motd||'',private:!!r.private,invite:r.invite,ship}),{mode:0o600});fs.renameSync(tmp,file);r.lastGood=codec.decode(ship);}catch(e){console.error('Save failed:',r.id,e.message);}}
// A simulation error no longer ends the session: the ship is rebuilt from its last good save and the crew
// rejoin it. Three failures inside a minute means the save itself is bad; then the crew is sent to the lobby.
function recover(r,err){console.error('Room tick failed',r.id,err.stack||err);const now=Date.now();r.failures=r.failures.filter(t=>now-t<60000);r.failures.push(now);
 try{r.game.dispose();}catch{}r.game=null;
 if(r.failures.length>=3){for(const ws of [...r.members]){send(ws,{type:'error',message:'This ship keeps failing to simulate and was closed. Your last save is kept.'});leave(ws,false);send(ws,{type:'rooms',rooms:list(ws)});}r.saved=r.lastGood;return;}
 try{r.saved=r.lastGood;load(r);for(const ws of r.members){r.game.join(ws.uid,ws.name,ws.admin,rankOf(r,ws));ws.layoutSeen=new Map();send(ws,{type:'error',message:'The ship hit a simulation error and was restored from its last save.'});}}
 catch(e){console.error('Recovery failed',r.id,e.message);for(const ws of [...r.members])leave(ws,false);}}

// ---- HTTP ------------------------------------------------------------------------------------------------
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.zip':'application/zip'};
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://local');if(u.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:true,protocol:1,physics:'Box2D interiors (native C++), Planck exteriors',rooms:rooms.size,loaded:loadedCount(),players:clients.size,tickMs:+tickMs.toFixed(2)}));}if(u.pathname==='/classic'||u.pathname.startsWith('/classic/'))return classic.handle(req,res,u);if(u.pathname==='/api/rooms'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(list()));}let file;try{file=path.resolve(root,'dist','.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));}catch{res.writeHead(400);return res.end();}if(!file.startsWith(path.join(root,'dist')+path.sep)){res.writeHead(403);return res.end();}fs.stat(file,(err,st)=>{if(err||!st.isFile()){res.writeHead(404);return res.end('Not found');}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});fs.createReadStream(file).pipe(res);});});
const wss=new WebSocketServer({noServer:true,maxPayload:2*1024*1024,perMessageDeflate:false});
server.on('upgrade',(req,socket,head)=>{const origin=req.headers.origin,allowed=(process.env.ALLOWED_ORIGINS||'').split(',').filter(Boolean);if(req.url!=='/play'||origin&&origin!==`http://${req.headers.host}`&&origin!==`https://${req.headers.host}`&&!allowed.includes(origin)){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');return socket.destroy();}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));});

// ---- Crew sessions ---------------------------------------------------------------------------------------
function send(ws,o){if(ws.readyState===WebSocket.OPEN&&ws.bufferedAmount<2*1024*1024)ws.send(JSON.stringify(o));}
function leave(ws,save=true){const r=ws.room;if(!r)return;ws.room=null;r.members.delete(ws);{const p=person(r,ws);if(ws.joinedAt)p.playtime=(p.playtime||0)+(Date.now()-ws.joinedAt)/1000;ws.joinedAt=0;ws.wasPiloting=false;}logEvent(r,ws,'left the ship.','leave');if(!r.members.size)logEvent(r,null,'saved the ship.','save');try{r.game?.leave(ws.uid);}catch(e){console.error('Leave failed',r.id,e.message);}if(save)persist(r);if(!r.members.size)r.emptySince=Date.now();}
function join(ws,r,key){if(!mayJoin(r,ws,key))throw Error('This ship is private. Ask its captain for the invite link.');if(r.owner!==ws.owner&&r.bans?.[ws.owner])throw Error('You are banned from this ship.');{const until=r.tempBans?.[ws.owner];if(until&&until>Date.now())throw Error('You were vote-kicked from this ship. Try again in '+Math.ceil((until-Date.now())/60000)+' min.');}if(r.members.size>=MAX_CREW)throw Error('Ship full');leave(ws);if(!r.game)r.loader=ws;load(r);r.game.join(ws.uid,ws.name,ws.admin,rankOf(r,ws));r.members.add(ws);ws.room=r;r.returned=false;ws.joinedAt=Date.now();person(r,ws);logEvent(r,null,'','time');logEvent(r,ws,'joined the ship.','join');ws.layoutSeen=new Map();send(ws,{type:'joined',room:r.id,name:r.name,self:ws.uid,admin:ws.admin,captain:isCap(r,ws)});send(ws,{type:'snapshot',tick:r.tick,state:{...r.game.snapshot(ws.uid),others:bus.others(r,ws.layoutSeen)}});send(ws,{type:'motd',text:r.motd||''});}
const owned=ws=>[...rooms.values()].filter(r=>r.owner===ws.owner).length;
// One handler for every client: real WebSockets, and classic-mode sessions (server/classic.cjs) that use a stand-in socket.
function onConnection(ws){clients.add(ws);ws.uid=id();ws.name='Crew';ws.actions=0;ws.window=Date.now();ws.seq=-1;ws.alive=true;ws.on('pong',()=>ws.alive=true);ws.on('message',raw=>{try{
 if(Date.now()-ws.window>1000){ws.window=Date.now();ws.actions=0;}if(++ws.actions>90)throw Error('Rate limit');const m=JSON.parse(raw);if(!m||typeof m!=='object'||Array.isArray(m))throw Error('Invalid message');
 if(m.type==='hello'){if(ws.authenticated)throw Error('Already connected');if(m.protocol!==1)throw Error('Protocol version mismatch');ws.token=typeof m.token==='string'&&/^[a-f0-9]{48}$/.test(m.token)?m.token:crypto.randomBytes(24).toString('hex');if(sessions.has(ws.token))sessions.get(ws.token).close(1000,'Reconnected elsewhere');sessions.set(ws.token,ws);ws.owner=crypto.createHash('sha256').update(ws.token).digest('hex');ws.name=String(m.name||'Crew').replace(/[<>\x00-\x1f]/g,'').slice(0,24)||'Crew';ws.admin=!!process.env.DEV_TOKEN&&m.devToken===process.env.DEV_TOKEN;ws.authenticated=true;send(ws,{type:'welcome',protocol:1,token:ws.token,self:ws.uid,rooms:list(ws),admin:ws.admin});return;}
 if(!ws.authenticated)throw Error('Send hello first');
 if((m.type==='create'||m.type==='join'||m.type==='import')&&typeof m.player==='string'){const n=m.player.replace(/[<>\x00-\x1f]/g,'').trim().slice(0,24);if(n)ws.name=n;}
 if(m.type==='ping')return send(ws,{type:'pong',t:Number(m.t)||0});
 if(m.type==='list')return send(ws,{type:'rooms',rooms:list(ws)});
 if(m.type==='leaderboard')return send(ws,{type:'leaderboard',ships:leaderboard(),you:ws.room?.id||null});
 if(m.type==='create'){if(owned(ws)>=MAX_OWNED)throw Error('Four ships per owner. Delete one first.');return join(ws,record(m.name,ws.owner));}
 if(m.type==='import'){if(ws.room)throw Error('Leave the current ship before importing');if(owned(ws)>=MAX_OWNED)throw Error('Four ships per owner. Delete one first.');const saved=codec.decode(m.data);const r=record(m.name||'Imported ship',ws.owner,saved);try{return join(ws,r);}catch(e){rooms.delete(r.id);throw e;}}
 if(m.type==='join'){const r=rooms.get(m.room);if(!r)throw Error('Ship not found');return join(ws,r,m.key);}
 if(m.type==='leave'){leave(ws);return send(ws,{type:'rooms',rooms:list(ws)});}
 if(m.type==='delete'){const r=rooms.get(m.room);if(!r)throw Error('Ship not found');if(r.owner!==ws.owner)throw Error('Only the captain can delete this ship');if(r.members.size)throw Error('Everyone must leave the ship first');if(r.game){try{r.game.dispose();}catch{}r.game=null;}rooms.delete(r.id);fs.rmSync(path.join(dataDir,r.id+'.json'),{force:true});return send(ws,{type:'rooms',rooms:list(ws)});}
 if(!ws.room)throw Error('Join a ship first');
 if(m.type==='chat')return chat(ws,m.text);
 if(m.type==='comms')return chat(ws,m.text,true);
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
 if(m.type==='action'){if(!Number.isSafeInteger(m.seq)||m.seq<=ws.seq)return;ws.seq=m.seq;ws.room.game.command(ws.uid,m);}
 }catch(e){send(ws,{type:'error',message:String(e.message).slice(0,180)});}});
 ws.on('close',()=>{leave(ws);clients.delete(ws);if(sessions.get(ws.token)===ws)sessions.delete(ws.token);});ws.on('error',()=>{});send(ws,{type:'hello',protocol:1});}
wss.on('connection',onConnection);
// Classic mode (Internet Explorer 6 / Windows 2000 and other very old browsers): the server runs a headless copy of
// the game client per player, draws its view and serves it as pictures over plain HTTP.
const classic=require('./classic.cjs').createClassic({onConnection,root});

// ---- Simulation loop -------------------------------------------------------------------------------------
let previous=performance.now(),acc=0,frames=0,tickMs=0;
const timer=setInterval(()=>{const now=performance.now();acc+=Math.min((now-previous)/1000,.1);previous=now;let steps=0;const t0=performance.now();
 while(acc>=1/60&&steps++<3){const active=[];for(const r of rooms.values())if(r.game&&r.members.size){try{r.game.tick(1/60);r.tick++;active.push(r);}catch(e){recover(r,e);}}
  try{bus.step(active,1/60);}catch(e){console.error('Zone bus step failed',e.stack);}
  acc-=1/60;frames++;}
 if(steps>=3)acc=Math.min(acc,1/60);tickMs=tickMs*.9+(performance.now()-t0)*.1;
 // 20 snapshots a second (every 3rd 60 Hz tick).
 if(frames>=3){frames=0;const live=[...rooms.values()].filter(r=>r.game&&r.members.size);
  // Pass 1: every ship's exterior (layout hash changes only when the ship is rebuilt), so pass 2 never
  // lists a ship to others before its hull is known.
  for(const r of live){try{const layout=r.game.zone.exteriorLayout(),key=crypto.createHash('sha1').update(JSON.stringify(layout)).digest('base64').slice(0,12);if(r.layoutCache?.key!==key)r.layoutCache={key,layout};r.crewCache=r.game.zone.exteriorCrew();r.machinesCache=r.game.zone.exteriorMachines();/* other ships' live view: 10 a second (every other snapshot) */r.liveCache=(r.livePass=!r.livePass)?r.game.zone.exteriorLive():null;}catch(e){recover(r,e);}}
  for(const r of live){if(!r.game)continue;try{for(const ws of r.members){const st=r.game.snapshot(ws.uid);
    // Log: helm use, and zone changes (credited to whoever is at the helm).
    const pil=!!st?.self?.piloting;if(pil&&!ws.wasPiloting)logEvent(r,ws,'started using helm.','helm');ws.wasPiloting=pil;
    if(st&&r.lastZone&&st.zone!==r.lastZone&&!r.zoneLogged){const pilot=[...r.members].find(x=>x.wasPiloting);logEvent(r,pilot||null,'teleported the ship to '+(era.ZONES[st.zone]?.name||st.zone)+'.','zone');r.zoneLogged=true;}
    send(ws,{type:'snapshot',tick:r.tick,state:{...st,others:bus.others(r,ws.layoutSeen)}});}
   const z=zoneOf(r);r.zoneLogged=false;r.lastZone=z;}catch(e){recover(r,e);}}}
},1000/60);
const saves=setInterval(()=>{for(const r of rooms.values())if(r.game&&r.members.size)persist(r);try{bus.save();}catch(e){console.error('Zone save failed',e.message);}
 for(const r of rooms.values())if(r.game&&!r.members.size&&Date.now()-r.emptySince>IDLE_UNLOAD_MS)unload(r);},SAVE_INTERVAL_MS);
// Empty ships: a minute after the last crew member leaves, the ship is sent back to the Freeport tied to its zone
// (and unloaded). Ships not in memory just get the flag and go home the next time they load.
function returnEmptyShips(){const now=Date.now();for(const r of rooms.values()){if(r.members.size||r.returned||now-r.emptySince<RETURN_MS)continue;r.returned=true;{const z=zoneOf(r),home=era.HOME_FREEPORT[z];if(home&&home!==z&&era.ZONES[z]?.kind!=='safe')logEvent(r,null,'was returned to '+era.ZONES[home].name+' (empty for a minute).','zone');}
 if(r.game){try{r.game.run('returnToFreeport("empty")');}catch(e){console.error('Return failed',r.id,e.message);}unload(r);}else r.returnDue=true;}}
const returns=setInterval(returnEmptyShips,Math.min(1000,RETURN_MS/4));
const heartbeat=setInterval(()=>{for(const ws of clients){if(!ws.alive)ws.terminate();else{ws.alive=false;ws.ping();}}},15000);
function shutdown(){clearInterval(timer);try{classic.dispose();}catch{}clearInterval(returns);clearInterval(saves);clearInterval(heartbeat);for(const ws of clients)leave(ws);for(const r of rooms.values())persist(r);try{bus.save();}catch{}wss.close();server.close(()=>process.exit(0));for(const ws of clients)ws.close();setTimeout(()=>process.exit(0),1000).unref();}process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
server.listen(port,process.env.HOST||'127.0.0.1',()=>{console.log('notdred.io server listening on '+(process.env.HOST||'127.0.0.1')+':'+port);console.log('Dev token (paste it into the Token box on the main menu for the dev menu): '+process.env.DEV_TOKEN);});
