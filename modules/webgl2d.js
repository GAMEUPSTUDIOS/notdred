// WebGL drawing for the game canvas. It speaks the part of the Canvas 2D API the game uses (transforms, save/restore,
// images, rectangles, paths, text, globalAlpha, the "multiply" blend, rectangular clips, brightness filter), so every
// existing drawing function runs on the graphics card unchanged. Everything is batched into textured triangles:
// solid shapes use a 1×1 white texture, images and cached canvases become textures, text is rendered once per
// distinct string into a small canvas and reused. If WebGL isn't available, createGL2D returns null and the game
// uses the ordinary 2D canvas (also forced with ?renderer=2d, or localStorage 'notdred-renderer' = '2d').
(function(root){
'use strict';
function createGL2D(canvas){
 try{const q=typeof location!=='undefined'?new URLSearchParams(location.search).get('renderer'):null;let pref=null;try{pref=localStorage.getItem('notdred-renderer');}catch{}if((q||pref)==='2d')return null;}catch{}
 let gl=null;try{gl=canvas.getContext('webgl',{alpha:false,antialias:false,premultipliedAlpha:true,preserveDrawingBuffer:false,powerPreference:'high-performance'});}catch{gl=null;}
 if(!gl)return null;
 const VS='attribute vec2 p;attribute vec2 uv;attribute vec4 c;uniform vec2 res;varying vec2 vuv;varying vec4 vc;void main(){vec2 z=p/res*2.0-1.0;gl_Position=vec4(z.x,-z.y,0.0,1.0);vuv=uv;vc=c;}';
 const FS='precision mediump float;uniform sampler2D t;varying vec2 vuv;varying vec4 vc;void main(){gl_FragColor=texture2D(t,vuv)*vc;}';
 let prog,locP,locUV,locC,locRes,vbo,white,textures=new WeakMap();
 function compile(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('WebGL shader: '+gl.getShaderInfoLog(s));return s;}
 function setup(){prog=gl.createProgram();gl.attachShader(prog,compile(gl.VERTEX_SHADER,VS));gl.attachShader(prog,compile(gl.FRAGMENT_SHADER,FS));gl.linkProgram(prog);if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error('WebGL link failed');
  gl.useProgram(prog);locP=gl.getAttribLocation(prog,'p');locUV=gl.getAttribLocation(prog,'uv');locC=gl.getAttribLocation(prog,'c');locRes=gl.getUniformLocation(prog,'res');
  vbo=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.bufferData(gl.ARRAY_BUFFER,verts.byteLength,gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(locP);gl.vertexAttribPointer(locP,2,gl.FLOAT,false,32,0);gl.enableVertexAttribArray(locUV);gl.vertexAttribPointer(locUV,2,gl.FLOAT,false,32,8);gl.enableVertexAttribArray(locC);gl.vertexAttribPointer(locC,4,gl.FLOAT,false,32,16);
  gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.disable(gl.DEPTH_TEST);
  white=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,white);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));texParams();
  textures=new WeakMap();textCache.clear();curTex=null;curBlend='source-over';curClip=null;vw=vh=-1;}
 function texParams(){gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);}
 // ---- batch ------------------------------------------------------------------------------------------------------
 const MAXV=6*8192,verts=new Float32Array(MAXV*8);let nv=0,curTex=null,curBlend='source-over',curClip=null,vw=-1,vh=-1,lost=false;
 function flush(){if(!nv||lost){nv=0;return;}if(canvas.width!==vw||canvas.height!==vh){vw=canvas.width;vh=canvas.height;gl.viewport(0,0,vw,vh);gl.uniform2f(locRes,vw,vh);}
  gl.bufferSubData(gl.ARRAY_BUFFER,0,verts.subarray(0,nv*8));gl.drawArrays(gl.TRIANGLES,0,nv);nv=0;}
 function use(tex,blend,clip){if(tex!==curTex||blend!==curBlend||clip!==curClip){flush();if(tex!==curTex){gl.bindTexture(gl.TEXTURE_2D,tex);curTex=tex;}
  if(blend!==curBlend){curBlend=blend;if(blend==='multiply')gl.blendFunc(gl.DST_COLOR,gl.ONE_MINUS_SRC_ALPHA);else gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);}
  if(clip!==curClip){curClip=clip;if(clip){gl.enable(gl.SCISSOR_TEST);gl.scissor(clip[0],canvas.height-clip[3],Math.max(0,clip[2]-clip[0]),Math.max(0,clip[3]-clip[1]));}else gl.disable(gl.SCISSOR_TEST);}}
  if(nv+6>MAXV)flush();}
 function vert(x,y,u,v,c){const o=nv*8;verts[o]=x;verts[o+1]=y;verts[o+2]=u;verts[o+3]=v;verts[o+4]=c[0];verts[o+5]=c[1];verts[o+6]=c[2];verts[o+7]=c[3];nv++;}
 // A transformed quad: corners (x0,y0)-(x1,y1) in user space, uv (u0,v0)-(u1,v1).
 function quad(tex,x0,y0,x1,y1,u0,v0,u1,v1,c){use(tex,S.comp,S.clip);const m=S.m;
  const ax=m[0]*x0+m[2]*y0+m[4],ay=m[1]*x0+m[3]*y0+m[5],bx=m[0]*x1+m[2]*y0+m[4],by=m[1]*x1+m[3]*y0+m[5],cx=m[0]*x1+m[2]*y1+m[4],cy=m[1]*x1+m[3]*y1+m[5],dx=m[0]*x0+m[2]*y1+m[4],dy=m[1]*x0+m[3]*y1+m[5];
  vert(ax,ay,u0,v0,c);vert(bx,by,u1,v0,c);vert(cx,cy,u1,v1,c);vert(ax,ay,u0,v0,c);vert(cx,cy,u1,v1,c);vert(dx,dy,u0,v1,c);}
 function tri(ax,ay,bx,by,cx,cy,c){use(white,S.comp,S.clip);vert(ax,ay,.5,.5,c);vert(bx,by,.5,.5,c);vert(cx,cy,.5,.5,c);}
 // ---- colours ----------------------------------------------------------------------------------------------------
 const colorCache=new Map();let probe=null;
 function parseColor(s){if(typeof s!=='string')return [0,0,0,1];let c=colorCache.get(s);if(c)return c;
  let r=0,g=0,b=0,a=1,m;const t=s.trim();
  if((m=/^#([0-9a-f]{3,8})$/i.exec(t))){let h=m[1];if(h.length<=4)h=h.split('').map(x=>x+x).join('');r=parseInt(h.slice(0,2),16)/255;g=parseInt(h.slice(2,4),16)/255;b=parseInt(h.slice(4,6),16)/255;a=h.length===8?parseInt(h.slice(6,8),16)/255:1;}
  else if((m=/^rgba?\(([^)]+)\)$/i.exec(t))){const p=m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat);[r,g,b]=[p[0]/255,p[1]/255,p[2]/255];a=p.length>3?p[3]:1;}
  else{try{probe=probe||document.createElement('canvas').getContext('2d');probe.fillStyle='#000';probe.fillStyle=t;const n=probe.fillStyle;if(n!==t)return colorCache.set(s,parseColor(n)),colorCache.get(s);}catch{}}
  c=[r,g,b,a];if(colorCache.size>2000)colorCache.clear();colorCache.set(s,c);return c;}
 // Premultiplied vertex colour from a CSS colour, globalAlpha and the brightness filter.
 function paint(style,k=1){const c=parseColor(style),a=c[3]*S.alpha,br=S.bright;return [c[0]*a*br*k,c[1]*a*br*k,c[2]*a*br*k,a];}
 function tint(){const a=S.alpha,br=S.bright;return [a*br,a*br,a*br,a];}
 // ---- textures ---------------------------------------------------------------------------------------------------
 function texFor(src){let e=textures.get(src);const w=src.naturalWidth||src.videoWidth||src.width,h=src.naturalHeight||src.videoHeight||src.height;if(!w||!h)return null;
  if(e&&e.w===w&&e.h===h)return e;
  flush();if(!e){e={tex:gl.createTexture(),w,h};textures.set(src,e);}else{e.w=w;e.h=h;}
  gl.bindTexture(gl.TEXTURE_2D,e.tex);try{gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,src);}catch{return null;}texParams();curTex=e.tex;return e;}
 // ---- text: one small canvas per distinct (string, font, colour, outline); least-recently-used ones are dropped ----
 const textCache=new Map(),TEXT_MAX=700;let measureCtx=null;
 function mctx(){if(!measureCtx)measureCtx=document.createElement('canvas').getContext('2d');return measureCtx;}
 function textSprite(str,stroke){const key=(stroke?'S':'F')+S.font+'|'+(stroke?S.stroke+'|'+S.lineWidth+'|'+S.lineJoin:S.fill)+'|'+str;let e=textCache.get(key);
  if(e){textCache.delete(key);textCache.set(key,e);return e;}
  const m=mctx();m.font=S.font;const mt=m.measureText(str),pad=Math.ceil((stroke?S.lineWidth:0)+2),asc=Math.ceil(mt.actualBoundingBoxAscent||parseFloat(S.font.match(/(\d+(\.\d+)?)px/)?.[1]||12)),desc=Math.ceil(mt.actualBoundingBoxDescent||asc*.25);
  const w=Math.max(1,Math.ceil(mt.width)+pad*2),h=Math.max(1,asc+desc+pad*2),c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.font=S.font;g.textBaseline='alphabetic';g.textAlign='left';
  if(stroke){g.lineJoin=S.lineJoin;g.lineWidth=S.lineWidth;g.strokeStyle=S.stroke;g.strokeText(str,pad,pad+asc);}else{g.fillStyle=S.fill;g.fillText(str,pad,pad+asc);}
  e={canvas:c,w,h,width:mt.width,asc,pad};textCache.set(key,e);
  if(textCache.size>TEXT_MAX){const old=textCache.keys().next().value,o=textCache.get(old);textCache.delete(old);const t=textures.get(o.canvas);if(t){flush();if(curTex===t.tex){gl.bindTexture(gl.TEXTURE_2D,null);curTex=null;}gl.deleteTexture(t.tex);textures.delete(o.canvas);}}
  return e;}
 function drawText(str,x,y,stroke){str=String(str);if(!str)return;const e=textSprite(str,stroke),t=texFor(e.canvas);if(!t)return;
  let ox=0;const al=S.textAlign;if(al==='center')ox=-e.width/2;else if(al==='right'||al==='end')ox=-e.width;
  let oy=0;const bl=S.textBaseline;if(bl==='middle')oy=e.asc/2;else if(bl==='top'||bl==='hanging')oy=e.asc;else if(bl==='bottom')oy=-(e.h-e.asc-2*e.pad);
  const x0=x+ox-e.pad,y0=y+oy-e.asc-e.pad;quad(t.tex,x0,y0,x0+e.w,y0+e.h,0,0,1,1,tint());}
 // ---- paths ------------------------------------------------------------------------------------------------------
 let path=[],cur=null;
 function pt(x,y){const m=S.m;return [m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];}
 function strokeSeg(a,b,w,c){const dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy);if(L<1e-6)return;const nx=-dy/L*w/2,ny=dx/L*w/2,ex=dx/L*w/2,ey=dy/L*w/2;
  const p1=[a[0]+nx-ex,a[1]+ny-ey],p2=[b[0]+nx+ex,b[1]+ny+ey],p3=[b[0]-nx+ex,b[1]-ny+ey],p4=[a[0]-nx-ex,a[1]-ny-ey];tri(p1[0],p1[1],p2[0],p2[1],p3[0],p3[1],c);tri(p1[0],p1[1],p3[0],p3[1],p4[0],p4[1],c);}
 function lineScale(){const m=S.m;return Math.sqrt(Math.abs(m[0]*m[3]-m[1]*m[2]))||1;}
 // ---- state ------------------------------------------------------------------------------------------------------
 const fresh=()=>({m:[1,0,0,1,0,0],alpha:1,fill:'#000',stroke:'#000',lineWidth:1,font:'10px sans-serif',textAlign:'start',textBaseline:'alphabetic',lineJoin:'miter',lineCap:'butt',comp:'source-over',bright:1,filter:'none',clip:null,dash:[],smoothing:false});
 let S=fresh();const stack=[];
 const ctx={canvas,isWebGL:true,
  save(){stack.push({...S,m:S.m.slice(),dash:S.dash.slice()});},restore(){if(stack.length)S=stack.pop();},
  setTransform(a,b,c,d,e,f){if(typeof a==='object'&&a){({a,b,c,d,e,f}=a);}S.m=[a,b,c,d,e,f];},resetTransform(){S.m=[1,0,0,1,0,0];},
  getTransform(){const m=S.m;return {a:m[0],b:m[1],c:m[2],d:m[3],e:m[4],f:m[5]};},
  transform(a,b,c,d,e,f){const m=S.m;S.m=[m[0]*a+m[2]*b,m[1]*a+m[3]*b,m[0]*c+m[2]*d,m[1]*c+m[3]*d,m[0]*e+m[2]*f+m[4],m[1]*e+m[3]*f+m[5]];},
  translate(x,y){const m=S.m;m[4]+=m[0]*x+m[2]*y;m[5]+=m[1]*x+m[3]*y;},scale(x,y){const m=S.m;m[0]*=x;m[1]*=x;m[2]*=y;m[3]*=y;},
  rotate(r){const c=Math.cos(r),s=Math.sin(r),m=S.m,a=m[0],b=m[1],cc=m[2],d=m[3];m[0]=a*c+cc*s;m[1]=b*c+d*s;m[2]=-a*s+cc*c;m[3]=-b*s+d*c;},
  get fillStyle(){return S.fill;},set fillStyle(v){S.fill=v;},get strokeStyle(){return S.stroke;},set strokeStyle(v){S.stroke=v;},
  get globalAlpha(){return S.alpha;},set globalAlpha(v){if(Number.isFinite(v))S.alpha=Math.max(0,Math.min(1,v));},
  get lineWidth(){return S.lineWidth;},set lineWidth(v){if(v>0)S.lineWidth=v;},get font(){return S.font;},set font(v){S.font=v;},
  get textAlign(){return S.textAlign;},set textAlign(v){S.textAlign=v;},get textBaseline(){return S.textBaseline;},set textBaseline(v){S.textBaseline=v;},
  get lineJoin(){return S.lineJoin;},set lineJoin(v){S.lineJoin=v;},get lineCap(){return S.lineCap;},set lineCap(v){S.lineCap=v;},
  get globalCompositeOperation(){return S.comp;},set globalCompositeOperation(v){S.comp=v==='multiply'?'multiply':'source-over';},
  get filter(){return S.filter;},set filter(v){S.filter=v;const m=/brightness\(([\d.]+)\)/.exec(v||'');S.bright=m?parseFloat(m[1]):1;},
  get imageSmoothingEnabled(){return S.smoothing;},set imageSmoothingEnabled(v){S.smoothing=!!v;},
  setLineDash(d){S.dash=Array.isArray(d)?d.filter(x=>x>0):[];},getLineDash(){return S.dash.slice();},
  fillRect(x,y,w,h){quad(white,x,y,x+w,y+h,.5,.5,.5,.5,paint(S.fill));},
  clearRect(x,y,w,h){const c=S.comp;S.comp='source-over';quad(white,x,y,x+w,y+h,.5,.5,.5,.5,[0,0,0,1]);S.comp=c;},
  strokeRect(x,y,w,h){this.beginPath();this.rect(x,y,w,h);this.stroke();},
  drawImage(img,a,b,c,d,e,f,g,h){if(!img)return;const t=texFor(img);if(!t)return;let sx=0,sy=0,sw=t.w,sh=t.h,dx,dy,dw,dh;
   if(e===undefined){dx=a;dy=b;dw=c===undefined?t.w:c;dh=d===undefined?t.h:d;}else{sx=a;sy=b;sw=c;sh=d;dx=e;dy=f;dw=g;dh=h;}
   quad(t.tex,dx,dy,dx+dw,dy+dh,sx/t.w,sy/t.h,(sx+sw)/t.w,(sy+sh)/t.h,tint());},
  beginPath(){path=[];cur=null;},moveTo(x,y){cur=[pt(x,y)];path.push(cur);},lineTo(x,y){if(!cur){cur=[];path.push(cur);}cur.push(pt(x,y));},
  closePath(){if(cur&&cur.length){cur.closed=true;const f=cur[0];cur=[f];path.push(cur);}},
  rect(x,y,w,h){const s=[pt(x,y),pt(x+w,y),pt(x+w,y+h),pt(x,y+h)];s.closed=true;path.push(s);cur=null;},
  arc(x,y,r,a0,a1,ccw=false){let span=a1-a0;if(ccw){if(span>0)span-=Math.PI*2*Math.ceil(span/(Math.PI*2));}else if(span<0)span+=Math.PI*2*Math.ceil(-span/(Math.PI*2));if(Math.abs(span)>Math.PI*2)span=Math.sign(span)*Math.PI*2;
   const px=r*lineScale(),n=Math.max(8,Math.min(96,Math.ceil(Math.abs(span)*Math.sqrt(px)*1.2)));if(!cur){cur=[];path.push(cur);}for(let i=0;i<=n;i++){const t=a0+span*i/n;cur.push(pt(x+Math.cos(t)*r,y+Math.sin(t)*r));}},
  fill(){const c=paint(S.fill);for(const s of path){if(s.length<3)continue;const o=s[0];for(let i=1;i+1<s.length;i++)tri(o[0],o[1],s[i][0],s[i][1],s[i+1][0],s[i+1][1],c);}},
  stroke(){const c=paint(S.stroke),w=S.lineWidth*lineScale(),dash=S.dash.map(x=>x*lineScale());
   for(const s of path){const pts=s.closed?[...s,s[0]]:s;if(pts.length<2)continue;
    if(!dash.length){for(let i=0;i+1<pts.length;i++)strokeSeg(pts[i],pts[i+1],w,c);continue;}
    let di=0,left=dash[0],on=true;for(let i=0;i+1<pts.length;i++){let a=pts[i];const b=pts[i+1];let L=Math.hypot(b[0]-a[0],b[1]-a[1]);
     while(L>1e-6){const step=Math.min(left,L),t=step/L,m=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];if(on)strokeSeg(a,m,w,c);a=m;L-=step;left-=step;if(left<=1e-6){di=(di+1)%dash.length;left=dash[di];on=!on;}}}}},
  clip(){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const s of path)for(const p of s){x0=Math.min(x0,p[0]);y0=Math.min(y0,p[1]);x1=Math.max(x1,p[0]);y1=Math.max(y1,p[1]);}
   if(!(x1>x0))x0=y0=x1=y1=0;let r=[Math.floor(x0),Math.floor(y0),Math.ceil(x1),Math.ceil(y1)];if(S.clip)r=[Math.max(r[0],S.clip[0]),Math.max(r[1],S.clip[1]),Math.min(r[2],S.clip[2]),Math.min(r[3],S.clip[3])];S.clip=r;},
  fillText(t,x,y){drawText(t,x,y,false);},strokeText(t,x,y){drawText(t,x,y,true);},
  measureText(t){const m=mctx();m.font=S.font;return m.measureText(String(t));},
  // Called once at the end of every frame (draw()).
  flush(){flush();},
  createLinearGradient(){return '#888';},createRadialGradient(){return '#888';},createPattern(){return '#888';},
  getImageData(){return {data:new Uint8ClampedArray(4),width:1,height:1};},putImageData(){},isPointInPath(){return false;}};
 setup();
 // A lost context that doesn't come back within 4 s: switch this browser to the 2D canvas and reload.
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;setTimeout(()=>{if(lost){try{localStorage.setItem('notdred-renderer','2d');}catch{}location.reload();}},4000);});
 canvas.addEventListener('webglcontextrestored',()=>{lost=false;try{setup();}catch(e){console.error(e);}});
 return ctx;}
root.createGL2D=createGL2D;
})(typeof window!=='undefined'?window:globalThis);
