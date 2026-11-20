'use strict';
// Mission zones (ℵ33): every MISSIONS.intervalSeconds the next zone in MISSIONS.rotation (The Pits, Canary)
// opens for MISSIONS.durationSeconds with a fresh layout. While it runs a gold portal to it stands in every
// Freeport; when it closes, ships still inside are sent home to Freeport I.
//
// Single player keeps the schedule in `missionState` (saved with the ship). On a server the zone bus owns one
// schedule for everybody (authoritativeMission hook) and this file only reads it.
let missionState={active:null,endsIn:0,nextIn:MISSIONS.intervalSeconds,elapsed:0,index:0};
const MISSION_PORTAL={x:-60,y:-28};
function currentMission(){return typeof authoritativeMission==='function'?(authoritativeMission()||missionState):missionState;}
function missionOpen(id){return currentMission().active===id;}
// Extra portals a zone shows because of a running mission (safe zones only).
// The gold mission portal opens only in Sparrow I (not in the Freeports or other zones), at the open spot kept for it.
const MISSION_PORTAL_ZONE='sparrow';
function missionPortals(id=zone,spot=null){const m=currentMission();return m.active&&id===MISSION_PORTAL_ZONE&&spot?[{to:m.active,x:spot.x,y:spot.y,mission:true}]:[];}
function startMission(id){if(!ZONES[id]?.mission)id=MISSIONS.rotation[missionState.index%MISSIONS.rotation.length];
 if(typeof zoneEvent==='function')return zoneEvent({type:'missionStart',zone:id});
 missionState.index=(MISSIONS.rotation.indexOf(id)+1)%MISSIONS.rotation.length;missionState.active=id;missionState.endsIn=zoneDef(id).missionSeconds||MISSIONS.durationSeconds;missionState.cleared=0;missionState.elapsed=0;missionState.nextIn=MISSIONS.intervalSeconds;
 const old=zoneData[id];zoneData[id]={seed:freshSeed(old?.seed),mined:[],loot:[]};if(zone===id){setupZone(true);updateShipMass();}
 toastAll('Mission started: '+zoneDef(id).name+' is open for '+Math.round(MISSIONS.durationSeconds/60)+' minutes. Take the gold portal in Sparrow I.');save(true);return true;}
function endMission(){const id=missionState.active;if(!id)return;missionState.active=null;missionState.endsIn=0;if(zone===id)missionSendHome();else toastAll(zoneDef(id).name+' mission closed.');save(true);}
// Called when the mission this ship is in closes (locally, or from the zone bus).
function missionSendHome(){const was=zoneDef().name;snapshotZone();zone=START_ZONE;setupZone(true,'entry');updateShipMass();save(true);toastAll('The '+was+' mission closed. Your ship was returned to '+zoneDef().name+'.');}
// Sent home: an empty ship after RETURN_SECONDS (the server calls this), or a ship that stays critical that long.
let criticalFor=0;
function homeFreeport(id=zone){return HOME_FREEPORT[id]||START_ZONE;}
function returnToFreeport(reason){criticalFor=0;const home=homeFreeport();if(zone===home||zoneDef().kind==='safe')return false;const was=zoneDef().name;snapshotZone();zone=home;setupZone(true,'entry');updateShipMass();save(true);
 toastAll(reason==='critical'?'Your ship stayed critical for '+RETURN_SECONDS+' seconds and was towed back to '+zoneDef().name+'.':'Your ship was returned from '+was+' to '+zoneDef().name+'.');return true;}
// The clock starts the moment the ship goes critical and keeps running (shields coming back do not stop it); only
// leaving the combat zone (a portal) clears it.
function tickReturn(dt){if(!isCombatZone()){criticalFor=0;return;}if(shipHP<=0||criticalFor>0){criticalFor+=dt;if(criticalFor>=RETURN_SECONDS)returnToFreeport('critical');}}
function tickMissions(dt){renameIn=Math.max(0,renameIn-dt);tickReturn(dt);
 if(typeof authoritativeMission==='function'){const m=authoritativeMission();if(m&&ZONES[zone]?.mission&&m.active!==zone)missionSendHome();refreshTreasure();return;}
 const m=missionState;m.nextIn-=dt;if(m.active){m.elapsed+=dt;m.endsIn-=dt;const d=zoneDef(m.active);if(d.clearToEnd&&zone===m.active){const g=zoneGrid();m.cleared=(zoneData[zone].mined||[]).length/(g.mineable||1);if(m.cleared>=d.clearToEnd)m.endsIn=0;}if(m.endsIn<=0){endMission();m.nextIn=Math.max(m.nextIn,MISSIONS.intervalSeconds-MISSIONS.durationSeconds);}}
 if(m.nextIn<=0&&!m.active)startMission(MISSIONS.rotation[m.index%MISSIONS.rotation.length]);
 refreshTreasure();}
// The Pits (ℵ25): "a new treasure block will spawn every 5 minutes". Which rock cells hold treasure is decided
// by the seed alone (cells ranked by a hash), so every ship in the zone agrees without extra messages: the
// first gen.treasure + (minutes elapsed / 5) ranks are treasure.
const treasureRankCache={};
function treasureRanks(id=zone){const g=zoneGrid(id),seed=zoneData[id]?.seed||0,k=id+':'+seed;if(treasureRankCache[id]?.k===k)return treasureRankCache[id].list;const list=[];
 for(let i=0;i<g.solid.length;i++)if(g.solid[i]&&(!g.kinds||g.kinds[i]===2)){const x=g.minX+i%g.width*g.cell,y=g.minY+Math.floor(i/g.width)*g.cell;list.push({id:key(x,y),h:terrainHash(x*7+seed,y*13-seed)});}
 list.sort((a,b)=>a.h-b.h);
 // The Pits: deal treasure out to the three holes in turn, so every hole's loot room gets its share.
 if(g.pit?.rooms){const per=g.pit.rooms.map(r=>list.filter(c=>{const gx=Math.round((parseFloat(c.id.split(',')[0])-g.minX)/g.cell);return gx>=r.x0&&gx<=r.x1;}));const mixed=[];for(let i=0;per.some(p=>i<p.length);i++)for(const p of per)if(p[i])mixed.push(p[i]);list.splice(0,list.length,...mixed);}
 treasureRankCache[id]={k,list:list.map(r=>r.id)};return treasureRankCache[id].list;}
function treasureTarget(){const def=zoneDef();if(!def.gen?.treasure)return 0;const m=currentMission();return def.gen.treasure+(m.active===zone?Math.floor((m.elapsed||0)/MISSIONS.treasureEverySeconds):0);}
function refreshTreasure(){if(!isCombatZone()||!zoneDef().gen?.treasure)return;const want=treasureTarget(),st=zoneData[zone];if((st.treasure||0)===want)return;st.treasure=want;const ranks=treasureRanks();for(let i=0;i<Math.min(want,ranks.length);i++){const r=rocks.get(ranks[i]);if(r&&r.kind!=='treasure'){r.kind='treasure';r.ore=false;r.hp=r.maxhp=WORLD_TILE_HP.treasure;}}}
function missionClock(t){t=Math.max(0,Math.ceil(t));const h=Math.floor(t/3600),mm=Math.floor(t%3600/60),ss=String(t%60).padStart(2,'0');return h?h+':'+String(mm).padStart(2,'0')+':'+ss:mm+':'+ss;}
// Ship names (ℵ26: renames at most once per hour). Captain-only on a server (checked there).
function renameShip(name){const clean=cleanShipName(name);if(!clean)return toast('Enter a ship name.');if(clean===shipName)return false;if(renameIn>0)return toast('Ships can be renamed once per hour. Next rename in '+missionClock(renameIn)+'.');shipName=clean;renameIn=RENAME_COOLDOWN_SECONDS;toastAll('Ship renamed to '+clean+'.');save(true);return true;}
