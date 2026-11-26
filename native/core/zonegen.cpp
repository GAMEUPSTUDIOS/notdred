// The zone generator (dist/zone-generator.js), ported bit for bit: the same seed gives the same caves, holes and
// block as the JavaScript (the page and every server generate zones from seeds, so they must agree exactly).
#include "zonegen.h"
#include "jsmath.h"
namespace nd {
// JavaScript's ToInt32 (|0, Math.imul's operands): a double wrapped to 32 bits.
static int32_t toInt32(double v){if(!std::isfinite(v))return 0;double t=std::trunc(v);double m=std::fmod(t,4294967296.0);if(m<0)m+=4294967296.0;uint32_t u=(uint32_t)m;return (int32_t)u;}
static inline uint32_t imul(uint32_t a,uint32_t b){return a*b;}
// hash(x,y) = h(x)^h(y)^h(seed) mixed — the JavaScript's Math.imul/>>> chain on 32-bit words.
static double hash3(int32_t x,int32_t y,int32_t s){uint32_t h=imul((uint32_t)x,374761393u)^imul((uint32_t)y,668265263u)^imul((uint32_t)s,1442695041u);h=imul(h^(h>>13),1274126177u);return (double)(h^(h>>16))/4294967296.0;}
static int oddSize(double n,double K){double v=n*K;return (int)(v-(K>1&&std::fmod(v,2.0)==0?1:0));}
static double optNum(const J& o,const char* k,double d){auto it=o.find(k);return it!=o.end()&&it->is_number()?it->get<double>():d;}
// `opts.x||d`: a missing, zero or non-number option takes the default.
static double optOr(const J& o,const char* k,double d){double v=optNum(o,k,0);return v?v:d;}
// `opts.x??d`: only a missing (or null) option takes the default.
static double optNullish(const J& o,const char* k,double d){auto it=o.find(k);if(it==o.end()||it->is_null())return d;return it->is_number()?it->get<double>():NAN;}
static void clearCL(const J& o,int& cx,int& cy){cx=3;cy=2;auto it=o.find("clear");if(it!=o.end()&&it->is_array()&&it->size()>=2&&(*it)[0].is_number()&&(*it)[1].is_number()){cx=(int)(*it)[0].get<double>();cy=(int)(*it)[1].get<double>();}}
static void fitCenters(ZoneGrid& g,int CLX,int CLY){for(int y=0;y<g.height;y++)for(int x=0;x<g.width;x++){bool fits=true;for(int dy=-CLY;dy<=CLY&&fits;dy++)for(int dx=-CLX;dx<=CLX;dx++){int xx=x+dx,yy=y+dy;
   if(xx<0||yy<0||xx>=g.width||yy>=g.height||g.solid[yy*g.width+xx]){fits=false;break;}}if(fits)g.centers[y*g.width+x]=1;}}
static ZoneGrid generatePit(double seed,const J& o){const double K=optOr(o,"scale",1);int CLX,CLY;clearCL(o,CLX,CLY);ZoneGrid g;g.layout="pit";g.seed=seed;
 g.width=oddSize(optOr(o,"width",61),K);g.height=oddSize(optOr(o,"height",75),K);g.cell=4;g.minX=-((g.width-1)/2.0)*g.cell;g.minY=-((g.height-1)/2.0)*g.cell;const int N=g.width*g.height;const double cx=(g.width-1)/2.0,cy=(g.height-1)/2.0;
 const int32_t s=toInt32(seed+toInt32(optNum(o,"salt",0)));auto hash=[&](double x,double y){return hash3(toInt32(x),toInt32(y),s);};
 g.solid.assign(N,1);g.centers.assign(N,0);g.kinds.assign(N,1);auto idx=[&](int x,int y){return y*g.width+x;};
 auto open=[&](int x,int y){if(x<2||y<2||x>=g.width-2||y>=g.height-2)return;g.solid[idx(x,y)]=0;g.kinds[idx(x,y)]=0;};
 const double hy0=cy-10*K,hy1=cy+4*K,hx0=3,hx1=g.width-4,by0=g.height-6*K+1,by1=g.height-3;
 for(double y=hy0;y<=hy1;y++)for(double x=hx0;x<=hx1;x++)open((int)x,(int)y);
 const double low=11*K,spread=(18+std::floor(hash(3,4)*3))*K,top=hy1+1,bottom=g.height-9*K,roomHalf=3*K;
 struct H{int k;double bottomX,topX;};std::vector<H> holes;for(int k:{-1,0,1})holes.push_back({k,cx+k*low,cx+k*spread});
 for(double y=top;y<=bottom;y++){const double t=(bottom-y)/(bottom-top),w=(6+t*4)*K;for(auto& h:holes){const double xc=h.bottomX+(h.topX-h.bottomX)*t;for(double x=std::floor(xc-w/2);x<=std::ceil(xc+w/2);x++)if(std::fabs(x-xc)<=w/2)open((int)x,(int)y);}}
 J rooms=J::array();for(auto& h:holes){const double rx0=h.bottomX-roomHalf,rx1=h.bottomX+roomHalf,ry0=bottom,ry1=g.height-6*K;for(double y=ry0;y<=ry1;y++)for(double x=rx0;x<=rx1;x++)open((int)x,(int)y);
  for(double y=by0;y<=by1;y++)for(double x=rx0;x<=rx1;x++)g.kinds[idx((int)x,(int)y)]=y==by1?2:hash(x,y)<.55?3:4;rooms.push_back({{"x0",rx0},{"x1",rx1},{"y0",ry0},{"y1",ry1}});}
 fitCenters(g,CLX,CLY);g.start=idx((int)cx,(int)cy);J signs=J::array();for(auto& h:holes)signs.push_back({{"x",g.minX+h.topX*g.cell},{"y",g.minY+(hy1-2)*g.cell}});
 J list=J::array();for(auto& h:holes)list.push_back({{"k",h.k},{"bottomX",h.bottomX},{"topX",h.topX}});
 g.connectors=0;g.version=K>1?3:1;g.extra={{"pit",{{"hall",{{"y0",hy0},{"y1",hy1},{"x0",hx0},{"x1",hx1}}},{"room",{{"x0",rooms[0]["x0"]},{"x1",rooms[2]["x1"]},{"y0",rooms[0]["y0"]},{"y1",rooms[0]["y1"]}}},{"rooms",rooms},{"band",{{"y0",by0},{"y1",by1}}},{"signs",signs},{"holes",{{"top",top},{"bottom",bottom},{"spread",spread},{"low",low},{"list",list}}}}}};
 return g;}
static ZoneGrid generateBlock(double seed,const J& o){int CLX,CLY;clearCL(o,CLX,CLY);ZoneGrid g;g.layout="block";g.seed=seed;g.width=(int)optOr(o,"width",85);g.height=(int)optOr(o,"height",g.width);g.cell=4;
 g.minX=-((g.width-1)/2.0)*g.cell;g.minY=-((g.height-1)/2.0)*g.cell;const int N=g.width*g.height;const double cx=(g.width-1)/2.0,cy=(g.height-1)/2.0,ring=optOr(o,"ring",8);
 const int32_t s=toInt32(seed+toInt32(optNum(o,"salt",0)));auto hash=[&](double x,double y,double k){return hash3(toInt32(x+k*7919),toInt32(y-k*104729),s);};
 g.solid.assign(N,1);g.centers.assign(N,0);g.kinds.assign(N,1);auto idx=[&](int x,int y){return y*g.width+x;};
 const double b0=2+ring,b1=g.width-3-ring,c0=2+ring,c1=g.height-3-ring,half=std::max(b1-b0,c1-c0)/2;int mineable=0;
 const double coreR=optOr(o,"coreRadius",.5),fluxEdge=optNullish(o,"fluxEdge",.015),fluxCore=optNullish(o,"fluxCore",.6),turretOre=optNullish(o,"turretOre",.025),iron=optNullish(o,"iron",.16);
 for(int y=2;y<g.height-2;y++)for(int x=2;x<g.width-2;x++){const int i=idx(x,y);if(x<b0||x>b1||y<c0||y>c1){g.solid[i]=0;g.kinds[i]=0;continue;}
  const double d=std::max(std::fabs(x-cx),std::fabs(y-cy))/half,core=std::max(0.0,1-d/coreR),flux=fluxEdge+fluxCore*jsmath::pow(core,1.3),r=hash(x,y,1);
  g.kinds[i]=r<flux?4:r<flux+turretOre?3:r<flux+turretOre+iron?5:2;mineable++;}
 fitCenters(g,CLX,CLY);const double ex=0,ey=g.minY+(c0-ring/2-.5)*g.cell;g.start=idx((int)cx,(int)jsRound((ey-g.minY)/g.cell));g.connectors=0;g.version=CLX>3?2:1;
 g.extra={{"mineable",mineable},{"block",{{"x0",b0},{"x1",b1},{"y0",c0},{"y1",c1},{"cx",cx},{"cy",cy},{"half",half}}},{"entry",{{"x",ex},{"y",ey}}}};return g;}
ZoneGrid generateZone(double seed,const J& o){const std::string layout=o.is_object()&&o.contains("layout")&&o["layout"].is_string()?o["layout"].get<std::string>():"";
 if(layout=="block")return generateBlock(seed,o);if(layout=="pit")return generatePit(seed,o);
 const double K=optOr(o,"scale",1);int CLX,CLY;clearCL(o,CLX,CLY);const int M=std::max(4,CLX+2),MY=std::max(3,CLY+2);ZoneGrid g;g.layout="caves";g.seed=seed;
 g.width=oddSize(optOr(o,"width",117),K);g.height=oddSize(optOr(o,"height",67),K);const double threshold=optNullish(o,"threshold",.59);const int32_t salt=toInt32(optNum(o,"salt",0));g.cell=4;
 g.minX=-((g.width-1)/2.0)*g.cell;g.minY=-((g.height-1)/2.0)*g.cell;const int N=g.width*g.height,W=g.width,H=g.height;const int cx0=(W-1)/2,cy0=(H-1)/2;const int32_t s=toInt32(seed+salt);
 auto hash=[&](double x,double y){return hash3(toInt32(x),toInt32(y),s);};
 auto noise=[&](double x,double y){const double a=std::floor(x),b=std::floor(y),u=x-a,v=y-b,ss=u*u*(3-2*u),t=v*v*(3-2*v);return (hash(a,b)*(1-ss)+hash(a+1,b)*ss)*(1-t)+(hash(a,b+1)*(1-ss)+hash(a+1,b+1)*ss)*t;};
 auto idx=[&](int x,int y){return y*W+x;};auto valid=[&](int x,int y){return x>=M&&x<W-M&&y>=MY&&y<H-MY;};
 g.centers.assign(N,0);g.solid.assign(N,1);std::vector<float> density(N,0.f);
 for(int y=MY;y<H-MY;y++)for(int x=M;x<W-M;x++){const double X=x/K,Y=y/K;const double wx=X+(noise(X/23+31,Y/23-17)-.5)*8,wy=Y+(noise(X/23-47,Y/23+29)-.5)*8;
  const double n=.68*noise(wx/12,wy/12)+.24*noise(wx/5+61,wy/5-37)+.08*noise(wx/2-13,wy/2+71);density[idx(x,y)]=(float)n;g.centers[idx(x,y)]=n>threshold?1:0;}
 // (a typed array ignores writes past either end; an index that lands in another row is written, as in JavaScript)
 auto setC=[&](long i){if(i>=0&&i<N)g.centers[i]=1;};
 const int start=idx(cx0,cy0);for(double y=cy0-3*K;y<=cy0+3*K;y++)for(double x=cx0-K;x<=cx0+K;x++)setC((long)y*W+(long)x);setC(start);setC((long)(cy0-13*K)*W+(long)(cx0+16*K));
 auto neighbors=[&](int i,int out[4]){const int x=i%W,y=i/W;int n=0;const int c[4][2]={{x+1,y},{x-1,y},{x,y+1},{x,y-1}};for(auto& p:c)if(valid(p[0],p[1]))out[n++]=idx(p[0],p[1]);return n;};
 std::vector<uint8_t> reached(N,0);
 auto flood=[&](const std::vector<int>& seeds){std::vector<int> q=seeds;for(int i:seeds)reached[i]=1;int nb[4];for(size_t h=0;h<q.size();h++){int n=neighbors(q[h],nb);for(int k=0;k<n;k++){int j=nb[k];if(g.centers[j]&&!reached[j]){reached[j]=1;q.push_back(j);}}}};
 flood({start});int connectors=0;
 for(;;){bool missing=false;for(int i=0;i<N;i++)if(g.centers[i]&&!reached[i]){missing=true;break;}if(!missing)break;
  std::vector<int> parents(N,-2),q;for(int i=0;i<N;i++)if(reached[i]){parents[i]=-1;q.push_back(i);}
  int target=-1,nb[4];for(size_t h=0;h<q.size()&&target<0;h++){int n=neighbors(q[h],nb);std::stable_sort(nb,nb+n,[&](int a,int b){return (double)density[b]-(double)density[a]<0;});
   for(int k=0;k<n;k++){int j=nb[k];if(parents[j]==-2){parents[j]=q[h];q.push_back(j);if(g.centers[j]&&!reached[j]){target=j;break;}}}}
  if(target<0)fail("Zone connectivity failed");std::vector<int> path;for(int i=target;i>=0&&!reached[i];i=parents[i]){g.centers[i]=1;path.push_back(i);}flood(path);connectors++;}
 for(int i=0;i<N;i++)if(g.centers[i]){const int x=i%W,y=i/W;for(int dy=-CLY;dy<=CLY;dy++)for(int dx=-CLX;dx<=CLX;dx++){long j=(long)(y+dy)*W+(x+dx);if(j>=0&&j<N)g.solid[j]=0;}}
 g.connectors=connectors;g.start=start;g.version=K>1?2:1;return g;}
J ZoneGrid::toJSON(bool arrays)const{J o={{"seed",seed},{"width",width},{"height",height},{"cell",cell},{"minX",minX},{"minY",minY},{"start",start},{"connectors",connectors},{"version",version}};
 if(arrays){o["solid"]=solid;o["centers"]=centers;if(!kinds.empty())o["kinds"]=kinds;}for(auto& [k,v]:extra.items())o[k]=v;return o;}
}
