'use strict';
// Classic mode: notdred.io for Internet Explorer 6 on Windows 2000 and other browsers far too old for the game page.
//
// Each classic player gets a headless copy of the real browser client running here on the server: the same game
// scripts (dist/modules/*, game.js, network.js), fed the same snapshots a browser would get, drawing into a canvas
// (node-canvas). Its picture is served as JPEG frames; the player's key presses and clicks are replayed into that
// client's own input handlers, so every control behaves exactly as in the full game. The old browser only needs
// plain HTTP, <img> and XMLHttpRequest — see dist/classic.html (written in ES3 JavaScript for IE6).
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{EventEmitter}=require('node:events'),{Worker}=require('node:worker_threads');
let Canvas=null;try{Canvas=require('canvas');}catch{}
const SESSION_IDLE_MS=Number(process.env.CLASSIC_IDLE_MS||60000),MAX_SESSIONS=Number(process.env.CLASSIC_MAX||8),FPS=Number(process.env.CLASSIC_FPS||30);

function createClassic({onConnection,root}){
 const dist=path.join(root,'dist'),sessions=new Map();

 // ---- Sessions: a stand-in socket the server treats like any other client --------------------------------------------
 // Each session's headless client and renderer live in a worker thread (classic-worker.cjs). Snapshots are forwarded
 // to it as they arrive; it draws on its own 30 fps clock and hands back JPEGs. A frame request is answered with the
 // newest picture the player hasn't seen yet, or waits for the next one — so the old browser's loop runs at the
 // renderer's frame rate with no fixed pause and no drawing time in its round trip.
 class ClassicSocket extends EventEmitter{constructor(session){super();this.readyState=1;this.bufferedAmount=0;this.session=session;}
  send(str){this.session.fromServer(str);}ping(){setImmediate(()=>this.emit('pong'));}
  close(){if(this.readyState===3)return;this.readyState=3;this.emit('close');}terminate(){this.close();}}
 function createSession(name,token,devToken){if(sessions.size>=MAX_SESSIONS)throw Error('Classic mode is full right now. Try again later.');
  const id=crypto.randomBytes(16).toString('hex'),q=[];let joined=false;
  const worker=new Worker(path.join(__dirname,'classic-worker.cjs'),{workerData:{root,fps:FPS}});
  const session={id,name,last:Date.now(),queue:q,ws:null,welcome:null,status:null,latest:null,served:0,waiters:[],frameMs:0,
   post(m){try{worker.postMessage(m);}catch{}},
   fromServer(str){if(str.startsWith('{"type":"snapshot"'))return session.post({t:'snap',str});let m;try{m=JSON.parse(str);}catch{return;}
    if(m.type==='hello'){session.ws.emit('message',JSON.stringify({type:'hello',protocol:1,name,token:token||undefined,devToken:devToken||undefined}));return;}
    if(m.type==='welcome'){session.welcome=m;session.post({t:'welcome',m});}
    if(m.type==='joined'){joined=true;session.post({t:'joined',m,name});}
    if(m.type==='rooms'&&joined){joined=false;session.status=null;session.post({t:'left'});}
    if(m.type==='pong'||m.type==='export')return;q.push(m);if(q.length>80)q.splice(0,q.length-80);},
   toServer(obj){session.ws.emit('message',typeof obj==='string'?obj:JSON.stringify(obj));},
   close(){if(!sessions.has(id))return;sessions.delete(id);try{session.ws.close();}catch{}for(const w of session.waiters.splice(0))w(null);/* ask the drawing thread to stop between frames (terminating it mid-draw could kill the whole server inside node-canvas); force it only if it doesn't */session.post({t:'stop'});setTimeout(()=>worker.terminate().catch(()=>{}),3000).unref();}};
  worker.on('message',m=>{if(m.t==='out')session.ws.emit('message',m.str);
   else if(m.t==='frame'){session.latest={seq:m.seq,buf:Buffer.from(m.buf)};session.frameMs=session.frameMs*.9+m.ms*.1;/* one waiting request per new frame: the page keeps several in flight, and each gets its own frame */const w=session.waiters.shift();if(w){session.served=m.seq;w(session.latest);}}
   else if(m.t==='status')session.status=m.st;
   else if(m.t==='error')console.error('Classic view error:',m.message);});
  worker.on('error',e=>{console.error('Classic worker failed:',e.message);session.close();});
  session.ws=new ClassicSocket(session);sessions.set(id,session);onConnection(session.ws);return session;}
 // The newest frame this player hasn't seen yet, waiting up to `ms` for one.
 // The page keeps 2–3 frame requests in flight (so its frame rate isn't capped at one picture per round trip); each
 // gets a different, newer frame, handed out in order.
 function nextFrame(s,ms){if(s.latest&&s.latest.seq>s.served){s.served=s.latest.seq;return Promise.resolve(s.latest);}return new Promise(res=>{const t=setTimeout(()=>{const i=s.waiters.indexOf(done);if(i>=0)s.waiters.splice(i,1);res(s.latest);},ms);function done(f){clearTimeout(t);res(f);}s.waiters.push(done);});}
 const sweep=setInterval(()=>{const now=Date.now();for(const s of [...sessions.values()])if(now-s.last>SESSION_IDLE_MS)s.close();},5000);sweep.unref?.();

 // ---- HTTP -----------------------------------------------------------------------------------------------------------
 const reply=(res,code,body,type='text/plain; charset=utf-8')=>{res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-cache, no-store','Pragma':'no-cache','Expires':'0'});res.end(body);};
 // Responses are JavaScript object literals the old page reads with eval (IE6 has no JSON object).
 const js=(res,o)=>reply(res,200,'('+JSON.stringify(o).replace(/[\u2028\u2029]/g,' ')+')','text/javascript; charset=utf-8');
 const num=(v,lo,hi,d)=>{const n=Number(v);return Number.isFinite(n)?Math.min(hi,Math.max(lo,n)):d;};
 function handle(req,res,u){
  if(u.pathname==='/classic'||u.pathname==='/classic/'){fs.readFile(path.join(dist,'classic.html'),(e,b)=>e?reply(res,500,'Missing classic.html'):reply(res,200,b,'text/html; charset=utf-8'));return;}
  const q=u.searchParams,op=u.pathname.slice('/classic/'.length);
  try{
   if(op==='connect'){if(!Canvas)return js(res,{error:'Classic mode is not available on this server (the "canvas" package is not installed).'});
    const s=createSession(String(q.get('name')||'Player').replace(/[<>\x00-\x1f]/g,'').slice(0,24)||'Player',/^[a-f0-9]{48}$/.test(q.get('token')||'')?q.get('token'):null,q.get('dev')||null);
    const t=Date.now();const wait=()=>{if(s.welcome)return js(res,{session:s.id,token:s.welcome.token,admin:!!s.welcome.admin,rooms:s.welcome.rooms});if(Date.now()-t>6000)return js(res,{error:'The server did not answer.'});setTimeout(wait,20);};return wait();}
   const s=sessions.get(q.get('s')||'');if(!s)return op==='frame'?reply(res,410,'Session ended'):js(res,{error:'Your classic session has ended. Reload the page.',ended:true});s.last=Date.now();
   if(op==='send'){let m;try{m=JSON.parse(q.get('m')||'');}catch{return js(res,{error:'Bad message'});}
    if(!m||typeof m!=='object'||!['create','join','leave','list','chat','comms','leaderboard','delete','motd','crew','shipsettings','rank','kick','ban','votekick','privacy','newinvite'].includes(m.type))return js(res,{error:'Not allowed'});s.toServer(m);return js(res,{ok:true});}
   // Renaming is a game action, sent by the player's own headless client (it numbers the actions).
   if(op==='rename'){s.post({t:'rename',name:String(q.get('name')||'').slice(0,40)});return js(res,{ok:true});}
   if(op==='key'){s.post({t:'key',type:q.get('d')==='1'?'keydown':'keyup',key:String(q.get('k')||'').slice(0,12),shift:q.get('sh')==='1',repeat:q.get('r')==='1'});return js(res,{ok:true});}
   if(op==='click'){const w=num(q.get('w'),160,1280,640),h=num(q.get('h'),120,960,400);s.post({t:'mouse',x:num(q.get('x'),0,w,0),y:num(q.get('y'),0,h,0),button:q.get('b')==='2'?2:0,w,h});return js(res,{ok:true});}
   if(op==='craft'){s.post({t:'craft',item:String(q.get('item')||''),n:num(q.get('n'),1,8,1)});return js(res,{ok:true});}
   if(op==='insert'){s.post({t:'insert'});return js(res,{ok:true});}
   if(op==='closefab'){s.post({t:'closefab'});return js(res,{ok:true});}
   if(op==='poll'){return js(res,{messages:s.queue.splice(0),status:s.status,renderMs:Math.round(s.frameMs)});}
   if(op==='frame'){const w=num(q.get('w'),160,1280,640),h=num(q.get('h'),120,960,400),z=num(q.get('z'),4,64,24),quality=num(q.get('q'),.3,.9,.6);
    s.post({t:'want',w,h,z,q:quality});
    nextFrame(s,s.latest?250:4000).then(f=>{if(!f)return reply(res,503,'No picture yet');res.writeHead(200,{'Content-Type':'image/jpeg','Content-Length':f.buf.length,'Cache-Control':'no-cache, no-store','Pragma':'no-cache','Expires':'0'});res.end(f.buf);});return;}
   if(op==='quit'){s.close();return js(res,{ok:true});}
   return reply(res,404,'Not found');
  }catch(e){return js(res,{error:String(e.message).slice(0,180)});}}
 return {handle,dispose(){clearInterval(sweep);for(const s of [...sessions.values()])s.close();},sessions,available:!!Canvas};}
module.exports={createClassic};
