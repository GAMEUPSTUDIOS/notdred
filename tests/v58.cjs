'use strict';
// v58: smooth ship motion and punch.
//  * A crewmate (not piloting) and other ships are drawn on the server's tick timeline (netClock + makeTrack: cubic
//    Hermite between snapshots, a little behind real time) instead of chasing a jittery extrapolated target.
//  * Punch/yank rounds from bots knock the ship in the shared zone; the knock reaches the room as shipKick, which goes
//    to each crew member so the pilot's predicted ship takes it at once.
//  * Player punch rounds shove bots hard (BOT_PUNCH), yank pulls them back.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');process.chdir(root);
const {createRoom}=require('../server/room.cjs'),{ZoneBus}=require('../server/zone-bus.cjs');
// Interpolation track (pure functions out of network.js).
{const src=fs.readFileSync('dist/network.js','utf8'),i=src.indexOf('function makeTrack(){'),end=src.indexOf('const shipTrack=');
 const makeTrack=new Function(src.slice(i,end)+';return makeTrack;')();const t=makeTrack();
 for(let k=0;k<6;k++)t.push(k*3,{x:k*3/60*10,y:0},{x:10,y:0}); // 10 m/s, a snapshot every 3 ticks
 for(const rt of [.06,.075,.1,.11]){const q=t.sample(rt);assert.ok(Math.abs(q.x-rt*10)<1e-6&&Math.abs(q.vx-10)<1e-6,'Hermite on a straight line at '+rt);}
 const q=t.sample(.3);assert.ok(q&&q.x>2.4&&q.x<=0.25*10+.2*10+1e-6,'a little extrapolation past the newest snapshot only');
 assert.ok(/shipTrack\.sample\(netClock\.renderTime\(now\)\)/.test(src)&&/otherTracks\.get\(o\.id\)\?\.sample/.test(src),'crew view and other ships use the tracks');
 assert.ok(/s\.kick\.n>netKick\.n&&s\.self\?\.piloting/.test(src),'the pilot applies new knocks at once');}
const bus=new ZoneBus(),rooms=[];const mk=id=>{const r={id,name:id};r.game=createRoom(null,bus.hooksFor(r));r.game.join(id+'c',id,true,'captain');rooms.push(r);return r;};
const step=n=>{for(let i=0;i<n;i++){for(const r of rooms)r.game.tick(1/60);bus.step(rooms,1/60);}};
const A=mk('A');step(5);A.game.run('piloting=true;player.setActive(false);travelZone("sparrow","entry")');step(20);
const sim=[...bus.sims.values()].find(s=>s.api.fleet.has('A'));assert.ok(sim,'ship is in the shared zone');
const p=sim.api.zsShip('A'),kick=()=>JSON.parse(A.game.run('JSON.stringify(shipKick)'));
for(const [type,knocked] of [['ammo',false],['punch',true]]){sim.api.zsPlaceShip('A',{x:p.x,y:p.y,vx:0,vy:0});step(1);const a=sim.api.zsShip('A'),n=kick().n;
 sim.run(`enemyShots.push({type:"${type}",p:V(${a.x-15},${a.y}),v:V(80,0),life:2,damage:20})`);step(10);const vx=Number(A.game.run('ship.getLinearVelocity().x'));
 assert.equal(vx>3,knocked,type+' from a bot '+(knocked?'knocks':'does not knock')+' the ship ('+vx.toFixed(2)+')');assert.equal(kick().n>n,knocked,type+': knock sent to the crew');}
const own=JSON.parse(JSON.stringify(A.game.run('snapshotOwn("Ac",snapshotShared())')));assert.ok(own.kick&&own.kick.n>=1,'crew snapshot carries the knock');
for(const [type,sign] of [['ammo',0],['punch',1],['yank',-1]]){const vx=Number(sim.run(`(()=>{const b=allBots().find(b=>b.species==="green");globalThis._b=b;b.body.setLinearVelocity(V(0,0));const q=b.body.getPosition();zsFire("A",[{type:"${type}",p:{x:q.x-12,y:q.y},v:{x:90,y:0},life:2,maxLife:2,bounces:0}]);return 0;})()`));
 step(10);const v=Number(sim.run('_b.body.getLinearVelocity().x'));if(sign>0)assert.ok(v>15,'punch shoves a bot ('+v.toFixed(1)+')');else if(sign<0)assert.ok(v<-10,'yank pulls a bot ('+v.toFixed(1)+')');else assert.ok(Math.abs(v)<5,'standard ammo barely moves a bot');}
// Slug ammo: heavy, very slow, mines rock in two; breaker still breaks a tile in one and has its own icon.
{const era=require('../dist/modules/era.js'),S=era.AMMO.slug,hit=(S.mine*era.WORLD_DAMAGE_SCALE);
 assert.ok(S&&S.damage>=4*era.AMMO.ammo.damage&&S.speed<era.AMMO.ammo.speed/2,'slug hits hard and flies slowly');
 assert.ok(hit<era.WORLD_TILE_HP.rock&&2*hit>=era.WORLD_TILE_HP.rock,'slug mines a rock tile in exactly two hits');
 assert.ok(era.AMMO.breaker.rockBreaker,'breaker kept: one hit per tile');
 assert.ok(era.FABRICATORS?Object.values(era.FABRICATORS).some(f=>f.recipes?.includes('slug')):/'breaker', 'slug'/.test(fs.readFileSync('dist/modules/era.js','utf8')),'munitions fabricator makes slug');
 const g=fs.readFileSync('dist/game.js','utf8');assert.ok(/slug:\['item-ammo_slug'\]/.test(g)&&/breaker:\['item-ammo_b_slug'\]/.test(g)&&fs.existsSync('dist/sprites/item-ammo_slug.png')&&fs.existsSync('dist/sprites/item-ammo_b_slug.png'),'slug and breaker icons from the game art');
 assert.ok(/'breaker','slug','trash'/.test(g)&&/'breaker','slug','trash'/.test(fs.readFileSync('dist/modules/save-codec.js','utf8')),'slug is an item that saves');
 const bot=JSON.parse(sim.run(`(()=>{const b=allBots().find(b=>b.species==="green");const q=b.body.getPosition();const hp=b.hp;zsFire("A",[{type:"slug",p:{x:q.x-12,y:q.y},v:{x:38,y:0},life:4.5,maxLife:4.5,bounces:0}]);globalThis._s=b;return JSON.stringify({hp});})()`));
 step(40);assert.equal(bot.hp-Number(sim.run('_s.hp')),S.damage,'a slug round hits a bot for its full damage');}
console.log('v58 PASS');process.exit(0);
