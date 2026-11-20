'use strict';
const BOT_PUNCH=30; // m/s a punch round adds to a bot (bots are heavily damped: they slide about 15 m)
const BOULDER_KICK=9; // m/s a punch round adds to a boulder (yank: the same, toward the shooter)
// What a mined rock gives: plain rock sometimes iron; diamond ore an RC turret (2019); Canary seams iron or
// flux; Pits treasure blocks one roll of TREASURE_LOOT. Each also adds leaderboard score.
function mineRock(id,roll=Math.random()){const r=rocks.get(id);if(!r)return;removeRock(id);zoneData[zone].mined.push(id);if(typeof zoneEvent==='function')zoneEvent({type:'mined',zone,seed:zoneData[zone].seed||0,id});const kind=r.kind||(r.ore?'ore':'rock');
 if(kind==='rock'){/* plain (brown) Canary rock drops nothing; elsewhere 1 in 4 drops iron */if(roll<.25&&zoneDef().tiles!=='canary')addWorldLoot('iron',V(r.x,r.y),16);addScore(SCORE.rock);}
 else if(kind==='ore'){addWorldLoot(TURRET_ORE_DROPS[Math.floor(roll*3)%3],V(r.x+.8,r.y),1);addScore(SCORE.ore);}
 else if(kind==='iron'){addWorldLoot('iron',V(r.x,r.y),zoneDef().tiles==='canary'?CANARY_IRON_DROP:16);addScore(SCORE.ore);}
 else if(kind==='flux'){addWorldLoot('flux',V(r.x,r.y),4);addScore(SCORE.ore);}
 else if(kind==='treasure'){const [type,count]=TREASURE_LOOT[Math.floor(roll*TREASURE_LOOT.length)%TREASURE_LOOT.length];addWorldLoot(type,V(r.x,r.y),count);addScore(SCORE.treasure);toastAll('Treasure block cracked: '+count+' '+NAMES[type]+'!');}}
function addScore(n){if(Number.isFinite(n)&&n>0)shipScore=Math.min(999999,shipScore+Math.round(n));}

// Several turrets don't all fire on the same frame: they go off in a very fast wave (TURRET_WAVE seconds apart, the
// whole volley within TURRET_WAVE_MAX), sweeping across the ship at right angles to the shot. Each keeps the aim point
// it was given and turns to it from wherever it is when its turn comes.
const TURRET_WAVE=.03,TURRET_WAVE_MAX=.25;
function waveOrder(list,aim){if(list.length<2)return list.map(m=>({m,delay:0}));const c=ship.getPosition(),d=V(aim.x-c.x,aim.y-c.y);if(d.length()<.1)d.set(1,0);d.normalize();const side=m=>{const p=ship.getWorldPoint(mountPoint(m));return (p.x-c.x)*-d.y+(p.y-c.y)*d.x;};const gap=Math.min(TURRET_WAVE,TURRET_WAVE_MAX/(list.length-1));return list.map(m=>({m,k:side(m)})).sort((a,b)=>a.k-b.k).map((e,i)=>({m:e.m,delay:i*gap}));}
function fireRC(){if(!isCombatZone())return toast('Weapons disabled in '+zoneDef().name+'.');if(fireCooldown>0)return;const aim=V((mouse.x-W/2)/zoom+cam.x,(mouse.y-H/2)/zoom+cam.y);let reloading=0;const ready=[];for(const m of mounts.filter(m=>m.type==='turret'&&!m.kind&&(m.ammo||0)>0)){if((m.reload||0)>0||m.waveIn!=null){reloading++;continue;}if(turretAim(m,aim))ready.push(m);}
 for(const {m,delay} of waveOrder(ready,aim)){m.reload=turretReload(m)+delay;if(delay>0){m.waveIn=delay;m.waveAim={x:aim.x,y:aim.y};}else{const a=turretAim(m,aim);fireMountRound(m,a.dir);m.recoilUntil=clock+.14;}}
 fireCooldown=.05;if(!ready.length&&!reloading)toast('Load ammo into an RC on the side facing the target.');}
// Turret controllers (ℵ21) sit in the hull wall. Each works the burst/auto turrets on its own wall, up to
// TURRET_CONTROLLER.turrets of them (the nearest along the wall); more turrets on that wall need another controller.
// Stand by one inside the ship and press E to man it; the mouse aims, a click fires (bursts per click, autos while
// held). Walking off, or pressing E again, leaves it.
function ctrlKey(m){return m.side+':'+m.at;}
function controllerByKey(k){return mounts.find(m=>m.type==='turret_controller'&&ctrlKey(m)===k)||null;}
function nearController(){const p=localPlayer();let best=null,bd=TURRET_CONTROLLER.reach;for(const m of mounts){if(m.type!=='turret_controller')continue;const d=P.Vec2.distance(p,mountPoint(m));if(d<bd){bd=d;best=m;}}return best;}
function controllerAssignments(side){const ctrls=mounts.filter(m=>m.type==='turret_controller'&&m.side===side).sort((a,b)=>a.at-b.at),free=mounts.filter(m=>m.type==='turret'&&m.side===side&&!m.starterRC&&(m.kind==='burst'||m.kind==='auto')),out=new Map();
 for(const c of ctrls){free.sort((a,b)=>Math.abs(a.at-c.at)-Math.abs(b.at-c.at));out.set(c,free.splice(0,TURRET_CONTROLLER.turrets));}return out;}
function controlledTurrets(c){return c?controllerAssignments(c.side).get(c)||[]:[];}
function toggleController(){if(manning){const direct=!!mannedTurret(manning);manning=null;toast(direct?'Left the turret.':'Left the turret controller.');return true;}const t=nearController();if(!t)return false;manning=ctrlKey(t);const n=controlledTurrets(t).length,all=mounts.filter(m=>m.type==='turret'&&m.side===t.side&&(m.kind==='burst'||m.kind==='auto')).length;
 toast(n?'Manning the '+t.side+' turret controller: aim with the mouse, click to fire ('+n+' turret'+(n>1?'s':'')+(all>n?'; '+(all-n)+' more on this wall need another controller':'')+'). E or move to leave.':'No burst or auto turret on this wall for this controller to work.');return true;}
function turretAim(m,aim){const at=ship.getWorldPoint(mountPoint(m)),dir=V(aim.x-at.x,aim.y-at.y),out=inward(m).clone().neg();if(dir.length()<.1)return null;dir.normalize();if(P.Vec2.dot(dir,out)<.12)return null;return {at,dir};}
function fireMountRound(m,dir){const at=ship.getWorldPoint(mountPoint(m));m.ammo--;m.recoilUntil=clock+.12;m.aim=Math.atan2(dir.y,dir.x);fireRound(m.ammoType||'ammo',V(at.x+dir.x*2,at.y+dir.y*2),dir);}
// Manning a burst or auto turret directly: click it (wrench or empty hand) to take it, aim with the mouse, hold the
// mouse to fire; moving, jumping or E lets go. Shift+click still ejects its ammo. (Controllers still work as before.)
function turretKey(m){return 'T:'+m.side+':'+m.at;}
function mannedTurret(k){return typeof k==='string'&&k.startsWith('T:')?mounts.find(m=>m.type==='turret'&&turretKey(m)===k)||null:null;}
const MAN_REACH=4;
function manTurret(m){if(!(m.kind==='burst'||m.kind==='auto'))return false;if(piloting)return false;if(P.Vec2.distance(localPlayer(),mountPoint(m))>MAN_REACH){toast('Move closer to man the turret.');return true;}manning=turretKey(m);toast('Manning the '+(m.kind==='burst'?'burst':'auto')+' turret: aim with the mouse, hold to fire. Move to let go.');return true;}
function canPull(m,aim){return (m.ammo||0)>0&&!((m.reload||0)>0)&&!(m.burstLeft>0)&&m.waveIn==null&&!!turretAim(m,aim);}
function pullTrigger(m,aim,delay=0){if(!canPull(m,aim))return;const a=turretAim(m,aim),def=turretDef(m);
 if(m.kind==='burst'){m.burstLeft=def.burst;m.burstTimer=delay;m.burstDir={x:a.dir.x,y:a.dir.y};m.reload=turretReload(m)+delay;}else if(delay>0){m.waveIn=delay;m.waveAim={x:aim.x,y:aim.y};m.reload=turretReload(m)+delay;}else{fireMountRound(m,a.dir);m.reload=turretReload(m);}}
// Connected to a server, the page only predicts movement: turrets fire on the server (they used to fire here too,
// leaving frozen copies of the rounds on screen).
function controllerFire(){if(typeof netActive!=='undefined'&&netActive)return;const mt=mannedTurret(manning);if(mt){if(P.Vec2.distance(localPlayer(),mountPoint(mt))>MAN_REACH+1.5){manning=null;return;}if(!isCombatZone())return;pullTrigger(mt,V((mouse.x-W/2)/zoom+cam.x,(mouse.y-H/2)/zoom+cam.y));return;}
 const t=manning&&controllerByKey(manning);if(!t||P.Vec2.distance(localPlayer(),mountPoint(t))>TURRET_CONTROLLER.reach+1.5){manning=null;return;}if(!isCombatZone())return;const aim=V((mouse.x-W/2)/zoom+cam.x,(mouse.y-H/2)/zoom+cam.y);
 for(const {m,delay} of waveOrder(controlledTurrets(t).filter(m=>canPull(m,aim)),aim))pullTrigger(m,aim,delay);}
// Burst turrets finish their bursts on their own; a held trigger keeps auto turrets firing.
function tickTurrets(dt){for(const m of mounts){if(m.reload>0)m.reload=Math.max(0,m.reload-dt);if(m.waveIn!=null){m.waveIn-=dt;if(m.waveIn<=0){const a=m.waveAim&&turretAim(m,V(m.waveAim.x,m.waveAim.y));m.waveIn=null;m.waveAim=null;if(a&&(m.ammo||0)>0&&isCombatZone()){fireMountRound(m,a.dir);if(!m.kind)m.recoilUntil=clock+.14;}}}if(m.burstLeft>0){m.burstTimer-=dt;if(m.burstTimer<=0){if((m.ammo||0)>0&&isCombatZone())fireMountRound(m,V(m.burstDir.x,m.burstDir.y));m.burstLeft=(m.ammo||0)>0?m.burstLeft-1:0;m.burstTimer=TURRETS.burst.gap;}}}}
function crewManning(k){if(typeof crew!=='undefined'&&crew.size)return [...crew.values()].some(c=>c.manning===k)||manning===k;return manning===k;}
// One round of any ammo type (era.js AMMO): scatter fires a fan of pellets, everything else one projectile.
function fireRound(type,at,dir){if(typeof netActive!=='undefined'&&netActive)return;const def=AMMO[type]||AMMO.ammo,n=def.pellets||1,base=Math.atan2(dir.y,dir.x),v=ship.getLinearVelocity();
 for(let k=0;k<n;k++){const a=base+(n>1?(k/(n-1)-.5)*def.spread:0),d=V(Math.cos(a),Math.sin(a));shots.push({type:AMMO[type]?type:'ammo',p:at.clone(),v:V(d.x*def.speed+v.x*.2,d.y*def.speed+v.y*.2),life:def.life,maxLife:def.life,bounces:def.bounces||0});}}
// Damage a shot deals now: trash decays over its flight; flak fragments carry their own number.
// Damage a round does to world tiles (mining): standard ammo mines with its full 2019 round (mine) though it hits
// ships and bots for half.
function rockDamage(def,dmg){return (def.mine?dmg*def.mine/def.damage:dmg)*WORLD_DAMAGE_SCALE;}
function shotDamage(s){const def=AMMO[s.type]||AMMO.ammo;if(s.damage!=null)return s.damage;if(def.decay!=null){const f=1-Math.max(0,s.life)/(s.maxLife||def.life);return def.damage*(1-(1-def.decay)*f);}return def.damage;}
function shotImpulse(s,body,mass,scale){const def=AMMO[s.type];if(!def?.impulse||s.damage!=null)return;const d=s.v.clone();d.normalize();const k=def.impulse*mass*scale;body.applyLinearImpulse(V(d.x*k,d.y*k),body.getWorldCenter(),true);}
function tickShots(dt){const add=[];for(const s of shots){s.v.y+=zoneDef().shotGravity*dt;const def=AMMO[s.type]||AMMO.ammo;
  // Flak: one shell that bursts into fragments part-way through its flight.
  if(def.burst&&s.damage==null&&s.maxLife-s.life>=def.burst.after){const b=def.burst,base=Math.atan2(s.v.y,s.v.x);for(let k=0;k<b.count;k++){const a=base+(k/(b.count-1)-.5)*b.spread;add.push({type:s.type,p:s.p.clone(),v:V(Math.cos(a)*b.speed,Math.sin(a)*b.speed),life:b.life,maxLife:b.life,damage:b.damage,frag:true,bounces:0,owner:s.owner,selfArmed:s.selfArmed});}s.life=0;continue;}
  if(typeof onShotStart==='function')onShotStart(s);/* a round can hit its own ship once it has cleared the hull (a sniper ricochet, a slug the ship runs into) */if(s.owner!=null&&!s.selfArmed&&typeof shotLeftOwner==='function'&&shotLeftOwner(s))s.selfArmed=true;const next=V(s.p.x+s.v.x*dt,s.p.y+s.v.y*dt);let hit=null,closest=1,at=null,normal=null;world.rayCast(s.p,next,(f,p,n,fraction)=>{const data=f.getBody().getUserData();if(s.owner!=null&&data?.ghost===s.owner&&!s.selfArmed)return -1;if(data?.boulder&&fraction<closest){closest=fraction;hit='boulder:'+data.boulder;at=p.clone();normal=n.clone();return 1;}const id=(data?.rockChunk!=null?rockAtHit(p,V(next.x-s.p.x,next.y-s.p.y).mul(1/Math.max(1e-6,P.Vec2.distance(s.p,next)))):null)||(data?.bot?'bot:'+data.species+':'+data.botIndex:data?.ghost?'ghost:'+data.ghost:null);if(id&&fraction<closest){closest=fraction;hit=id;at=p.clone();normal=n.clone();}return 1;});
  if(hit){const dmg=shotDamage(s);
   if(hit.startsWith('boulder:')){const b=boulders.find(x=>'boulder:'+x.id===hit),d=s.v.clone();d.normalize();
    // Boulders barely notice ordinary rounds; punch shoves them hard and yank drags them back toward the shooter.
    if(b){const imp=AMMO[s.type]?.impulse||0,k=b.body.getMass()*(imp?imp*BOULDER_KICK:.25);b.body.applyLinearImpulse(V(d.x*k,d.y*k),at,true);b.body.setAwake(true);}s.life=0;}
   else if(hit.startsWith('ghost:')){const self=s.owner!=null&&hit.slice(6)===String(s.owner),amount=dmg*(self?1:typeof shotPvp==='function'?shotPvp(s):pvpMultiplier());const d=s.v.clone();d.normalize();if(typeof zoneEvent==='function')zoneEvent({type:'hit',target:hit.slice(6),zone,amount,ammo:s.frag?'flak':s.type||'ammo',point:{x:at.x,y:at.y},dir:{x:d.x,y:d.y}});if(amount>0&&!self)addScore(amount/100*SCORE.pvpPer100);s.life=0;}
   else if(hit.startsWith('bot:')){const [,species,ix]=hit.split(':'),index=Number(ix),bot=findBot(species,index);if(bot)shotImpulse(s,bot.body,bot.body.getMass(),BOT_PUNCH);damageBot(dmg,species,index);s.life=0;}
   else {const r=rocks.get(hit);if(r.kind==='hazard'){s.life=0;continue;}if(r.kind==='seeker'){wakeSeeker(hit);s.life=0;continue;}if(def.rockBreaker&&s.damage==null)r.hp=0;else r.hp-=rockDamage(def,dmg);if(typeof noteRockHurt==='function')noteRockHurt(r);if(r.hp<=0)mineRock(hit);
    // Sniper rounds ricochet off rock.
    if(s.bounces>0&&normal){s.bounces--;const vn=s.v.x*normal.x+s.v.y*normal.y;s.v=V(s.v.x-2*vn*normal.x,s.v.y-2*vn*normal.y);s.p=V(at.x+normal.x*.05,at.y+normal.y*.05);s.life-=dt;continue;}s.life=0;}}
  s.p=next;s.life-=dt;}
 shots=shots.filter(s=>s.life>0);if(add.length)shots.push(...add);}

function tickZone(dt){tickDungeon(dt);fireCooldown=Math.max(0,fireCooldown-dt);tickTurrets(dt);tickShots(dt);tickHatches(dt);if(typeof tickMissions==='function')tickMissions(dt);}

// Bots are data-driven: era.js BOT_TYPES gives each species its stats and zoneDef().bots its count per zone.
// Each live bot is {species, index, body, hp, ...}; `color` mirrors species for the network/renderers.
function allBots(){return bots.filter(Boolean);}
function findBot(species,index){return bots.find(b=>b&&b.species===species&&b.index===index)||null;}
function botsOf(species){return bots.filter(b=>b&&b.species===species);}
function spawnBot(species,saved=null,index=0){
 const def=BOT_TYPES[species],g=zoneGrid();if(!def||!g)return null;const radius=def.radius,candidates=[];
 function clear(q){if((typeof nearAnyShip==='function'?nearAnyShip(q,25):P.Vec2.distance(q,ship.getPosition())<25)||nearPortal(q,BOT_RULES.portalKeepout+radius+6))return false;// Rock is checked cell by cell (a rock chunk's bounding box can cover open space around it); anything else by box.
 for(let cx=Math.floor((q.x-radius-2-g.minX)/4);cx<=Math.ceil((q.x+radius+2-g.minX)/4);cx++)for(let cy=Math.floor((q.y-radius-2-g.minY)/4);cy<=Math.ceil((q.y+radius+2-g.minY)/4);cy++){const x=g.minX+cx*4,y=g.minY+cy*4;if(rocks.has(key(x,y))&&Math.abs(x-q.x)<radius+2.3&&Math.abs(y-q.y)<radius+2.3)return false;}
 let ok=true;world.queryAABB(new P.AABB(V(q.x-radius-.3,q.y-radius-.3),V(q.x+radius+.3,q.y+radius+.3)),f=>{if(!f.isSensor()&&f.getBody().getUserData()?.rockChunk==null)ok=false;return ok;});return ok;}
 let p=saved&&clear(V(saved.x,saved.y))?V(saved.x,saved.y):null;
 if(!p){g.openCells??=Int32Array.from(g.centers.reduce((a,c,i)=>(c&&a.push(i),a),[]));const order=g.openCells.slice();for(let n=0;n<order.length&&!p;n++){const j=n+Math.floor(Math.random()*(order.length-n)),i=order[j];order[j]=order[n];const q=V(g.minX+i%g.width*4,g.minY+Math.floor(i/g.width)*4);if(clear(q))p=q;}}
 if(!p)return null;
 const body=world.createDynamicBody({position:p,gravityScale:0,linearDamping:2,fixedRotation:true,userData:{bot:true,species,botIndex:index}});
 body.createFixture(P.Circle(radius),{density:def.density||2,friction:.3});
 const old=findBot(species,index);if(old){world.destroyBody(old.body);bots.splice(bots.indexOf(old),1);}
 const bot={body,species,color:species,index,hp:saved?.hp||def.hp,maxhp:def.hp,home:p.clone(),fire:BOT_RULES.arrivalGrace+Math.random()*3,path:[],pathTimer:Math.random()*2,contactCd:0};bots.push(bot);return bot;
}
function setupDungeonActors(){bots=[];enemyShots=[];zoneInitialCount=rocks.size+(zoneData[zone]?.mined?.length||0);if(!isCombatZone())return;const st=zoneData[zone],counts=zoneDef().bots||{};
 // v21 saves kept Finch bot state in redStates/bot/botDead; bots simply respawn fresh from those.
 delete st.redStates;delete st.bot;delete st.botDead;delete st.botRespawnIn;st.bots??={};
 for(const sp of Object.keys(st.bots))if(!counts[sp])delete st.bots[sp];
 for(const [sp,n] of Object.entries(counts)){const list=st.bots[sp]=Array.from({length:n},(_,i)=>st.bots[sp]?.[i]||{dead:false});
  list.forEach((r,i)=>{if(!r.dead&&!spawnBot(sp,r.bot,i))list[i]={dead:true,respawn:1};});}
}
function damageBot(amount,species='green',index=0){const bot=findBot(species,index);if(!bot)return;bot.hp-=Math.max(0,amount);if(bot.hp>0)return;
 const p=bot.body.getPosition().clone();world.destroyBody(bot.body);bots.splice(bots.indexOf(bot),1);const st=zoneData[zone];
 if(!BOT_TYPES[species].dormant)((st.bots??={})[species]??=[])[index]={dead:true,respawn:BOT_RESPAWN_SECONDS};
 const drops=BOT_DROPS[species]||[];drops.forEach(([type,count],k)=>addWorldLoot(type,V(p.x+(k-(drops.length-1)/2)*4.2,p.y),count));
 addScore(SCORE.bot[species]||0);toastAll(BOT_TYPES[species].label+' destroyed. Respawns in '+BOT_RESPAWN_SECONDS+'s.');save(true);
}
// Canary seeker tiles: a shot turns the tile into a live seeker bot at that spot (the tile counts as mined).
function wakeSeeker(id){const r=rocks.get(id);if(!r)return;removeRock(id);zoneData[zone].mined.push(id);if(typeof zoneEvent==='function')zoneEvent({type:'mined',zone,seed:zoneData[zone].seed||0,id});const index=1000+bots.filter(b=>b.species==='seeker').length+Math.floor(Math.random()*1e5);spawnBotAt('seeker',V(r.x,r.y),index).fire=0;toastAll('A seeker woke up!');}
function spawnBotAt(species,p,index){const def=BOT_TYPES[species],body=world.createDynamicBody({position:p,gravityScale:0,linearDamping:2,fixedRotation:true,userData:{bot:true,species,botIndex:index}});body.createFixture(def.square?P.Box(def.radius*.9,def.radius*.9):P.Circle(def.radius),{density:def.density||2,friction:.3});const bot={body,species,color:species,index,hp:def.hp,maxhp:def.hp,home:p.clone(),fire:1,path:[],pathTimer:0,contactCd:0};bots.push(bot);return bot;}
function tickBotRespawn(dt){const st=zoneData[zone];if(!st?.bots||!isCombatZone())return;
 for(const [sp,list] of Object.entries(st.bots))for(let i=0;i<list.length;i++){const r=list[i];if(!r?.dead)continue;r.respawn=Math.max(0,(r.respawn??BOT_RESPAWN_SECONDS)-dt);if(r.respawn===0){if(spawnBot(sp,null,i))list[i]={dead:false};else r.respawn=1;}}
}
// Contact test against the ship's axis-aligned hull box (ships never rotate), identical under Planck and native Box2D.
function botTouchingShip(bot){const e=shipExtents(),sp=ship.getPosition(),p=bot.body.getPosition(),lx=p.x-sp.x,ly=p.y-sp.y,dx=Math.max(e.l-lx,0,lx-e.r),dy=Math.max(e.t-ly,0,ly-e.b);return Math.hypot(dx,dy)<=BOT_TYPES[bot.species].radius+.35;}
function botPath(from,to){
 const g=zoneGrid(),ix=p=>clamp(Math.round((p.x-g.minX)/4),1,g.width-2),iy=p=>clamp(Math.round((p.y-g.minY)/4),1,g.height-2),start=iy(from)*g.width+ix(from),goal=iy(to)*g.width+ix(to),parents=new Int32Array(g.width*g.height).fill(-2),q=[start];parents[start]=-1;let nearest=start,best=Infinity;
 for(let h=0;h<q.length;h++){const i=q[h],x=i%g.width,y=Math.floor(i/g.width),d=Math.abs(x-ix(to))+Math.abs(y-iy(to));if(d<best){best=d;nearest=i;}if(i===goal)break;
 for(const j of [i+1,i-1,i+g.width,i-g.width]){const xx=j%g.width,yy=Math.floor(j/g.width);if(xx<2||xx>=g.width-2||yy<2||yy>=g.height-2||parents[j]!==-2)continue;let blocked=false;for(let dy=-1;dy<=1&&!blocked;dy++)for(let dx=-1;dx<=1;dx++)if(rocks.has(key(g.minX+(xx+dx)*4,g.minY+(yy+dy)*4))){blocked=true;break;}if(!blocked&&nearPortal(V(g.minX+xx*4,g.minY+yy*4),BOT_RULES.portalKeepout))blocked=true;if(!blocked){parents[j]=i;q.push(j);}}
 }
 const path=[];for(let i=nearest;i!==start&&i>=0;i=parents[i])path.push(V(g.minX+i%g.width*4,g.minY+Math.floor(i/g.width)*4));return path.reverse();
}
function tickDungeon(dt){tickBotRespawn(dt);portalCooldown=Math.max(0,portalCooldown-dt);for(const i of worldLoot)i.grace=Math.max(0,(i.grace||0)-dt);mergeTouchingCargo(worldLoot,world);if(!isCombatZone())return;const st=zoneData[zone];
 // ℵ25/ℵ25+: once 80% of the rock is gone, a visible 10-minute countdown starts; then a new seed is rolled.
 if(typeof authoritativeZone!=='function'&&!zoneDef().mission){if(zoneInitialCount>0&&rocks.size<=zoneInitialCount*(1-REGEN.clearFraction))st.regenIn??=REGEN.delaySeconds;if(st.regenIn!=null){st.regenIn-=dt;if(st.regenIn<=0){regenerateZone();return;}}if(ZONE_RESET_SECONDS>0){st.resetIn??=ZONE_RESET_SECONDS;st.resetIn-=dt;if(st.resetIn<=0){regenerateZone();return;}}}if(botsPaused)return;
 const shipSafe=nearPortal(ship.getPosition(),BOT_RULES.portalKeepout);
 for(const bot of allBots())botThink(bot,dt,shipSafe);
}
// One bot's thinking for one tick, aimed at the global `ship` (the zone server points it at each bot's own target).
function botThink(bot,dt,shipSafe){const def=BOT_TYPES[bot.species],p=bot.body.getPosition(),target=ship.getPosition(),dist=shipSafe?Infinity:P.Vec2.distance(p,target);if(def.smart&&!shipSafe)return seekerThink(bot,def,dt,p,target,dist);
  // Portal keep-out: a bot inside it is driven straight back out, and does nothing else.
  const q=nearPortal(p,BOT_RULES.portalKeepout+def.radius);if(q){const away=V(p.x-q.x,p.y-q.y);if(away.length()<.01)away.set(1,0);away.normalize();bot.body.applyForceToCenter(V(away.x*bot.body.getMass()*def.thrust*2.5,away.y*bot.body.getMass()*def.thrust*2.5),true);bot.best=null;bot.path=[];return;}bot.thinkIn=(bot.thinkIn??0)-1;if(bot.thinkIn>0&&bot.best){bot.body.applyForceToCenter(V(bot.best.x*bot.body.getMass()*def.thrust,bot.best.y*bot.body.getMass()*def.thrust),true);botAct(bot,def,p,target,dist,!shipSafe&&(def.ranged&&bot.fire-dt<=0?botSees(p,target):bot.visible),dt);return;}bot.thinkIn=3;const visible=!shipSafe&&botSees(p,target);bot.visible=visible;
 let desired=V(bot.home.x+Math.cos(clock*.3+bot.index)*8-p.x,bot.home.y+Math.sin(clock*.3+bot.index)*8-p.y);
 bot.pathTimer-=dt;if(dist<95&&!visible){if(bot.pathTimer<=0){bot.path=botPath(p,target);bot.pathTimer=2+Math.random();}while(bot.path.length&&P.Vec2.distance(p,bot.path[0])<3)bot.path.shift();if(bot.path.length)desired=V(bot.path[0].x-p.x,bot.path[0].y-p.y);}
 // Shooters hold range and strafe; rammers (ℵ15 contact bots) drive straight in.
 if(dist<75&&visible){desired=V(target.x-p.x,target.y-p.y);if(def.ranged){if(dist<24)desired.neg();else if(dist<38)desired=V(-desired.y,desired.x).mul(bot.index%2?-1:1);}}if(desired.length()>.01)desired.normalize();
 // Local avoidance and separation keep groups from collecting in one pile.
 for(const other of allBots())if(other!==bot){const d=V(p.x-other.body.getPosition().x,p.y-other.body.getPosition().y),len=d.length();if(len<9&&len>.1)desired.add(d.mul((9-len)/len*.18));}if(desired.length()>.01)desired.normalize();
 let best=desired,score=-Infinity;for(let j=-3;j<=3;j++){const a=j*Math.PI/6,d=V(desired.x*Math.cos(a)-desired.y*Math.sin(a),desired.x*Math.sin(a)+desired.y*Math.cos(a));let free=1;world.rayCast(p,V(p.x+d.x*10,p.y+d.y*10),(f,pt,n,t)=>{if(f.getBody()!==bot.body&&f.getBody()!==ship)free=Math.min(free,t);return 1;});const rating=free*3+P.Vec2.dot(d,desired);if(rating>score){score=rating;best=d;}}
 bot.best=best;bot.body.applyForceToCenter(V(best.x*bot.body.getMass()*def.thrust,best.y*bot.body.getMass()*def.thrust),true);botAct(bot,def,p,target,dist,visible,dt);
}
// ---- Seekers: the smart ones -------------------------------------------------------------------------------------
// Seekers hunt as a pack and try to trap the ship in its tunnel. Every second each awake seeker near the ship works
// out the ship's escape route: the shortest way through the tunnels from the ship back out to open space. The
// seeker closest to the ship rams it. The rest go round through the tunnels and park in that escape route, one
// behind another, pushing toward the ship. They are heavy, so a seeker in a tunnel is a plug that has to be shot.
// In open space (no tunnel to block) they surround the ship from different sides instead.
function cellPath(from,to,stopAt){const g=zoneGrid(),W=g.width,H=g.height,ix=p=>clamp(Math.round((p.x-g.minX)/g.cell),1,W-2),iy=p=>clamp(Math.round((p.y-g.minY)/g.cell),1,H-2),start=iy(from)*W+ix(from),goal=to?iy(to)*W+ix(to):-1,parents=new Int32Array(W*H).fill(-2),q=[start];parents[start]=-1;let end=-1;
 for(let h=0;h<q.length&&h<6000;h++){const i=q[h];if(i===goal||stopAt&&h>0&&stopAt(i)){end=i;break;}for(const j of [i+1,i-1,i+W,i-W]){const xx=j%W,yy=(j-xx)/W;if(xx<2||xx>=W-2||yy<2||yy>=H-2||parents[j]!==-2)continue;if(rocks.has(key(g.minX+xx*g.cell,g.minY+yy*g.cell)))continue;parents[j]=i;q.push(j);}}
 if(end<0)return null;const path=[];for(let i=end;i>=0&&i!==start;i=parents[i])path.push(V(g.minX+i%W*g.cell,g.minY+Math.floor(i/W)*g.cell));return path.reverse();}
// The ship's way out: from the ship to the nearest cell that is open by nature (not a tunnel someone dug).
function escapeRoute(target){const g=zoneGrid();if(!g?.block)return null;const route=cellPath(target,null,i=>!g.solid[i]);return route&&route.length>2?route:null;}
function seekerThink(bot,def,dt,p,target,dist){const m=bot.body.getMass();bot.plan=(bot.plan||0)-dt;
 if(bot.plan<=0){bot.plan=.8+Math.random()*.4;
  const pack=allBots().filter(b=>BOT_TYPES[b.species]?.smart&&P.Vec2.distance(b.body.getPosition(),target)<140).sort((a,b)=>P.Vec2.distance(a.body.getPosition(),target)-P.Vec2.distance(b.body.getPosition(),target)),rank=pack.indexOf(bot);
  const e=shipExtents(),reach=Math.max(e.r-e.l,e.b-e.t)/2+def.radius+1,route=rank>0?escapeRoute(target):null;
  if(rank<=0){bot.role='ram';bot.goal=target.clone();}
  else if(route){bot.role='trap';const k=Math.min(route.length-1,Math.max(0,route.findIndex(c=>P.Vec2.distance(c,target)>reach))+(rank-1)*1);bot.goal=route[k].clone();bot.toward=(route[Math.max(0,k-1)]||target).clone();}
  else {bot.role='flank';const a=rank*2.4+bot.index*.37;bot.goal=V(target.x+Math.cos(a)*(reach+2),target.y+Math.sin(a)*(reach+2));}
  bot.path=P.Vec2.distance(p,bot.goal)>5?(cellPath(p,bot.goal)||[]):[];}
 const goal=bot.goal||target;while(bot.path?.length&&P.Vec2.distance(p,bot.path[0])<2.2)bot.path.shift();
 let aim=bot.path?.length?bot.path[0]:goal,desired=V(aim.x-p.x,aim.y-p.y);
 // Parked in the escape route: lean on the ship (or the seeker in front) to keep the plug tight.
 if(bot.role==='trap'&&P.Vec2.distance(p,goal)<2.5){const t=bot.toward||target;desired=V(t.x-p.x,t.y-p.y);bot.body.setLinearDamping(6);}else bot.body.setLinearDamping(2);
 if(desired.length()>.01)desired.normalize();bot.body.applyForceToCenter(V(desired.x*m*def.thrust,desired.y*m*def.thrust),true);
 botAct(bot,def,p,target,dist,true,dt);}
// A bot about to fire re-checks line of sight, so a shot is never based on a stale look from the last plan.
function nearPortal(p,r){if(typeof zonePortals!=='function')return null;for(const q of zonePortals())if(Math.hypot(q.x-p.x,q.y-p.y)<r)return q;return null;}
function botSees(p,target){let visible=true;world.rayCast(p,target,f=>{if(f.getBody().getUserData()?.rockChunk!=null){visible=false;return 0;}return 1;});return visible;}
function botAct(bot,def,p,target,dist,visible,dt){
 if(def.ranged){bot.fire-=dt;if(bot.fire<=0&&dist<70&&dist>7&&visible){const speed=36,time=dist/speed,v=ship.getLinearVelocity(),angle=Math.atan2(target.y+v.y*time-p.y-5*time*time,target.x+v.x*time-p.x),count=def.shots;
  bot.volley=[];for(let n=0;n<count;n++)bot.volley.push({at:n*BOT_RULES.volleyGap,a:angle+(n-(count-1)/2)*(def.spread??.075)+(Math.random()-.5)*.012});bot.volleyClock=0;bot.fire=def.interval+Math.random()*1.5;}
  // Volley shots leave one by one.
  if(bot.volley?.length){bot.volleyClock+=dt;while(bot.volley.length&&bot.volley[0].at<=bot.volleyClock){const {a}=bot.volley.shift(),am=AMMO[def.shotType],n=am?.pellets||1;/* scattershot bots (silver) fire the ammo's pellet spread; each pellet carries a share of the shot */for(let k=0;k<n;k++){const ak=a+(n>1?(k/(n-1)-.5)*(am.spread||.2):0),d=V(Math.cos(ak),Math.sin(ak));enemyShots.push({p:V(p.x,p.y),/* from the centre: the bot itself is skipped, and a big bot hugging a ship must not spawn shots inside its hull */drawFrom:def.radius,v:V(d.x*36,d.y*36),life:n>1?(am.life||.75)*2.5:4,type:def.shotType,damage:n>1?Math.round(def.damage*1.6/n):def.damage,owner:bot.body});}}}}
 else {bot.contactCd=Math.max(0,bot.contactCd-dt);if(bot.contactCd===0&&dist!==Infinity&&botTouchingShip(bot)){if(docked)releaseDock();damageShip(def.contact,ship.getLocalPoint(p));bot.contactCd=def.contactInterval;const away=V(p.x-target.x,p.y-target.y);if(away.length()>.01){away.normalize();bot.body.applyLinearImpulse(V(away.x*bot.body.getMass()*def.knockback,away.y*bot.body.getMass()*def.knockback),bot.body.getWorldCenter(),true);/* rammers shove the ship back too */if(def.shipKnock&&!docked&&ship.getType()==='dynamic')ship.applyLinearImpulse(V(-away.x*ship.getMass()*def.shipKnock,-away.y*ship.getMass()*def.shipKnock),ship.getWorldCenter(),true);}}}
}
function tickCombat(dt){if(!isCombatZone())return;for(const s of enemyShots){s.v.y+=10*dt;const next=V(s.p.x+s.v.x*dt,s.p.y+s.v.y*dt);let hit=null,point=null,fraction=1;world.rayCast(s.p,next,(f,p,n,t)=>{if(f.getBody()===s.owner||s.through&&f.getBody()===ship)return -1;if(t<fraction){hit=f.getBody();point=p;fraction=t;}return t;});if(hit){if(hit===ship){if(docked)releaseDock();const d=s.v.clone();d.normalize();const imp=AMMO[s.type]?.impulse||0;if(imp){ship.applyLinearImpulse(V(d.x*ship.getMass()*5*imp,d.y*ship.getMass()*5*imp),ship.getWorldCenter(),true);if(typeof noteKick==='function')noteKick(d.x*5*imp,d.y*5*imp);}const through=damageShip(s.damage??(AMMO[s.type]||AMMO.ammo).damage,ship.getLocalPoint(point),ship.getLocalVector(d));if(through){s.through=true;s.p=ship.getWorldPoint(through.exit);s.life-=dt;continue;}}s.life=0;}s.p=next;s.life-=dt;}enemyShots=enemyShots.filter(s=>s.life>0);}
function breakShipTile(tile,kind){
 const local=kind==='mount'?mountPoint(tile):V(tile.x,tile.y),p=ship.getWorldPoint(local),v=ship.getLinearVelocity(),out=V(local.x,local.y);if(out.length()<.01)out.set(0,-1);out.normalize();
 // Spawn beyond the shell so loot never starts embedded in the ship.
 const distance=Math.max(Math.abs(bounds.l),Math.abs(bounds.r),Math.abs(bounds.t),Math.abs(bounds.b))+3;const drop=ship.getWorldPoint(V(out.x*distance,out.y*distance));
 const emit=(type,count)=>{if(count>0){const item=addWorldLoot(type,drop,count,V(v.x+out.x*3,v.y+out.y*3));item.grace=2;}};
 if(kind==='hull'){brokenHull.add(key(tile.x,tile.y));delete hullHP[key(tile.x,tile.y)];emit('block',1);rebuildShell();}
 else if(kind==='mount'){emit(mountItem(tile),1);emit(tile.ammoType||'ammo',tile.ammo||0);emit('fuel',tile.fuelItems||0);emit('explosives',tile.explosiveItems||0);ship.destroyFixture(tile.f);mounts.splice(mounts.indexOf(tile),1);}
 else {if(tile.f)interior.destroyFixture(tile.f);if(tile.body)inside.destroyBody(tile.body);blocks.delete(key(tile.x,tile.y));terrain.delete(tile.key||key(tile.x,tile.y));emit(tile.type==='fabricator'?FABRICATORS[fabKind(tile)].item:tile.type||'block',1);for(const [type,count]of Object.entries(tile.materials||{}))emit(type,count);for(const item of tile.cargo||[])emit(item.type,item.count);if(tile.job)for(const [type,count] of Object.entries(recipeNeeds(tile.job.type)||{}))emit(type,count);}
 wakeCargoNear(local,4);actionEffect(local.x,local.y,'red','Broken');
}
// A hit on this ship. With shields up the shot stops at the hull and drains shields. Once critical, shots phase
// through the hull (ℵ26 "bullets will penetrate critical ships") and strike the first tile on their path, whose
// health drops until it breaks; a shot that meets no tile flies out the other side. Called with `dir` (ship-local
// unit vector) for real shots; without it (dev damage, rammers) the tile nearest `point` is hit.
// Returns {exit} (ship-local point) when the shot passed straight through, otherwise null.
function damageShip(amount,point=V(0,0),dir=null){
 if(!Number.isFinite(amount)||amount<=0)return null;
 lastShieldHit=clock;if(shipHP>0){shipHP=Math.max(0,shipHP-amount);if(shipHP===0)toastAll('CRITICAL! Shields down — shots now go through the hull.');return null;}
 const onHull=c=>c.x===bounds.l||c.x===bounds.r||c.y===bounds.t||c.y===bounds.b;
 // The hull itself never breaks, but a hit on it may shrink that side (ℵ28), never below 8×8 (ℵ32).
 const entry={x:clamp(Math.round(point.x),bounds.l,bounds.r),y:clamp(Math.round(point.y),bounds.t,bounds.b)};
 if(onHull(entry)&&Math.random()<CRITICAL.shrinkChance)shrinkFromDamage(entry.x===bounds.l?'left':entry.x===bounds.r?'right':entry.y===bounds.t?'top':'bottom');
 let target=null,kind='tile';
 if(dir&&Number.isFinite(dir.x)&&Number.isFinite(dir.y)&&(dir.x||dir.y)){const d=V(dir.x,dir.y);d.normalize();
  // An attachment sitting where the shot lands takes it first.
  const m=mountHit({x:point.x,y:point.y});if(m){target=m;kind='mount';}
  // Otherwise walk the shot through the ship until it meets a tile or leaves the hull.
  const span=(bounds.r-bounds.l)+(bounds.b-bounds.t)+4;let last=null;
  for(let s=0;!target&&s<=span;s+=.1){const p={x:point.x+d.x*s,y:point.y+d.y*s},c={x:Math.round(p.x),y:Math.round(p.y)};
   if(p.x<bounds.l-.6||p.x>bounds.r+.6||p.y<bounds.t-.6||p.y>bounds.b+.6){if(s>1){critCargoHit(V(point.x+d.x*s/2,point.y+d.y*s/2));return {exit:V(p.x,p.y)};}continue;}
   const k=key(c.x,c.y);if(k===last)continue;last=k;if(onHull(c))continue;
   target=blocks.get(k)||terrainAt(c)||null;}
 }else{
  const candidates=[...blocks.values()].map(t=>({t,kind:'tile',p:V(t.x,t.y)}));for(const t of terrain.values())candidates.push({t,kind:'tile',p:V(t.x,t.y)});for(const t of mounts)candidates.push({t,kind:'mount',p:mountPoint(t)});
  candidates.sort((a,b)=>P.Vec2.distance(a.p,point)-P.Vec2.distance(b.p,point));if(candidates[0]){target=candidates[0].t;kind=candidates[0].kind;}}
 critCargoHit(dir&&target?(kind==='mount'?mountPoint(target):V(target.x,target.y)):point);
 if(!target)return null;
 // Starter items are never destroyed or ejected by bullets (ℵ26); they soak the hit.
 if(isStarterTile(target))return null;
 target.hp=Math.max(0,(target.hp??100)-amount*TILE_DAMAGE_FACTOR);target.hitAt=clock;if(target.hp===0)breakShipTile(target,kind);
 return null;
}
// Remove one row/column from `side`. Tiles in the strip are broken off (ejected as loot), loose cargo and crew
// are moved inward. Refused (no shrink) at the 8×8 minimum or when the strip holds the helm or a starter item.
function shrinkFromDamage(side){const nb={...bounds},prop={left:'l',right:'r',top:'t',bottom:'b'}[side],dir=['left','top'].includes(side)?1:-1;nb[prop]+=dir;
 if(nb.r-nb.l+1<CRITICAL.minSize||nb.b-nb.t+1<CRITICAL.minSize)return false;
 const axis=['left','right'].includes(side)?'x':'y',line=nb[prop],inStrip=c=>dir>0?c[axis]<=line:c[axis]>=line;
 const tiles=[...blocks.values(),...terrain.values()].filter(t=>(t.type==='fabricator'?terrainCells(t):[t]).some(inStrip));
 if(helmCells().some(inStrip)||tiles.some(isStarterTile))return false;
 // Attachments the new corner would cut off slide inward along their side when there is room (so a starter
 // ship's corner thrusters ride along); the rest break off — unless they are starter items, which block the shrink.
 const oldBounds={...bounds};bounds=nb;const moved=[],lost=[];for(const m of mounts){if(mountValid(m,nb,m))continue;const at0=m.at;let ok=false;for(const d of [1,-1,2,-2]){m.at=at0+d;if(mountValid(m,nb,m)){ok=true;break;}}if(ok)moved.push([m,at0]);else{m.at=at0;lost.push(m);}}bounds=oldBounds;
 if(lost.some(isStarterTile)){for(const [m,at0] of moved)m.at=at0;return false;}
 for(const t of tiles)breakShipTile(t,'tile');for(const m of lost)breakShipTile(m,'mount');
 bounds=nb;rebuildShell();rebuildMounts();
 const inward=b=>{const p=b.getPosition(),q={x:clamp(p.x,nb.l+.6,nb.r-.6),y:clamp(p.y,nb.t+.75,nb.b-.75)};if(q.x!==p.x||q.y!==p.y){b.setTransform(V(q.x,q.y),b.getAngle());b.setAwake(true);}};
 for(const i of items)inward(i.body);for(const b of boxes)inward(b.body);if(typeof crew!=='undefined'&&crew.size){for(const m of crew.values())inward(m.player);}else if(player)inward(player);
 updateShipMass();if(docked)snapDock(docked.side);actionEffect((nb.l+nb.r)/2,(nb.t+nb.b)/2,'red','Hull shrunk');toastAll('The hull was shot down to '+(nb.r-nb.l+1)+'×'+(nb.b-nb.t+1)+'.');save(true);return true;}
// Loose cargo inside a critical ship: shots that land near it knock it around, and stacks right at the hit are
// blown out through the hull as world loot (never deleted; starter items stay).
function critCargoHit(point){const R=CRITICAL.cargoKickRadius,ejected=[];
 for(const list of [items,boxes])for(const it of list){const p=it.body.getPosition(),d=V(p.x-point.x,p.y-point.y),len=d.length();if(len>R)continue;
  if(list===items&&len<CRITICAL.cargoEjectRadius&&!STARTER_ITEMS.includes(it.type)){ejected.push(it);continue;}
  if(len<.05)d.set(0,-1);else d.mul(1/len);const k=it.body.getMass()*CRITICAL.cargoKick*(1-len/R);wakeCargo(it.body);it.body.applyLinearImpulse(V(d.x*k,d.y*k),it.body.getWorldCenter(),true);}
 for(const it of ejected){const out=V(point.x,point.y);if(out.length()<.01)out.set(0,-1);out.normalize();const far=Math.max(Math.abs(bounds.l),Math.abs(bounds.r),Math.abs(bounds.t),Math.abs(bounds.b))+3,v=ship.getLinearVelocity();addWorldLoot(it.type,ship.getWorldPoint(V(out.x*far,out.y*far)),it.count,V(v.x+out.x*3,v.y+out.y*3)).grace=2;inside.destroyBody(it.body);items.splice(items.indexOf(it),1);}
 if(ejected.length)toastAll(ejected.length===1?'A loose stack was blown out of the hull!':ejected.length+' loose stacks were blown out of the hull!');}

function repairAt(c){const t=blocks.get(key(c.x,c.y))||terrainAt(c)||mountHit(c),k=key(c.x,c.y),hull=Object.hasOwn(hullHP,k);if((!t&&!hull)||P.Vec2.distance(localPlayer(),V(c.x,c.y))>4||buildBlocked(c,t?.f))return toast('Aim at a reachable damaged tile.');const hp=hull?hullHP[k]:t.hp??100;if(hp>=100)return toast('Tile is already repaired.');if(!inventory.iron)return toast('Repair costs 1 Iron.');inventory.iron--;if(hull)hullHP[k]=Math.min(100,hp+25);else t.hp=Math.min(100,hp+25);actionEffect(c.x,c.y,'blue','Repaired');save(true);}

function useBooster(){if(piloting||!inventory.booster)return;if(buildJob)return toast('Already using an item.');if(boosterLeft>0)return toast('A shield booster is already charging ('+Math.ceil(boosterLeft)+' s).');if(shipHP>=shipMaxHP())return toast('Shields are full.');const p=localPlayer();buildJob={c:{x:Math.round(p.x),y:Math.round(p.y)},type:'booster',rotation:buildRotation,elapsed:0,duration:SHIELDS.boosterUseSeconds,label:'Boosting shields'};}
function applyBooster(){if(!inventory.booster)return;const max=shipMaxHP();if(shipHP>=max)return toast('Shields are full.');if(boosterLeft>0)return toast('A shield booster is already charging.');inventory.booster--;boosterLeft=boosterTotal=SHIELDS.boosterChargeSeconds;actionEffect(localPlayer().x,localPlayer().y,'blue','Shield booster charging');save(true);}
// A charging booster heals the ship when its charge completes.
function tickBooster(dt){if(!(boosterLeft>0))return;boosterLeft=Math.max(0,boosterLeft-dt);if(boosterLeft>0)return;const max=shipMaxHP(),before=shipHP;shipHP=Math.min(max,shipHP+SHIELDS.boosterAmount);toastAll('Shield booster: shields +'+Math.round(shipHP-before)+'.');}
// Passive shield regeneration (ℵ10+: a constant amount per second), paused briefly after each hit and much
// faster in safe zones, so ships always refill at Freeport.
function tickShields(dt){tickBooster(dt);const max=shipMaxHP();if(shipHP>max)shipHP=max;if(shipHP>=max)return;const safe=zoneDef().kind==='safe';if(!safe&&clock-lastShieldHit<SHIELDS.regenDelay)return;shipHP=Math.min(max,shipHP+SHIELDS.regenPerSecond*(safe?SHIELDS.safeZoneMultiplier:1)*dt);}
