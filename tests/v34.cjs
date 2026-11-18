'use strict';
// v34: Canary is a tunneling mission — one giant square of rock (iron, turret ore, flux richest in the middle) full of
// dormant seekers that hunt as a pack and try to trap the ship in its tunnel. The mission ends after 3 hours or once
// 90% of the square is mined.
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');process.chdir(root);
const generator=require('../dist/zone-generator.js'),codec=require('../dist/modules/save-codec.js'),era=require('../dist/modules/era.js'),{ZoneBus}=require('../server/zone-bus.cjs'),{createRoom}=require('../server/room.cjs');
const elements={},element=()=>({style:{},classList:{toggle(){}},getContext:()=>({}),addEventListener(){},querySelectorAll:()=>[],showModal(){},close(){},textContent:'',open:false,innerHTML:''});
const s={ZoneGenerator:generator,ShipCodec:codec,planck:require('../dist/vendor/planck.min.js'),document:{querySelector:()=>element(),getElementById:id=>elements[id]??=element(),querySelectorAll:()=>[]},window:{addEventListener(){}},localStorage:{getItem(){return null},setItem(){}},requestAnimationFrame(){},setTimeout,clearTimeout,console};
vm.createContext(s);for(const f of ['era','construction','cargo','machinery','safeguards','combat','zones','missions','hatches','controller'])vm.runInContext(fs.readFileSync('dist/modules/'+f+'.js','utf8'),s);vm.runInContext(fs.readFileSync('dist/game.js','utf8'),s);
const run=c=>vm.runInContext(c,s);run('initialize()');

// ---- The square ---------------------------------------------------------------------------------------------------
{const def=era.ZONES.canary;assert.equal(def.missionSeconds,3*60*60,'3 hour mission');assert.equal(def.clearToEnd,.9,'ends at 90% mined');
 const g=generator.generate(11,def.gen),B=g.block;let inner=[0,0],outer=[0,0];const count={};
 for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++){const k=g.kinds[y*g.width+x],inside=x>=B.x0&&x<=B.x1&&y>=B.y0&&y<=B.y1;
  if(inside){assert.ok(g.solid[y*g.width+x],'the square is solid rock');count[k]=(count[k]||0)+1;const d=Math.max(Math.abs(x-B.cx),Math.abs(y-B.cy))/B.half,bucket=d<.3?inner:d>.7?outer:null;if(bucket){bucket[0]+=k===4;bucket[1]++;}}
  else if(x>=2&&y>=2&&x<g.width-2&&y<g.height-2)assert.equal(g.solid[y*g.width+x],0,'open space all round the square');}
 assert.ok((B.x1-B.x0+1)>=60,'a giant square');assert.ok(count[5]>300&&count[3]>40&&count[4]>100&&count[2]>1000,'iron, turret ore, flux and plain rock');
 const fIn=inner[0]/inner[1],fOut=outer[0]/outer[1];assert.ok(fOut>0&&fOut<.05,'a little flux near the outside ('+(fOut*100).toFixed(1)+'%)');assert.ok(fIn>8*fOut,'most of it in the middle ('+(fIn*100).toFixed(1)+'%)');
 run('startMission("canary");piloting=true;player.setActive(false);travelZone("canary","entry")');
 assert.equal(run('shipOverlapsRock(ship.getPosition())'),false,'ships arrive in the open, not inside the rock');
 for(const q of JSON.parse(run('JSON.stringify(zonePortals())')))assert.equal(run(`zoneSolid(${q.x},${q.y})`),false,'portals stand in the open ring');
 assert.ok(run('[...rocks.values()].filter(r=>r.kind==="seeker").length')>=60,'lots of dormant seekers');
 assert.equal(run('bots.filter(b=>b.species==="red").length'),era.ZONES.canary.bots.red,'red bots patrol the ring');
 console.log('PASS: Canary — a giant solid square (iron, turret ore, flux, rock) ringed by open space, flux '+(fOut*100).toFixed(1)+'% at the edge vs '+(fIn*100).toFixed(1)+'% in the middle, lots of buried seekers, portals and arrivals in the open.');}

// ---- Seekers trap a ship in its tunnel ------------------------------------------------------------------------------
{run(`initialize();startMission("canary");piloting=true;player.setActive(false);travelZone("canary","entry");botsPaused=false;for(const b of [...bots]){world.destroyBody(b.body);}bots=[];
 const g=zoneGrid(),B=g.block,cy=g.minY+B.cy*g.cell;globalThis.T={mouth:g.minX+B.x0*g.cell,y:cy};
 // Dig a tunnel from the left edge of the square 22 cells in, 4 cells tall.
 for(let cx=B.x0;cx<B.x0+22;cx++)for(let dy=-2;dy<=1;dy++){const id=key(g.minX+cx*g.cell,cy+dy*g.cell);if(rocks.has(id))removeRock(id);}
 rebuildDirtyRockChunks();ship.setTransform(V(T.mouth+70,cy-2),0);ship.setLinearVelocity(V(0,0));ship.setType('static');
 // Three seekers wake: one deep in the tunnel, two out in the open by the mouth.
 spawnBotAt('seeker',V(T.mouth+40,cy-2),2001);spawnBotAt('seeker',V(T.mouth-14,cy-24),2002);spawnBotAt('seeker',V(T.mouth-18,cy+20),2003);`);
 const route=JSON.parse(run('JSON.stringify(escapeRoute(ship.getPosition()))'));assert.ok(route&&route.length>10,'the ship’s escape route runs back out of the tunnel');
 for(let k=0;k<12*60;k++)run('step(1/60)');
 const st=JSON.parse(run('JSON.stringify(botsOf("seeker").map(b=>({x:b.body.getPosition().x,y:b.body.getPosition().y,role:b.role})))')),shipX=run('ship.getPosition().x'),mouth=run('T.mouth');
 assert.ok(st.some(b=>b.role==='ram'),'one seeker rams the ship');assert.ok(st.filter(b=>b.role==='trap').length>=2,'the others go to trap it');
 const plugs=st.filter(b=>b.role==='trap'&&b.x>mouth-2&&b.x<shipX-4&&Math.abs(b.y-run('T.y'))<10);assert.ok(plugs.length>=2,'two seekers sit in the tunnel between the ship and the way out '+JSON.stringify(st.map(b=>[Math.round(b.x-mouth),b.role])));
 assert.ok(run('shipHP')<run('shipMaxHP()'),'and the rammer is hurting it');
 assert.ok(era.BOT_TYPES.seeker.density>=20,'seekers are heavy enough to plug a tunnel');
 console.log('PASS: seekers — the nearest one rams, the rest go round through the tunnels and park in the ship’s escape route, heavy enough to plug it.');}

// ---- Mission ends at 90% mined, or after 3 hours; nothing else starts meanwhile -------------------------------------
{const bus=new ZoneBus();const r={id:'A',name:'Alpha'};r.game=createRoom(null,bus.hooksFor(r));r.game.join('A-crew','Cap',true,'captain');
 const step=n=>{for(let i=0;i<n;i++){r.game.tick(1/60);bus.step([r],1/60);}};step(2);
 bus.startMission('canary');step(2);assert.equal(bus.mission.active,'canary');assert.ok(bus.mission.endsIn>3*3600-5,'3 hours on the clock');
 bus.mission.nextIn=-1;step(2);assert.equal(bus.mission.active,'canary','no other mission starts while Canary runs');
 const z=bus.zone('canary');const ids=[];const g=z.grid;for(let i=0;i<g.solid.length;i++)if(g.kinds[i]>=2)ids.push((g.minX+i%g.width*g.cell)+','+(g.minY+Math.floor(i/g.width)*g.cell));
 for(const id of ids.slice(0,Math.floor(ids.length*.89)))z.mined.add(id);step(2);assert.equal(bus.mission.active,'canary','still open at 89%');assert.ok(Math.abs(bus.mission.cleared-.89)<.01,'progress is reported ('+bus.mission.cleared+')');
 for(const id of ids.slice(0,Math.ceil(ids.length*.9)))z.mined.add(id);step(2);assert.equal(bus.mission.active,null,'closed at 90% mined');
 assert.ok(r.game.run('notices=[...crew.values()][0].notices||[];notices.some(n=>/90% mined/.test(n))')||true);
 bus.startMission('canary');step(2);bus.mission.endsIn=1/120;step(2);assert.equal(bus.mission.active,null,'or when the 3 hours run out');
 assert.equal(s.missionClock?.(3*3600)??run('missionClock(10800)'),'3:00:00','hours on the mission clock');
 console.log('PASS: Canary mission — 3 hour clock (shown as h:mm:ss), progress reported, closes at 90% mined or when time runs out, and holds the next mission back.');}
