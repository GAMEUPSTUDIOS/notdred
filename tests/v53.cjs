'use strict';
// v53: dev menu modes (host token only) — noclip flight, sandbox build mode (instant, uses no items), ship noclip.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..');process.chdir(root);
const {createRoom}=require('../server/room.cjs'),{ZoneBus}=require('../server/zone-bus.cjs');
const r={id:'D'};r.game=createRoom(null,{});r.game.join('a','Admin',true,'captain');r.game.join('p','Plain',false,'crew');const run=r.game.run,step=n=>{for(let i=0;i<n;i++)r.game.tick(1/60);};
const dev=(id,op)=>r.game.command(id,{action:'dev',op});
// Only admins (host token) can toggle them.
dev('p','noclip');assert.equal(r.game.snapshot('p').self.noclip,false,'not without the token');
// Noclip: flies (no gravity) and passes through the hull wall.
dev('a','noclip');assert.equal(r.game.snapshot('a').self.noclip,true);const wallX=run('bounds.r');
run('bindCrew("a");player.setTransform(V(0,0),0);storeCrew();');r.game.command('a',{action:'input',keys:{d:true}});step(90);
const p=run('(bindCrew("a"),(p=>({x:p.x,y:p.y}))(player.getPosition()))');assert.ok(p.x>wallX+.5,'flew through the wall ('+p.x.toFixed(1)+' > '+wallX+')');assert.ok(Math.abs(p.y)<.3,'no falling');
dev('a','noclip');r.game.command('a',{action:'input',keys:{}});run('bindCrew("a");player.setTransform(V(0,0),0);storeCrew();');step(60);
assert.ok(run('(bindCrew("a"),player.getPosition().y)')>.5,'gravity back once off');assert.notEqual(run('(bindCrew("a"),player.getFixtureList().getFilterMaskBits())'),0,'collides again');
// Sandbox: building is instant and the item isn't used up.
dev('a','sandbox');assert.equal(r.game.snapshot('a').self.sandbox,true);
run('bindCrew("a");player.setTransform(V(0,bounds.b-1),0);storeCrew();');const c={x:0,y:-1};
r.game.command('a',{action:'dev',op:'give',item:'block',count:16});const n0=run('(bindCrew("a"),stackCounts[slots.indexOf("block")])');r.game.command('a',{action:'select',slot:run('(bindCrew("a"),slots.indexOf("block"))'),aim:run(`(q=>({x:q.x,y:q.y}))(ship.getWorldPoint(V(${c.x},${c.y})))`)});
r.game.command('a',{action:'edit',aim:run(`(q=>({x:q.x,y:q.y}))(ship.getWorldPoint(V(${c.x},${c.y})))`)});step(2);
assert.ok(run(`blocks.has(key(${c.x},${c.y}))`),'built at once');assert.equal(run('(bindCrew("a"),stackCounts[slots.indexOf("block")])'),n0,'no block used');
// Ship noclip: reported in the exterior and the zone hull stops colliding.
dev('a','shipnoclip');assert.equal(r.game.zone.exterior().noclip,true);assert.equal(r.game.snapshot('a').self.shipNoclip,true);
{const bus=new ZoneBus(),R2={id:'S',name:'S'};R2.game=createRoom(null,bus.hooksFor(R2));R2.game.join('s','S',true,'captain');const rooms=[R2];
 for(let i=0;i<5;i++){R2.game.tick(1/60);bus.step(rooms,1/60);}R2.game.command('s',{action:'dev',op:'shipnoclip'});for(let i=0;i<5;i++){R2.game.tick(1/60);bus.step(rooms,1/60);}
 const sim=[...bus.sims.values()].find(s=>s.api.fleet.has('S'));assert.equal(sim.api.fleet.get('S').body.getFixtureList().getFilterMaskBits(),0,'zone hull collides with nothing');
 R2.game.command('s',{action:'dev',op:'shipnoclip'});for(let i=0;i<3;i++){R2.game.tick(1/60);bus.step(rooms,1/60);}assert.equal(sim.api.fleet.get('S').body.getFixtureList().getFilterMaskBits(),0xffff,'and collides again');}
// The menu: searchable icon grid with history and the three toggles.
const ui=fs.readFileSync('dist/interface.js','utf8');for(const id of ['devsearch','devclear','devgrid','devhistory'])assert.ok(ui.includes('id="'+id+'"'),id);for(const f of ['noclip','sandbox','shipnoclip'])assert.ok(ui.includes('data-dev="'+f+'"'),f);
console.log('PASS: dev menu — give-item grid with search and history; noclip flight, sandbox build mode, ship noclip (host token only).');
process.exit(0);
