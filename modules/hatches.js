'use strict';
// Configurable machines share one right-click menu: an item filter (all / off / whitelist / blacklist) plus
// a per-machine option — loaders: "require output inventory"; stationary pushers: push or pull.
const CONFIGURABLE=['hatch','starter_hatch','loader','pusher_block'];
function hatchAllows(t,type){const mode=t.filterMode||'all',set=new Set(t.filterItems||[]);return mode==='all'||mode==='whitelist'&&set.has(type)||mode==='blacklist'&&!set.has(type);}
function configureHatch(c,mode,list,opts={}){const t=terrainAt(c);if(!t||!CONFIGURABLE.includes(t.type)||piloting||P.Vec2.distance(localPlayer(),V(t.x,t.y))>8||buildBlocked(c,t.f))return false;if(!['all','off','whitelist','blacklist'].includes(mode)||!Array.isArray(list)||list.some(x=>!TYPES.includes(x)))return false;
 t.filterMode=mode;t.filterItems=[...new Set(list)].slice(0,TYPES.length);
 if(t.type==='loader')t.requireOutput=!!opts.requireOutput;
 if(t.type==='pusher_block')t.pull=!!opts.pull;
 save(true);return true;}
const MACHINE_TEXT={
 hatch:['Item hatch','One stack every 1.5 seconds. Output must be clear.'],
 starter_hatch:['Starter hatch','One stack every 1.5 seconds. Output must be clear.'],
 loader:['Item loader','Moves one stack per cycle from the tile behind it to the tile in front (R rotates). Turrets load slowly.'],
 pusher_block:['Pusher','Its beam drives cargo, boxes and crew along the arrow (R rotates).']};
function openHatchMenu(c){const t=terrainAt(c);if(!t||!CONFIGURABLE.includes(t.type))return false;const [title,blurb]=MACHINE_TEXT[t.type];if(P.Vec2.distance(localPlayer(),V(t.x,t.y))>8)return toast('Move closer to configure the '+title.toLowerCase()+'.');
 let dialog=el('hatchmenu');if(!dialog){dialog=document.createElement('dialog');dialog.id='hatchmenu';document.body.appendChild(dialog);}
 const extra=t.type==='loader'?`<label class="hatchoption"><input type="checkbox" id="requireoutput" ${t.requireOutput?'checked':''}> Require output inventory — only deliver into something that holds items (fabricator, box, turret, ejector); never drop on the floor</label>`
  :t.type==='pusher_block'?`<label class="hatchoption">Direction <select id="pushermode"><option value="push">Push — away from the pusher</option><option value="pull">Pull — toward the pusher</option></select></label>`:'';
 dialog.innerHTML=`<h2>${title}</h2><p>${blurb}</p>${extra}<label>Items <select id="hatchmode"><option value="all">Allow all items</option><option value="off">Turn off</option><option value="whitelist">Whitelist — only checked items</option><option value="blacklist">Blacklist — exclude checked items</option></select></label><div class="hatchfilters">${TYPES.map(type=>`<label><input type="checkbox" value="${type}" ${(t.filterItems||[]).includes(type)?'checked':''}>${spriteHTML(type)} ${NAMES[type]}</label>`).join('')}</div><button id="applyhatch">Apply</button> <button id="closehatch">Cancel</button>`;
 el('hatchmode').value=t.filterMode||'all';if(el('pushermode'))el('pushermode').value=t.pull?'pull':'push';
 el('applyhatch').onclick=()=>{configureHatch({x:t.x,y:t.y},el('hatchmode').value,[...dialog.querySelectorAll('.hatchfilters input:checked')].map(e=>e.value),{requireOutput:!!el('requireoutput')?.checked,pull:el('pushermode')?.value==='pull'});dialog.close();};
 el('closehatch').onclick=()=>dialog.close();keys={};dialog.showModal();return true;}
