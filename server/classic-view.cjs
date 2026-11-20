'use strict';
// The headless game client behind one classic-mode player (see classic.cjs). It runs inside a worker thread
// (classic-worker.cjs): the real browser scripts in a VM, drawing into a node-canvas canvas.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),Canvas=require('canvas');
const HUD_SCALE=1.4;
const SCRIPTS=['vendor/planck.min.js','modules/era.js','zone-generator.js','modules/save-codec.js','modules/construction.js','modules/cargo.js','modules/machinery.js','modules/safeguards.js','modules/combat.js','modules/zones.js','modules/missions.js','modules/hatches.js','modules/controller.js','game.js','interface.js','network.js'];
function viewFactory(root){const dist=path.join(root,'dist'),compiled=new Map();
 const script=f=>{let s=compiled.get(f);if(!s){s=new vm.Script(fs.readFileSync(path.join(dist,f),'utf8'),{filename:f});compiled.set(f,s);}return s;};
 // ---- A forgiving stand-in for DOM elements: any property or method exists and does nothing. ----------------------
 function stubElement(extra={}){const store={value:'',textContent:'',innerHTML:'',hidden:false,open:false,checked:false,disabled:false,...extra};const fn=function(){};
  const proxy=new Proxy(fn,{get(t,p){if(p in store)return store[p];if(p===Symbol.iterator)return function*(){};if(p===Symbol.toPrimitive||p==='toString')return()=>'';if(p==='then')return undefined;if(p==='length')return 0;
    if(p==='showModal')return()=>{store.open=true;};if(p==='close')return()=>{store.open=false;};if(p==='querySelectorAll'||p==='getElementsByTagName')return()=>[];if(p==='style'||p==='classList'||p==='dataset'||p==='parentElement')return store[p]??=stubElement();
    if(typeof p==='string'&&p in Array.prototype)return [][p].bind([]);return stubElement();},
   set(t,p,v){store[p]=v;return true;},apply(){return stubElement();}});return proxy;}

 // ---- Headless client -----------------------------------------------------------------------------------------------
 function createView(toServer){
  const canvas=Canvas.createCanvas(640,400),out=Canvas.createCanvas(640,400),listeners={window:{},canvas:{}},elements={};
  canvas.style={};canvas.addEventListener=(t,f)=>{(listeners.canvas[t]??=[]).push(f);};
  const sprite=src=>{const clean=String(src).split('?')[0];if(clean.startsWith('data:'))return clean;const file=path.join(dist,clean);return file.startsWith(dist)&&fs.existsSync(file)?file:null;};
  class Img extends Canvas.Image{constructor(){super();this._l={};}addEventListener(t,f){(this._l[t]??=[]).push(f);}
   set src(v){this._src=v;const file=sprite(v);if(!file){this.failed=true;for(const f of this._l.error||[])f();this.onerror?.();return;}try{super.src=file.startsWith('data:')?file:fs.readFileSync(file);for(const f of this._l.load||[])f();this.onload?.();}catch{for(const f of this._l.error||[])f();this.onerror?.();}}
   get src(){return this._src||'';}}
  const timers=new Set();
  const doc={querySelector:q=>q==='#game'?canvas:stubElement(),querySelectorAll:()=>[],getElementById:id=>id==='game'?canvas:(elements[id]??=stubElement()),
   createElement:tag=>{if(tag==='canvas'){const c=Canvas.createCanvas(1,1);c.style={};c.addEventListener=()=>{};return c;}return stubElement();},body:stubElement(),activeElement:stubElement({tagName:'BODY'}),addEventListener(){}};
  const s={URL,URLSearchParams,document:doc,Image:Img,localStorage:{getItem(){return null},setItem(){},removeItem(){}},console,performance,Date,Math,JSON,
   setTimeout:(f,ms)=>{const t=setTimeout(()=>{timers.delete(t);try{f();}catch{}},ms);timers.add(t);return t;},clearTimeout:t=>{clearTimeout(t);timers.delete(t);},
   setInterval:(f,ms)=>{const t=setInterval(()=>{try{f();}catch{}},ms);timers.add(t);return t;},clearInterval:t=>{clearInterval(t);timers.delete(t);},
   requestAnimationFrame(){},innerWidth:640,innerHeight:400,devicePixelRatio:1,ZoneGenerator:require(path.join(dist,'zone-generator.js')),ShipCodec:require(path.join(dist,'modules/save-codec.js')),confirm:()=>false,prompt:()=>null,alert(){}};
  s.window=s;s.addEventListener=(t,f)=>{(listeners.window[t]??=[]).push(f);};s.removeEventListener=()=>{};s.location={protocol:'http:',host:'classic',hostname:'classic',search:''};s.navigator={userAgent:'notdred-classic'};
  vm.createContext(s);const opts={timeout:5000};for(const f of SCRIPTS)script(f).runInContext(s,opts);
  vm.runInContext('initialize();inLobby=true;',s,opts);
  // The client's socket is this session: what it sends goes straight to the server's message handler.
  s.__toServer=str=>toServer(str);vm.runInContext('netSocket={readyState:1,send:str=>__toServer(str),close(){}};',s,opts);
  const receive=vm.runInContext('(str)=>{const m=JSON.parse(str);if(m.type==="snapshot"){receiveSnapshot(m.state,m.tick);return null;}return m;}',s);
  const run=c=>vm.runInContext(c,s,opts);
  const fire=(target,type,e)=>{for(const f of listeners[target][type]||[])try{f(e);}catch{}};
  const ev=(o={})=>({preventDefault(){},stopPropagation(){},target:stubElement(),repeat:false,shiftKey:false,...o});
  return {
   receive(str){try{return receive(str);}catch(e){return null;}},
   welcome(m){s.__m=m;run('netID=__m.self;netAdmin=!!__m.admin;');},
   joined(m,name){s.__m=m;s.__name=name;run('netBlocks=[];netTerrainList=[];netMountList=[];netCaptain=!!__m.captain;netCrewKey="";netOthers=new Map();netActive=true;inLobby=false;localName=__name;');},
   left(){run('netActive=false;inLobby=true;netState=null;keys={};');},
   key(type,key,shift,repeat){s.__key=key;fire('window',type,ev({key,shiftKey:!!shift,repeat:!!repeat}));},
   // The client is laid out at HUD_SCALE× the picture size and scaled down, so the game's fixed-size HUD (minimap,
   // labels) fits a small classic picture; clicks are mapped back the same way.
   mouse(x,y,button,w,h){s.innerWidth=w*HUD_SCALE;s.innerHeight=h*HUD_SCALE;const e=ev({clientX:x*HUD_SCALE,clientY:y*HUD_SCALE,button});canvas.onmousemove?.(e);if(button!=null){canvas.onmousedown?.(e);fire('window','mouseup',ev());}},
   render(w,h,zoom,quality){s.innerWidth=Math.round(w*HUD_SCALE);s.innerHeight=Math.round(h*HUD_SCALE);s.__z=zoom*HUD_SCALE;
    run('if(netState){zoomWanted=__z;try{networkFrame();}catch(e){}const t=piloting?ship.getPosition():ship.getWorldPoint(localPlayer());cam.x=t.x;cam.y=t.y-1;}draw();');
    if(out.width!==w||out.height!==h){out.width=w;out.height=h;}const g=out.getContext('2d');g.imageSmoothingEnabled=true;g.drawImage(canvas,0,0,w,h);return out.toBuffer('image/jpeg',{quality});},
   status(){return run(`(()=>{if(!netState)return null;const fab=el('craft').open&&activeFab?{kind:FABRICATORS[activeFab.kind]?.name||'Fabricator',materials:Object.entries(activeFab.materials||{}).filter(([,n])=>n>0).map(([t,n])=>({type:t,name:NAMES[t]||t,count:n})),
     recipes:(FABRICATORS[activeFab.kind]?.recipes||[]).map(t=>({type:t,name:NAMES[t]||t,cost:Object.entries(recipeNeeds?.(t)||{}).map(([k,n])=>n+' '+(NAMES[k]||k)).join(', ')})),queue:(activeFab.queue||[]).length}:null;
     const m=currentMission();return {ship:shipName,zone:zoneDef().name,blurb:zoneDef().blurb,hp:Math.round(shipHP),maxHp:shipMaxHP(),critical:shipHP<=0&&isCombatZone()?Math.ceil(RETURN_SECONDS-criticalFor):0,piloting,rank:netRank,captain:netCaptain,
      slots:slots.map((t,i)=>t?{type:t,name:NAMES[t]||t,count:stackCounts[i]}:null),selected,crew:netState.crew.map(c=>({name:c.name,rank:c.rank||'guest'})),
      mission:m.active?'Mission: '+zoneDef(m.active).name+' · closes in '+missionClock(m.endsIn):'Next mission: '+zoneDef(MISSIONS.rotation[(m.index||0)%MISSIONS.rotation.length]).name+' in '+missionClock(m.nextIn),fab};})()`);},
   craft(item,count){s.__i=item;s.__n=count;run('if(activeFab)craft(__i,__n)');},rename(name){s.__nm=String(name||'');run('netAction("rename",{name:__nm})');},
   insert(){run('if(activeFab&&TYPES.includes(tool))transferMaterial(tool)');},
   closeFab(){run("el('craft').close();activeFab=null;");},
   dispose(){for(const t of timers){clearTimeout(t);clearInterval(t);}timers.clear();try{run('netActive=false;');}catch{}}};}

 return createView;}
module.exports={viewFactory,HUD_SCALE};
