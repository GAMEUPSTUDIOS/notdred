#include "rules.h"
namespace nd {
const J& zoneDef(const std::string& id){const auto& z=data().zones;auto it=z.find(id);if(it!=z.end())return *it;return z.at(data().startZone);}
bool isCombatZone(const std::string& id){return zoneDef(id).value("kind","")=="combat";}
Half zoneHalf(const std::string& id){const J& d=zoneDef(id);
 if(d.contains("half")&&d["half"].is_object())return {d["half"]["w"].get<double>(),d["half"]["h"].get<double>()};
 const J& gen=d.at("gen");const double k=gen.value("layout","")=="block"?1:gen.value("scale",1.0);
 auto odd=[&](double n){double v=n*k;return v-(k>1&&std::fmod(v,2.0)==0?1:0);};
 const double w=gen.at("width").get<double>(),h0=gen.contains("height")&&gen["height"].is_number()?gen["height"].get<double>():0,h=h0?h0:w;
 return {(odd(w)-1)*2+8,(odd(h)-1)*2+8};}
int shipExpansions(const Bounds& b){return std::max(0,(b.r-b.l-10)+(b.b-b.t-7));}
int shipMaxHP(const Bounds& b){const J& s=data().shields;return s.at("base").get<int>()+s.at("perExpansion").get<int>()*shipExpansions(b);}
int shipSize(const Bounds& b){return (b.r-b.l+1)*(b.b-b.t+1);}
double pvpMultiplierFor(double size,const std::string& id){const auto& z=data().zones;auto it=z.find(id);if(it==z.end())return 0;const J& r=it->value("pvp",J());
 if(r.is_null()||!r.is_object())return 0;if(!r.contains("sizeZero")||r["sizeZero"].is_null())return 1;
 const double zero=r["sizeZero"].get<double>(),full=r["sizeFull"].get<double>();return std::max(0.0,std::min(1.0,(zero-size)/(zero-full)));}
const J& turretDef(bool starterRC,const std::string& kind){const J& t=data().turrets;std::string k=starterRC?"starter_rc":kind.empty()?"turret":kind;auto it=t.find(k);return it!=t.end()?*it:t.at("turret");}
double turretReload(bool starterRC,const std::string& kind,const std::string& ammoType){const J& r=data().ammoReload;double scale=1;auto it=r.find(ammoType);if(it!=r.end()&&it->get<double>()!=0)scale=it->get<double>();return turretDef(starterRC,kind).at("reload").get<double>()*scale;}
int turretCapacity(bool starterRC,const std::string& kind){const J& d=turretDef(starterRC,kind);int c=d.value("capacity",0);return c?c:16;}
int itemMaxHp(const std::string& type){const J& h=data().itemHp;auto it=h.find(type);int v=it!=h.end()?it->get<int>():0;return v?v:100;}
bool isAmmo(const std::string& type){return data().ammo.contains(type);}
J recipeNeeds(const std::string& type){const GameData& g=data();
 for(auto& f:g.freeRecipes)if(f==type)return J::object();
 auto extra=g.recipeExtra.find(type);auto c=g.cost.find(type);
 if(c==g.cost.end()||!c->second){
  if(extra!=g.recipeExtra.end()&&std::find(g.types.begin(),g.types.end(),type)!=g.types.end())return *extra;
  return J();}
 J out=J::object();out["iron"]=c->second;if(extra!=g.recipeExtra.end())for(auto& [k,v]:extra->items())out[k]=v;return out;}
std::string cleanColor(const std::string& c0){std::u16string u=toU16(c0);size_t a=0,b=u.size();while(a<b&&jsSpace(u[a]))a++;while(b>a&&jsSpace(u[b-1]))b--;std::string s=fromU16(u.substr(a,b-a));
 if(!s.empty()&&s[0]=='#')s=s.substr(1);if(s.size()!=6)return "";std::string o="#";for(char ch:s){if(!std::isxdigit((unsigned char)ch))return "";o+=(char)std::tolower((unsigned char)ch);}return o;}
// ---- UTF-16 helpers --------------------------------------------------------------------------------------------
std::u16string toU16(const std::string& s){std::u16string o;size_t i=0;while(i<s.size()){unsigned char c=s[i];uint32_t cp;int n;
  if(c<0x80){cp=c;n=1;}else if((c>>5)==6){cp=c&31;n=2;}else if((c>>4)==14){cp=c&15;n=3;}else if((c>>3)==30){cp=c&7;n=4;}else{o+=u'�';i++;continue;}
  if(i+n>s.size()){o+=u'�';break;}bool bad=false;for(int k=1;k<n;k++){unsigned char d=s[i+k];if((d>>6)!=2){bad=true;break;}cp=(cp<<6)|(d&63);}
  if(bad){o+=u'�';i++;continue;}i+=n;
  if(cp>=0x10000){cp-=0x10000;o+=char16_t(0xd800+(cp>>10));o+=char16_t(0xdc00+(cp&1023));}else o+=char16_t(cp);}
 return o;}
// A lone surrogate (JavaScript allows them, UTF-8 does not) becomes U+FFFD.
std::string fromU16(const std::u16string& s){std::string o;for(size_t i=0;i<s.size();i++){uint32_t cp=s[i];
  if(cp>=0xd800&&cp<0xdc00&&i+1<s.size()&&s[i+1]>=0xdc00&&s[i+1]<0xe000){cp=0x10000+((cp-0xd800)<<10)+(s[i+1]-0xdc00);i++;}else if(cp>=0xd800&&cp<0xe000)cp=0xfffd;
  if(cp<0x80)o+=char(cp);else if(cp<0x800){o+=char(0xc0|(cp>>6));o+=char(0x80|(cp&63));}else if(cp<0x10000){o+=char(0xe0|(cp>>12));o+=char(0x80|((cp>>6)&63));o+=char(0x80|(cp&63));}
  else{o+=char(0xf0|(cp>>18));o+=char(0x80|((cp>>12)&63));o+=char(0x80|((cp>>6)&63));o+=char(0x80|(cp&63));}}
 return o;}
// JavaScript's \s (and what trim() removes).
bool jsSpace(char16_t c){return c==9||c==10||c==11||c==12||c==13||c==32||c==0xa0||c==0x1680||(c>=0x2000&&c<=0x200a)||c==0x2028||c==0x2029||c==0x202f||c==0x205f||c==0x3000||c==0xfeff;}
// String(name).replace(/[<>\x00-\x1f]/g,'').replace(/\s+/g,' ').trim().slice(0,32)
std::string cleanShipName(const std::string& name){std::u16string s=toU16(name),a;for(char16_t c:s)if(c!=u'<'&&c!=u'>'&&c>0x1f)a+=c;
 std::u16string b;for(size_t i=0;i<a.size();){if(jsSpace(a[i])){b+=u' ';while(i<a.size()&&jsSpace(a[i]))i++;}else b+=a[i++];}
 size_t st=0,en=b.size();while(st<en&&jsSpace(b[st]))st++;while(en>st&&jsSpace(b[en-1]))en--;std::u16string c=b.substr(st,en-st);if(c.size()>32)c.resize(32);
 return fromU16(c);}
}
