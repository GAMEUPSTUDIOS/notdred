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
function openHatchMenu(c){const t=terrainAt(c);if(!t||!CONFIGURABLE.includes(t.type))return false;if(t.type==='pusher_block')return openPusherMenu(t);const [title,blurb]=MACHINE_TEXT[t.type];if(P.Vec2.distance(localPlayer(),V(t.x,t.y))>8)return toast('Move closer to configure the '+title.toLowerCase()+'.');
 let dialog=el('hatchmenu');if(!dialog){dialog=document.createElement('dialog');dialog.id='hatchmenu';document.body.appendChild(dialog);}
 const extra=t.type==='loader'?`<label class="hatchoption"><input type="checkbox" id="requireoutput" ${t.requireOutput?'checked':''}> Require output inventory — only deliver into something that holds items (fabricator, box, turret, ejector); never drop on the floor</label>`
  :t.type==='pusher_block'?`<label class="hatchoption">Direction <select id="pushermode"><option value="push">Push — away from the pusher</option><option value="pull">Pull — toward the pusher</option></select></label>`:'';
 dialog.innerHTML=`<h2>${title}</h2><p>${blurb}</p>${extra}<label>Items <select id="hatchmode"><option value="all">Allow all items</option><option value="off">Turn off</option><option value="whitelist">Whitelist — only checked items</option><option value="blacklist">Blacklist — exclude checked items</option></select></label><div class="hatchfilters">${TYPES.map(type=>`<label><input type="checkbox" value="${type}" ${(t.filterItems||[]).includes(type)?'checked':''}>${spriteHTML(type)} ${NAMES[type]}</label>`).join('')}</div><button id="applyhatch">Apply</button> <button id="closehatch">Cancel</button>`;
 el('hatchmode').value=t.filterMode||'all';if(el('pushermode'))el('pushermode').value=t.pull?'pull':'push';
 el('applyhatch').onclick=()=>{configureHatch({x:t.x,y:t.y},el('hatchmode').value,[...dialog.querySelectorAll('.hatchfilters input:checked')].map(e=>e.value),{requireOutput:!!el('requireoutput')?.checked,pull:el('pushermode')?.value==='pull'});dialog.close();};
 el('closehatch').onclick=()=>dialog.close();keys={};dialog.showModal();return true;}

// ---- Pusher settings window -------------------------------------------------------------------------------------------
// Max. Beam Length and Target Speed with ◀ ▶ steppers, Default Mode and Filtered Mode (push / pull / off), Filter by
// Inventory, and three item filter slots (click a slot to pick an item, Clear to empty it).
const PUSHER_MODE_ICON={push:'<span class="pm-arrows push">↖↗<br>↙↘</span>',pull:'<span class="pm-arrows pull">↘↙<br>↗↖</span>',off:'<span class="pm-off">✕</span>'};
function setPusherRemote(t,settings){if(typeof netActive!=='undefined'&&netActive)return netAction('pusher',{cell:{x:t.x,y:t.y},settings});configurePusher({x:t.x,y:t.y},settings);}
function openPusherMenu(t){if(P.Vec2.distance(localPlayer(),V(t.x,t.y))>8)return toast('Move closer to configure the pusher.');pusherSettings(t);
 const st={maxBeam:t.maxBeam,speed:t.speed,mode:t.mode,filteredMode:t.filteredMode,filterInv:!!t.filterInv,filters:[...(t.filters||[null,null,null])]};
 let d=el('pushermenu');if(!d){d=document.createElement('dialog');d.id='pushermenu';d.className='pushermenu';document.body.appendChild(d);}
 const info=txt=>`<span class="pm-info" title="${escapeHTML(txt)}">i</span>`;
 const stepper=(id,label,tip)=>`<div class="pm-row"><span class="pm-label">${label}</span><button class="pm-step down" data-step="${id}" data-d="-1">◀</button><input class="pm-num" id="pm-${id}" type="number" value="${st[id]}"><button class="pm-step up" data-step="${id}" data-d="1">▶</button>${tip?info(tip):''}</div>`;
 const modes=(id,label,tip)=>`<div class="pm-row"><span class="pm-label">${label}</span>${PUSHER_MODES.map(m=>`<button class="pm-mode ${m}${st[id]===m?' on':''}" data-mode="${id}" data-v="${m}" title="${m==='push'?'Push':m==='pull'?'Pull':'Off'}">${PUSHER_MODE_ICON[m]}</button>`).join('')}${tip?info(tip):''}</div>`;
 const render=()=>{d.innerHTML=`<div class="pm-body">${stepper('maxBeam','Max. Beam Length:')}${stepper('speed','Target Speed:','How fast the pusher drives what it holds, in tiles per second.')}${modes('mode','Default Mode:')}${modes('filteredMode','Filtered Mode:','Used for the first object in the beam when it matches one of the item filters below; everything else uses the default mode.')}
  <div class="pm-row"><button class="pm-check${st.filterInv?' on':''}" id="pm-inv">${st.filterInv?'✓':''}</button><span class="pm-label">Filter by Inventory?</span>${info('Also match expando boxes, machines and crew that are carrying a filtered item, not just loose stacks of it.')}</div>
  <div class="pm-label">Item Filters:</div>${st.filters.map((f,k)=>`<div class="pm-filter"><button class="pm-slot" data-pslot="${k}" title="${f?NAMES[f]:'Click to choose an item'}">${f?spriteHTML(f):''}</button><button class="pm-clear" data-clear="${k}">Clear</button></div>`).join('')}
  <div class="pm-picker" id="pm-picker" hidden></div><p class="pm-actions"><button id="pm-ok" class="primary">Set</button> <button id="pm-cancel">Cancel</button></p></div>`;
  d.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{const id=b.dataset.step,k=id==='maxBeam'?(st.maxBeam>=100?100:10):1;st[id]=Math.max(1,Math.min(id==='maxBeam'?PUSHER_MAX_BEAM:PUSHER_MAX_SPEED,(+el('pm-'+id).value||0)+k*(+b.dataset.d)));render();});
  for(const id of ['maxBeam','speed'])el('pm-'+id).onchange=e=>{st[id]=+e.target.value||st[id];};d.querySelectorAll('.pm-num').forEach(i=>i.addEventListener('keydown',e=>e.stopPropagation()));
  d.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{st[b.dataset.mode]=b.dataset.v;render();});
  el('pm-inv').onclick=()=>{st.filterInv=!st.filterInv;render();};
  d.querySelectorAll('[data-clear]').forEach(b=>b.onclick=()=>{st.filters[+b.dataset.clear]=null;render();});
  d.querySelectorAll('[data-pslot]').forEach(b=>b.onclick=()=>{const k=+b.dataset.pslot,pk=el('pm-picker');pk.hidden=false;pk.innerHTML=TYPES.map(ty=>`<button class="pm-pick" data-type="${ty}" title="${NAMES[ty]}">${spriteHTML(ty)}</button>`).join('');pk.querySelectorAll('[data-type]').forEach(x=>x.onclick=()=>{st.filters[k]=x.dataset.type;render();});});
  el('pm-cancel').onclick=()=>d.close();el('pm-ok').onclick=()=>{for(const id of ['maxBeam','speed'])st[id]=+el('pm-'+id).value||st[id];setPusherRemote(t,st);d.close();};};
 render();keys={};d.showModal();return true;}
