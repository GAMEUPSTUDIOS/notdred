/* Pure deterministic grid generator: shared by browser and a future authority server. */
(function(root){
'use strict';
// The Pits ("Buried treasure"): a big hazard-walled hall at the top (portals, LOOT signs) and, below it, three
// separate holes. Each hole has its own loot room at the bottom (diamond turret ore, flux crystal blocks, and rock
// where treasure blocks appear) and they fan out as they rise to the hall. The zone fills them with boulders of many
// sizes. kinds: 0 open, 1 hazard wall (indestructible), 2 rock, 3 ore, 4 flux.
function generatePit(seed=0,opts={}){
 const width=opts.width||61,height=opts.height||75,cell=4,minX=-((width-1)/2)*cell,minY=-((height-1)/2)*cell,N=width*height,cx=(width-1)/2,cy=(height-1)/2;
 const hash=(x,y)=>{let h=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul((seed+(opts.salt|0))|0,1442695041);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;};
 const index=(x,y)=>y*width+x,solid=new Uint8Array(N).fill(1),centers=new Uint8Array(N),kinds=new Uint8Array(N).fill(1);
 const open=(x,y)=>{if(x<2||y<2||x>=width-2||y>=height-2)return;solid[index(x,y)]=0;kinds[index(x,y)]=0;};
 const hall={y0:cy-10,y1:cy+4,x0:3,x1:width-4},band={y0:height-5,y1:height-3};
 for(let y=hall.y0;y<=hall.y1;y++)for(let x=hall.x0;x<=hall.x1;x++)open(x,y);
 // Hole centres: `low` cells apart at the loot rooms, `spread` cells apart where they open into the hall.
 const low=11,spread=18+Math.floor(hash(3,4)*3),top=hall.y1+1,bottom=height-9,roomHalf=3;
 const holes=[-1,0,1].map(k=>({k,bottomX:cx+k*low,topX:cx+k*spread}));
 for(let y=top;y<=bottom;y++){const t=(bottom-y)/(bottom-top),w=6+t*4;for(const h of holes){const xc=h.bottomX+(h.topX-h.bottomX)*t;for(let x=Math.floor(xc-w/2);x<=Math.ceil(xc+w/2);x++)if(Math.abs(x-xc)<=w/2)open(x,y);}}
 const rooms=holes.map(h=>{const r={x0:h.bottomX-roomHalf,x1:h.bottomX+roomHalf,y0:bottom,y1:height-6};for(let y=r.y0;y<=r.y1;y++)for(let x=r.x0;x<=r.x1;x++)open(x,y);
  // Each hole's own loot under its room: ore and flux on top, rock beneath (treasure blocks turn up in the rock).
  for(let y=band.y0;y<=band.y1;y++)for(let x=r.x0;x<=r.x1;x++)kinds[index(x,y)]=y===band.y1?2:hash(x,y)<.55?3:4;return r;});
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){let fits=true;for(let dy=-2;dy<=2&&fits;dy++)for(let dx=-3;dx<=3;dx++){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=width||yy>=height||solid[index(xx,yy)]){fits=false;break;}}if(fits)centers[index(x,y)]=1;}
 const start=index(cx,cy),signs=holes.map(h=>({x:minX+h.topX*cell,y:minY+(hall.y1-2)*cell}));
 const room={x0:rooms[0].x0,x1:rooms[2].x1,y0:rooms[0].y0,y1:rooms[0].y1};
 return {seed,width,height,cell,minX,minY,solid,centers,kinds,start,connectors:0,version:1,pit:{hall,room,rooms,band,signs,holes:{top,bottom,spread,low,list:holes}}};}
// Canary ("tunneling mission"): one giant solid square of rock with open space around it. Iron and diamond turret
// ore are scattered through it; flux is rare near the edges and gets much denser toward the middle, so crews tunnel
// in for it. kinds: 0 open, 1 hazard wall, 2 rock, 3 turret ore, 4 flux, 5 iron.
function generateBlock(seed=0,opts={}){
 const width=opts.width||85,height=opts.height||width,cell=4,minX=-((width-1)/2)*cell,minY=-((height-1)/2)*cell,N=width*height,cx=(width-1)/2,cy=(height-1)/2,ring=opts.ring||8;
 const hash=(x,y,k=0)=>{let h=Math.imul(x+k*7919,374761393)^Math.imul(y-k*104729,668265263)^Math.imul((seed+(opts.salt|0))|0,1442695041);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;};
 const index=(x,y)=>y*width+x,solid=new Uint8Array(N).fill(1),centers=new Uint8Array(N),kinds=new Uint8Array(N).fill(1);
 const b0=2+ring,b1=width-3-ring,c0=2+ring,c1=height-3-ring,half=Math.max(b1-b0,c1-c0)/2;let mineable=0;
 for(let y=2;y<height-2;y++)for(let x=2;x<width-2;x++){const i=index(x,y);if(x<b0||x>b1||y<c0||y>c1){solid[i]=0;kinds[i]=0;continue;}
  // 0 at the centre, 1 at the edge of the square.
  const d=Math.max(Math.abs(x-cx),Math.abs(y-cy))/half,core=Math.max(0,1-d/(opts.coreRadius||.5)),flux=(opts.fluxEdge??.015)+(opts.fluxCore??.6)*Math.pow(core,1.3),r=hash(x,y,1);
  kinds[i]=r<flux?4:r<flux+(opts.turretOre??.025)?3:r<flux+(opts.turretOre??.025)+(opts.iron??.16)?5:2;mineable++;}
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){let fits=true;for(let dy=-2;dy<=2&&fits;dy++)for(let dx=-3;dx<=3;dx++){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=width||yy>=height||solid[index(xx,yy)]){fits=false;break;}}if(fits)centers[index(x,y)]=1;}
 const entry={x:0,y:minY+(c0-ring/2-.5)*cell};
 return {seed,width,height,cell,minX,minY,solid,centers,kinds,start:index(cx,Math.round((entry.y-minY)/cell)),connectors:0,version:1,mineable,block:{x0:b0,x1:b1,y0:c0,y1:c1,cx,cy,half},entry};}
function generate(seed=0,opts={}){if(opts.layout==='block')return generateBlock(seed,opts);if(opts.layout==='pit')return generatePit(seed,opts);
 // Defaults reproduce the original Finch map exactly; era.js passes per-zone size/threshold/salt.
 // Width and height must be odd so the entry cavern sits at world (0,0).
 const width=opts.width||117,height=opts.height||67,threshold=opts.threshold??.59,salt=opts.salt|0,cell=4,minX=-((width-1)/2)*cell,minY=-((height-1)/2)*cell,N=width*height,cx0=(width-1)/2,cy0=(height-1)/2;
 const hash=(x,y)=>{let h=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul((seed+salt)|0,1442695041);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;};
 const noise=(x,y)=>{const a=Math.floor(x),b=Math.floor(y),u=x-a,v=y-b,s=u*u*(3-2*u),t=v*v*(3-2*v);return (hash(a,b)*(1-s)+hash(a+1,b)*s)*(1-t)+(hash(a,b+1)*(1-s)+hash(a+1,b+1)*s)*t;};
 const index=(x,y)=>y*width+x,valid=(x,y)=>x>=4&&x<width-4&&y>=3&&y<height-3;
 const centers=new Uint8Array(N),solid=new Uint8Array(N).fill(1),density=new Float32Array(N);
 // Domain-warped fractal value noise produces broad caverns with irregular edges.
 for(let y=3;y<height-3;y++)for(let x=4;x<width-4;x++){
  const wx=x+(noise(x/23+31,y/23-17)-.5)*8,wy=y+(noise(x/23-47,y/23+29)-.5)*8;
  const n=.68*noise(wx/12,wy/12)+.24*noise(wx/5+61,wy/5-37)+.08*noise(wx/2-13,wy/2+71);
  density[index(x,y)]=n;centers[index(x,y)]=n>threshold?1:0;
 }
 const start=index(cx0,cy0);for(let y=cy0-3;y<=cy0+3;y++)for(let x=cx0-1;x<=cx0+1;x++)centers[index(x,y)]=1;centers[start]=1;centers[index(cx0+16,cy0-13)]=1; // Portal and scout clearance anchors, not room templates.
 const neighbors=i=>{const x=i%width,y=Math.floor(i/width);return [[x+1,y],[x-1,y],[x,y+1],[x,y-1]].filter(([a,b])=>valid(a,b)).map(([a,b])=>index(a,b));};
 const reached=new Uint8Array(N);
 function flood(seeds){const q=seeds.slice();for(const i of seeds)reached[i]=1;for(let h=0;h<q.length;h++)for(const j of neighbors(q[h]))if(centers[j]&&!reached[j]){reached[j]=1;q.push(j);}return q;}
 flood([start]);let connectors=0;
 // Multi-source search joins each disconnected cavern to the entry component.
 // Neighbor ordering follows local density, avoiding an identical bend pattern.
 for(;;){let missing=false;for(let i=0;i<N;i++)if(centers[i]&&!reached[i]){missing=true;break;}if(!missing)break;
  const parents=new Int32Array(N).fill(-2),q=[];for(let i=0;i<N;i++)if(reached[i]){parents[i]=-1;q.push(i);}
  let target=-1;for(let h=0;h<q.length&&target<0;h++)for(const j of neighbors(q[h]).sort((a,b)=>density[b]-density[a]))if(parents[j]===-2){parents[j]=q[h];q.push(j);if(centers[j]&&!reached[j]){target=j;break;}}
  if(target<0)throw Error('Zone connectivity failed');const path=[];for(let i=target;i>=0&&!reached[i];i=parents[i]){centers[i]=1;path.push(i);}flood(path);connectors++;
 }
 // Minkowski clearance: every open tile is covered by a reachable ship-sized
 // footprint. This also eliminates tiny inaccessible pockets and pinched paths.
 for(let i=0;i<N;i++)if(centers[i]){const x=i%width,y=Math.floor(i/width);for(let dy=-2;dy<=2;dy++)for(let dx=-3;dx<=3;dx++)solid[index(x+dx,y+dy)]=0;}
 return {seed,width,height,cell,minX,minY,solid,centers,connectors,start,version:1};
}
const api={generate};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ZoneGenerator=api;
})(typeof globalThis!=='undefined'?globalThis:this);
