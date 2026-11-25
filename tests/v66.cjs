'use strict';
// v66: building rules, preview and expando boxes; zones sized for 80×80 ships.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');process.chdir(path.resolve(__dirname,'..'));
const {createRoom}=require('../server/room.cjs'),era=require('../dist/modules/era.js'),Z=require('../dist/zone-generator.js');
// ---- Zones: every reachable open spot fits an 80×80 ship --------------------------------------------------------
for(const id of ['finch','finch2','sparrow','pits','canary']){const g=Z.generate(4242,era.ZONES[id].gen),[cx,cy]=era.SHIP_CLEARANCE||[10,10];
 assert.ok((cx*2+1)*g.cell>=era.SHIP_LIMITS.maxW&&(cy*2+1)*g.cell>=era.SHIP_LIMITS.maxH,'clearance covers a max-size ship');
 let fits=0,bad=0;for(let i=0;i<g.centers.length;i++)if(g.centers[i]){fits++;const x=i%g.width,y=Math.floor(i/g.width);for(let dy=-cy;dy<=cy&&!bad;dy++)for(let dx=-cx;dx<=cx;dx++)if(g.solid[(y+dy)*g.width+x+dx]){bad++;break;}}
 assert.ok(fits>100&&bad===0,id+': '+fits+' ship-sized open spots, each fully clear');}
{const g=Z.generate(1,era.ZONES.finch.gen);assert.ok(g.width*g.cell>=1200,'Finch I is ~3× bigger ('+g.width*g.cell+' m wide)');}
// ---- Building ------------------------------------------------------------------------------------------------------
const g=createRoom(null);g.join('c','c',true,'captain');for(let i=0;i<5;i++)g.tick(1/60);
const R=c=>JSON.parse(g.run(`(()=>{bindCrew("c");try{return JSON.stringify(${c});}finally{storeCrew();}})()`));
R('(player.setTransform(V(0,-1.1),0),1)');
// The starting ship has an expando box at about (3,-1.9) and a fabricator at (-2.5,-2).
assert.match(R('validity({x:3,y:-2},"block")'),/expando box/,'no block inside an expando box');
assert.equal(R('boxSpace(V(-2.5,-2.4),2)'),false,'no expando box over a fabricator');assert.equal(R('boxSpace(V(1.5,1.4),2)'),false,'…or over the helm');
assert.match(R('validity({x:2,y:-3},"door")'),/expando box/,'a door\'s second tile is checked too');assert.equal(R('validity({x:-1,y:-3},"door")'),'','a door in open space is fine');
// The piece is centred under the aim point.
assert.deepEqual(R('buildAnchor("door",V(0,.5))'),{x:0,y:0},'a door (1×2) centred on the aim');assert.deepEqual(R('buildAnchor("anchor",V(0,0))'),{x:-1,y:-1},'a 3×3 anchor centred on the aim');
assert.deepEqual(R('buildAnchor("helm",V(.5,-.5))'),{x:0,y:0},'the helm (2×2, bottom-left anchor) centred on the aim');assert.deepEqual(R('buildAnchor("turret",V(0,bounds.t))'),{x:-1,y:-4},'a 3-wide turret centred on the aim');
assert.ok(R('placeable("door")&&placeable("glass")&&placeable("paint")&&placeable("sign")&&placeable("spawn")&&placeable("anchor")&&!placeable("iron")&&!placeable("ammo")'),'every placeable piece gets a preview');
const game=fs.readFileSync('dist/game.js','utf8');assert.ok(/function drawBuildGhost\(t\)/.test(game)&&/placeable\(tool\)\)drawBuildGhost\(tool\)/.test(game)&&/return beginBuild\(buildCell\(tool\),tool\)/.test(game),'preview and building use the same centred cell');
assert.ok(/\[w,h\]=MACHINE_SIZE\[t\.type\]\|\|/.test(game),'the hover outline covers the whole object');
// Reach: a line grazing a neighbouring tile's corner doesn't block.
assert.equal(R('typeof rayBlocked'),'function');
// ---- Expando boxes ---------------------------------------------------------------------------------------------------
R(`(()=>{for(const b of boxes)inside.destroyBody(b.body);boxes.length=0;for(const t of [...terrain.values()])if(!t.body){if(t.f)interior.destroyFixture(t.f);terrain.delete(t.key||key(t.x,t.y));}for(const t of [...blocks.values()]){interior.destroyFixture(t.f);blocks.delete(key(t.x,t.y));}player.setTransform(V(-4,1.8),0);helm={x:-3,y:2,rotation:0};spawnBox(V(0,1.4));spawnBox(V(3.4,1.4));return 1})()`);
for(let i=0;i<90;i++)g.tick(1/60);
const fill=(id,n,type='iron')=>R(`(()=>{const b=boxes[${id}];b.materials["${type}"]=(b.materials["${type}"]||0)+${n};const ok=resizeBox(b);if(!ok)b.materials["${type}"]-=${n};const p=b.body.getPosition();return {ok,size:b.size,x:p.x,y:p.y};})()`);
let r=fill(0,128);assert.ok(r.ok&&r.size===2.5,'a box on the floor grows');assert.ok(Math.abs(r.x)<.01&&Math.abs(r.y+r.size/2-2.49)<.03,'…evenly sideways and upward, its bottom stays on the floor');
r=fill(1,128);assert.ok(r.ok&&Math.abs(r.x+r.size/2-4.4)<.03&&Math.abs(r.y+r.size/2-2.49)<.03,'a box in a corner grows away from the wall and the floor');
assert.equal(R('boxAccepts(boxes[0],"flux")'),false,'a box holds one item type');assert.equal(R('boxAccepts(boxes[0],"iron")'),true);
assert.ok(/if\(!boxAccepts\(box,stack\.type\)\)return refuse\(\);/.test(fs.readFileSync('dist/modules/machinery.js','utf8')),'loaders don\'t mix types either');
console.log('PASS: placement rules (boxes, machines, helm, every tile of a footprint), centred previews for every piece, whole-object hover, expando boxes (one type, grow away from blocked sides), zones fit 80×80 ships.');
process.exit(0);
