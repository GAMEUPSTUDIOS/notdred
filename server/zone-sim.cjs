'use strict';
// One shared simulation per zone (see zone-runtime.js). Created by the zone bus when the first ship enters a zone,
// disposed a while after the last one leaves.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),codec=require('../dist/modules/save-codec.js');
const root=path.resolve(__dirname,'..');const compiled=new Map();
function script(file){let s=compiled.get(file);if(!s){s=new vm.Script(fs.readFileSync(file,'utf8'),{filename:file});compiled.set(file,s);}return s;}
const MODULES=['era','construction','cargo','machinery','safeguards','combat','zones','missions','hatches','controller'];
// host: {authoritativeZone(id), authoritativeMission(), damage, pvpHit, score, toast, mined}
function createZoneSim(zoneId,host){const element=()=>({style:{},classList:{toggle(){}},getContext:()=>({}),addEventListener(){},querySelectorAll:()=>[],showModal(){},close(){},textContent:'',open:false});const elements={};
 const s={ZoneGenerator:require('../dist/zone-generator.js'),ShipCodec:codec,planck:require('../dist/vendor/planck.min.js'),document:{querySelector:()=>element(),getElementById:id=>elements[id]??=element(),querySelectorAll:()=>[]},window:{addEventListener(){}},localStorage:{getItem(){return null},setItem(){}},requestAnimationFrame(){},setTimeout(){},clearTimeout(){},console,Date,
  authoritativeZone:host.authoritativeZone,authoritativeMission:host.authoritativeMission,hostApi:host};
 vm.createContext(s);const opts={timeout:5000};for(const f of MODULES)script(path.join(root,'dist/modules/'+f+'.js')).runInContext(s,opts);script(path.join(root,'dist/game.js')).runInContext(s,opts);
 s.zoneId=zoneId;vm.runInContext('initialize();zone=zoneId;zoneData={};setupZone(false)',s,opts);script(path.join(__dirname,'zone-runtime.js')).runInContext(s,opts);
 const api=vm.runInContext('({zsAddShip,zsRemoveShip,zsUpdateShip,zsPlaceShip,zsForces,zsStep,zsFire,zsAddLoot,zsClaimLoot,zsDev,zsRegenerate,zsShip,zsSnapshot,fleet})',s,opts);
 return {id:zoneId,api,ships:()=>[...api.fleet.keys()],run:c=>vm.runInContext(c,s,opts),emptySince:Date.now(),snap:null};}
module.exports={createZoneSim};
