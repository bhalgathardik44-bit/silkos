
const $=s=>document.querySelector(s),desk=$('#desk'),dock=$('#dock');let icons=[],iconOrderReady=false,suppressReorderClick=null;
document.addEventListener('click',event=>{const pending=suppressReorderClick;if(!pending||Date.now()>pending.until||event.detail===0)return;if(event.target.closest(pending.selector)&&pending.container.contains(event.target)){suppressReorderClick=null;event.preventDefault();event.stopImmediatePropagation()}},true);
const apps={
 finder:{n:'Finder',i:'🗂️',c:'linear-gradient(#6fd0ff,#1a7cff)',w:760,h:480,html:()=>'<div></div>',init:finderInit},
 browser:{n:'Browser',i:'🧭',c:'linear-gradient(#5ac8fa,#0a60ff)',w:1000,h:640,html:()=>`<div class="bwrap"><div class="stabs"></div><div class="main"><div class="side"><div></div></div><div class="pages"><div class="start"></div></div></div><div class="ov"></div></div>`,init:browserInit},
 notes:{n:'Notes',i:'📝',c:'linear-gradient(#ffd54a,#ff9f0a)',w:1080,h:700,html:()=>'<div></div>',init:notesInit},
 terminal:{n:'Terminal',i:'⌨️',c:'linear-gradient(#444,#111)',run:()=>window.silk&&silk.terminal()},
 calc:{n:'Calculator',i:'🧮',c:'linear-gradient(#555,#222)',w:260,h:360,html:()=>'<div class="calc"><div class="scr">0</div>'+['C','±','%','÷',7,8,9,'×',4,5,6,'−',1,2,3,'+',0,'.','=',''].map(k=>k===''?'<button disabled></button>':`<button class="${'÷×−+='.includes(k)?'op':''}">${k}</button>`).join('')+'</div>',init:calcInit},
 store:{n:'Store',i:'🛍️',c:'linear-gradient(#3fc5ff,#1a5cff)',w:720,h:540,html:()=>'<div></div>',init:storeInit},
 monitor:{n:'System Monitor',i:'📊',c:'linear-gradient(#34c759,#168c43)',w:900,h:600,html:()=>'<div></div>',init:resourcesInit},
 settings:{n:'Settings',i:'⚙️',c:'#888',w:780,h:540,html:()=>'<div></div>',init:settingsInit}
};
const SVG={
browser:`<svg viewBox="0 0 100 100"><defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6ad0ff"/><stop offset="1" stop-color="#0a5cff"/></linearGradient><linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#d6e6ff"/></linearGradient></defs><rect width="100" height="100" fill="url(#g1)"/><circle cx="50" cy="50" r="35" fill="url(#g2)"/><circle cx="50" cy="50" r="31" fill="none" stroke="#9db9e6" stroke-width="1.2" stroke-dasharray="1 4.4" stroke-linecap="round"/><g stroke="#8aa6d6" stroke-width="2.2" stroke-linecap="round"><path d="M50 19.500v5M50 75.500v5M19.500 50h5M75.500 50h5"/></g><g transform="rotate(45 50 50)"><path d="M50 24 58.500 50H41.500Z" fill="#ff453a"/><path d="M50 76 41.500 50H58.500Z" fill="#a9b6cc"/></g><circle cx="50" cy="50" r="2.600" fill="#fff"/></svg>`,
notes:`<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#fffdf6"/><rect width="100" height="29" fill="#ffd60a"/><rect y="29" width="100" height="2" fill="#000" opacity=".08"/><g stroke="#e4dfcf" stroke-width="2.400" stroke-linecap="round"><path d="M15 46h70M15 59h70M15 72h70M15 85h40"/></g><path d="M15 46h28" stroke="#c9c2ab" stroke-width="2.400" stroke-linecap="round"/></svg>`,
calc:`<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#1c1c1e"/><rect x="9" y="9" width="82" height="24" rx="8" fill="#2c2c2e"/><text x="84" y="28" text-anchor="end" font-family="-apple-system,Segoe UI,sans-serif" font-size="17" font-weight="300" fill="#fff">42</text><g fill="#a5a5a5"><circle cx="22" cy="48" r="8.500"/><circle cx="41" cy="48" r="8.500"/><circle cx="60" cy="48" r="8.500"/></g><g fill="#3a3a3c"><circle cx="22" cy="67" r="8.500"/><circle cx="41" cy="67" r="8.500"/><circle cx="60" cy="67" r="8.500"/><circle cx="22" cy="86" r="8.500"/><circle cx="41" cy="86" r="8.500"/><circle cx="60" cy="86" r="8.500"/></g><g fill="#ff9f0a"><circle cx="79" cy="48" r="8.500"/><circle cx="79" cy="67" r="8.500"/><circle cx="79" cy="86" r="8.500"/></g></svg>`,
about:`<svg viewBox="0 0 100 100"><defs><linearGradient id="g3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9a8cff"/><stop offset="1" stop-color="#5b2bff"/></linearGradient></defs><rect width="100" height="100" fill="url(#g3)"/><path d="M50 16c3 20 14 31 34 34-20 3-31 14-34 34-3-20-14-31-34-34 20-3 31-14 34-34z" fill="#fff"/><path d="M78 14c1 6 4 9 10 10-6 1-9 4-10 10-1-6-4-9-10-10 6-1 9-4 10-10z" fill="#fff" opacity=".8"/></svg>`};
SVG.settings=`<svg viewBox="0 0 100 100"><defs><linearGradient id="g4" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a5aab3"/><stop offset="1" stop-color="#5d626b"/></linearGradient></defs><rect width="100" height="100" fill="url(#g4)"/><g fill="#eceef1"><rect x="44" y="16" width="12" height="17" rx="3" transform="rotate(0 50 50)"/><rect x="44" y="16" width="12" height="17" rx="3" transform="rotate(45 50 50)"/><rect x="44" y="16" width="12" height="17" rx="3" transform="rotate(90 50 50)"/><rect x="44" y="16" width="12" height="17" rx="3" transform="rotate(135 50 50)"/><rect x="44" y="16" width="12" height="17" rx="3" transform="rotate(180 50 50)"/><rect x="44" y="16" width="12" height="17" rx="3" transform="rotate(225 50 50)"/><rect x="44" y="16" width="12" height="17" rx="3" transform="rotate(270 50 50)"/><rect x="44" y="16" width="12" height="17" rx="3" transform="rotate(315 50 50)"/><circle cx="50" cy="50" r="27"/></g><circle cx="50" cy="50" r="12" fill="#6a6f78"/></svg>`;SVG.finder=`<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#8fd8ff"/><path d="M0 0h56q-10 25-6 52h-6q-2 22 6 48H0z" fill="#1a7cff"/><rect x="30" y="30" width="6" height="14" rx="3" fill="#123"/><rect x="64" y="30" width="6" height="14" rx="3" fill="#123"/><path d="M26 66q24 16 48 0" fill="none" stroke="#123" stroke-width="5" stroke-linecap="round"/></svg>`;SVG.terminal=`<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#222"/><path d="M24 34l16 14-16 14" stroke="#e6e6e6" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M46 66h28" stroke="#e6e6e6" stroke-width="6" stroke-linecap="round"/></svg>`;SVG.store=`<svg viewBox="0 0 100 100"><defs><linearGradient id="g5" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3fc5ff"/><stop offset="1" stop-color="#1a5cff"/></linearGradient></defs><rect width="100" height="100" fill="url(#g5)"/><path d="M39 38v-5a11 11 0 0 1 22 0v5" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><rect x="25" y="37" width="50" height="42" rx="9" fill="#fff"/><path d="M50 47v19M42 59l8 8 8-8" fill="none" stroke="#1a5cff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;Object.keys(SVG).forEach(k=>apps[k]&&(apps[k].svg=SVG[k]));
apps.monitor.svg='<svg viewBox="0 0 100 100"><defs><linearGradient id="gm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#34c759"/><stop offset="1" stop-color="#168c43"/></linearGradient></defs><rect width="100" height="100" fill="url(#gm)"/><rect x="17" y="20" width="66" height="58" rx="8" fill="#fff" opacity=".95"/><path d="M25 67h9V51h-9zm15 0h9V39h-9zm15 0h9V47h-9zm15 0h9V31h-9z" fill="#34c759"/></svg>';
const UI_ICON={
 gear:'<path d="M12 8.3a3.7 3.7 0 1 0 0 7.4 3.7 3.7 0 0 0 0-7.4Z"/><path d="m19.4 13.5 1.1.8-1.6 2.8-1.3-.5a7.7 7.7 0 0 1-1.7 1l-.2 1.4h-3.3l-.2-1.4a7.7 7.7 0 0 1-1.7-1l-1.3.5-1.6-2.8 1.1-.8a7.5 7.5 0 0 1 0-2l-1.1-.8 1.6-2.8 1.3.5a7.7 7.7 0 0 1 1.7-1l.2-1.4h3.3l.2 1.4a7.7 7.7 0 0 1 1.7 1l1.3-.5 1.6 2.8-1.1.8a7.5 7.5 0 0 1 0 2Z" transform="translate(-1.5 -1.5) scale(.96)"/>',
 palette:'<path d="M12 3.2a8.8 8.8 0 1 0 0 17.6h1.1a2.1 2.1 0 0 0 1.7-3.3 1.3 1.3 0 0 1 1-2.1h1.1a4.9 4.9 0 0 0 4.9-4.9c0-4-4.4-7.3-9.8-7.3Z"/><circle cx="7.6" cy="11.1" r=".9" fill="currentColor"/><circle cx="10.6" cy="7.6" r=".9" fill="currentColor"/><circle cx="15" cy="7.7" r=".9" fill="currentColor"/><circle cx="18" cy="11.1" r=".9" fill="currentColor"/>',
 rocket:'<path d="M14.4 4.1c2.4-1.5 4.7-1.7 5.5-1.7 0 .8-.2 3.1-1.7 5.5l-4.6 6.4-5.6.1.1-5.6 6.3-4.7Z"/><path d="m8.2 8.6-3.4.7-2 2.6 5.3.6m5.9 1.5-.7 3.4-2.6 2-.6-5.3"/><circle cx="15.7" cy="8.3" r="1.5"/><path d="M6.5 15.7c-1.8.4-2.4 1.9-2.7 4.5 2.6-.3 4.1-.9 4.5-2.7"/>',
 dock:'<rect x="3" y="4" width="18" height="13" rx="2.5"/><path d="M8 21h8m-4-4v4"/><path d="M6.5 14h2m2-3h2m2 3h2m2-3h1"/>',
 window:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18"/><circle cx="6.5" cy="6.5" r=".6" fill="currentColor"/><circle cx="9" cy="6.5" r=".6" fill="currentColor"/><path d="M12 12v5m0-5h5m-5 5h5"/>',
 keyboard:'<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M6 9h.01M9 9h.01M12 9h.01M15 9h.01M18 9h.01M6 12h.01M9 12h.01M12 12h.01M15 12h.01M18 12h.01M8 15.5h8"/>',
 access:'<circle cx="12" cy="5" r="2"/><path d="m5 9 7 1 7-1m-7 1v5m0-5-4 7m4-7 4 7m-4-2v5"/>',
 display:'<rect x="2.5" y="4" width="19" height="13" rx="2.5"/><path d="M8 21h8m-4-4v4"/><path d="m9 10 2 2 4-4"/>',
 folder:'<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><path d="M3 10h18"/>',
 browser:'<circle cx="12" cy="12" r="9"/><path d="m14.8 9.2-1.9 4.1-4.1 1.9 1.9-4.1 4.1-1.9Z"/><path d="M12 3v2m9 7h-2M5 12H3m9 9v-2"/>',
 lock:'<rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>',
 storage:'<ellipse cx="12" cy="5" rx="8.5" ry="3"/><path d="M3.5 5v7c0 1.7 3.8 3 8.5 3s8.5-1.3 8.5-3V5m-17 7v7c0 1.7 3.8 3 8.5 3s8.5-1.3 8.5-3v-7"/><path d="M6.5 10c1.4.6 3.3 1 5.5 1"/>',
 globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
 search:'<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/>',
 bookmark:'<path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-4-6 4V4.5Z"/>',
 history:'<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5m4-1v5l3 2"/>'
};
const uiIcon=(name)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${UI_ICON[name]||UI_ICON.globe}</svg>`;
apps.browser.svg=`<svg viewBox="0 0 100 100"><defs><linearGradient id="brass" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f8fbff"/><stop offset="1" stop-color="#b9d5ff"/></linearGradient><linearGradient id="needle" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ff735f"/><stop offset="1" stop-color="#cc274d"/></linearGradient></defs><rect width="100" height="100" rx="24" fill="url(#g1)"/><circle cx="50" cy="50" r="36" fill="#101c40" opacity=".18"/><circle cx="50" cy="48" r="33" fill="url(#brass)"/><circle cx="50" cy="48" r="28" fill="#f3f7ff" stroke="#7186a8" stroke-width="1.5"/><circle cx="50" cy="48" r="23" fill="none" stroke="#8195b4" stroke-width="1" stroke-dasharray="1 5" stroke-linecap="round"/><path d="m50 23 8 26-8-4-8 4 8-26Z" fill="url(#needle)"/><path d="m50 73-8-25 8 4 8-4-8 25Z" fill="#60738f"/><circle cx="50" cy="48" r="3.3" fill="#fff" stroke="#60738f" stroke-width="1.4"/></svg>`;
apps.finder.svg=`<svg viewBox="0 0 100 100"><defs><linearGradient id="face" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#b9efff"/><stop offset="1" stop-color="#65baff"/></linearGradient></defs><rect width="100" height="100" rx="23" fill="url(#face)"/><path d="M0 0h56c-9 22-10 48-5 100H0V0Z" fill="#1880ee"/><path d="M54 9c-7 24-7 54-3 82" fill="none" stroke="#fff" stroke-opacity=".65" stroke-width="2"/><path d="M29 34v12m39-12v12" fill="none" stroke="#123b67" stroke-width="5" stroke-linecap="round"/><path d="M25 66c14 17 38 17 52 0" fill="none" stroke="#123b67" stroke-width="4" stroke-linecap="round"/><circle cx="28" cy="30" r="2" fill="#fff" opacity=".7"/></svg>`;
let z=10,wins={};
function dockIcon(id){return dock.querySelector(`[data-id="${CSS.escape(id)}"]`)}
function addIcon(id){const a=apps[id];
 const d=document.createElement('div');d.className='ic';d.dataset.id=id;d.setAttribute('role','button');d.tabIndex=0;d.setAttribute('aria-label',`${a.n}. Drag to reorder.`);d.style.background=a.c;d._s=1;
 d.draggable=false;d.innerHTML=`<i>${a.svg||a.i}</i><span class="tip">${a.n}</span>`;d.onclick=()=>launch(id);d.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();launch(id)}};dock.appendChild(d);icons.push(d);if(iconOrderReady){applySavedOrder(dock,'.ic','dockOrder');queueMicrotask(measureDock)}}
Object.keys(apps).forEach(addIcon);
const DEF={theme:'auto',accent:'#0a60ff',wall:0,wallpaperImage:'',lite:false,quietMode:false,wallpaperMotion:true,dock:56,mag:true,magAmt:1.7,hide:false,dockOrder:[],launchpadOrder:[],engine:'google',sugg:true,bri:100,
 clock24:false,clockSeconds:false,showDate:true,dockPosition:'bottom',centerWindows:false,rememberWindows:false,windowScale:1,titlebarDoubleClick:true,confirmClose:false,reduceMotion:false,highContrast:false,cursorSize:1,showSwitcherIcons:true,switcherStyle:'grid',switcherOrder:'recent',includeMinimized:true,volume:50,lastAudibleVolume:50,muted:false,showHiddenFiles:false,hideFileExtensions:false,finderLocation:'home',finderSort:'folders',startBrowser:true,restoreWindows:false,tapToClick:false};
const cfg=Object.assign({},DEF,(()=>{try{return JSON.parse(localStorage.getItem('silk.cfg'))||{}}catch(e){return{}}})());
let activeSpace=0,spacesAvailable=false,workspaceNames=Array.from({length:4},(_,index)=>`Desktop ${index+1}`);
function normalizedIconOrder(order,ids){const available=new Set(ids);return[...new Set((Array.isArray(order)?order:[]).filter(id=>typeof id==='string'&&available.has(id))),...ids.filter(id=>!Array.isArray(order)||!order.includes(id))]}
function orderedIconIds(ids,key){const available=new Set(ids),order=Array.isArray(cfg[key])?cfg[key]:[];return[...order.filter(id=>available.has(id)),...ids.filter(id=>!order.includes(id))]}
function applySavedOrder(container,selector,key){const ids=[...container.querySelectorAll(selector)].map(item=>item.dataset.id),order=normalizedIconOrder(cfg[key],ids),nodes=new Map([...container.querySelectorAll(selector)].map(item=>[item.dataset.id,item]));order.forEach(id=>container.appendChild(nodes.get(id)));cfg[key]=order}
iconOrderReady=true;applySavedOrder(dock,'.ic','dockOrder');
function setupIconReordering(container,selector,key){
 let state=null;
 const items=()=>[...container.querySelectorAll(selector)];
 const animateReflow=before=>items().forEach(item=>{const old=before.get(item);item._reflowAnimation?.cancel();if(!old||cfg.reduceMotion)return;const rect=item.getBoundingClientRect(),dx=old.left-rect.left,dy=old.top-rect.top;if(Math.abs(dx)+Math.abs(dy)<1)return;item._reflowAnimation=item.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:'translate(0,0)'}],{duration:220,easing:'cubic-bezier(.2,.8,.2,1)'})});
 const reorderAt=(x,y)=>{
  if(!state)return;
  if(container===dock){
   const rect=container.getBoundingClientRect(),vertical=cfg.dockPosition!=='bottom',coordinate=vertical?y-rect.top:x-rect.left;
   const target=items().find(item=>item!==state.item&&coordinate<(vertical?item.offsetTop+item.offsetHeight/2:item.offsetLeft+item.offsetWidth/2))||null;
   if(state.item.nextElementSibling===target)return;
   const before=new Map(items().map(item=>[item,item.getBoundingClientRect()]));container.insertBefore(state.item,target);animateReflow(before);syncIconOrder();return
  }
  const target=document.elementFromPoint(x,y)?.closest(selector);
  if(!target||target===state.item||!container.contains(target))return;
  const rect=target.getBoundingClientRect(),vertical=container===dock&&cfg.dockPosition!=='bottom';
  const after=vertical?y>rect.top+rect.height/2:x>rect.left+rect.width/2;
  if(after?target.nextElementSibling===state.item:state.item.nextElementSibling===target)return;
  const before=new Map(items().map(item=>[item,item.getBoundingClientRect()]));
  container.insertBefore(state.item,after?target.nextSibling:target);
  animateReflow(before);
 };
 container.addEventListener('pointerdown',event=>{
  if(event.button!==0||event.target.closest('button,input,textarea,select')||!event.target.closest(selector))return;
  const item=event.target.closest(selector);state={item,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,moved:false,ghost:null};
 });
 const move=event=>{
  if(!state||event.pointerId!==state.pointerId)return;
  if(!(event.buttons&1)){finish(event);return}
  state.x=event.clientX;state.y=event.clientY;
  if(!state.moved&&Math.hypot(event.clientX-state.startX,event.clientY-state.startY)<6)return;
  if(!state.moved){
   state.moved=true;event.preventDefault();container.setPointerCapture(state.pointerId);state.item.classList.add('dragging');
   const icon=state.item.getBoundingClientRect();state.ghost=state.item.cloneNode(true);state.ghost.classList.add('icon-drag-ghost');state.ghost.classList.remove('on','dragging','drop-target');state.ghost.style.cssText+=`;left:${state.startX-icon.width/2}px;top:${state.startY-icon.height/2}px;width:${icon.width}px;height:${icon.height}px`;
   document.body.appendChild(state.ghost);
   if(container===dock){dockDragging=true;resetDockMagnification()}
  }
  if(state.ghost)state.ghost.style.transform=`translate(${event.clientX-state.startX}px,${event.clientY-state.startY}px) scale(1.08)`;
  reorderAt(event.clientX,event.clientY);
 };
 const finish=event=>{
  if(!state||event.pointerId!==state.pointerId)return;
  if(state.moved){suppressReorderClick={container,selector,until:Date.now()+500};state.item.classList.remove('dragging');state.ghost?.remove();cfg[key]=items().map(item=>item.dataset.id);save();if(container===dock){dockDragging=false;measureDock()}}
  const pointerId=state.pointerId;state=null;if(container.hasPointerCapture(pointerId))container.releasePointerCapture(pointerId);
 };
 container.addEventListener('lostpointercapture',finish);
 container.addEventListener('dragstart',event=>{if(event.target.closest(selector))event.preventDefault()});
 window.addEventListener('pointermove',move,{capture:true});
 window.addEventListener('pointerup',finish,{capture:true});
 window.addEventListener('pointercancel',finish,{capture:true});
 window.addEventListener('blur',()=>{if(state)finish({pointerId:state.pointerId})});
}
function syncFlatpaks(){const S=window.silk&&silk.store;S&&S.installed().then(r=>{if(r.error)throw new Error(r.error);(r.apps||[]).forEach(a=>{if(apps[a.id])return;
 apps[a.id]={n:a.name||a.id,i:esc((a.name||'?')[0]),c:'linear-gradient(#5ac8fa,#0a60ff)',run:()=>S.run(a.id).then(r=>r&&r.error&&alert('Could not open '+(a.name||a.id)+':\n'+r.error)),svg:a.icon?`<img src="file://${esc(encodeURI(a.icon))}" style="width:100%;height:100%;object-fit:contain">`:`<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#0a60ff"/><text x="50" y="66" font-size="48" text-anchor="middle" fill="#fff" font-family="sans-serif">${esc((a.name||'?')[0])}</text></svg>`};addIcon(a.id)})})
 .catch(error=>console.error('Could not load installed Store apps:',error))}
const LPSVG='<svg viewBox="0 0 100 100"><defs><linearGradient id="glp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef0f4"/><stop offset="1" stop-color="#b4bac6"/></linearGradient></defs><rect width="100" height="100" fill="url(#glp)"/>'+[['#ff5f57','#febc2e','#28c840'],['#5ac8fa','#0a84ff','#af52de'],['#ff2d92','#ff9500','#34c759']].map((r,y)=>r.map((c,x)=>`<rect x="${20+x*22}" y="${20+y*22}" width="16" height="16" rx="4.500" fill="${c}"/>`).join('')).join('')+'</svg>';
{const d=document.createElement('div');d.className='ic';d.dataset.id='launchpad';d.draggable=false;d.setAttribute('role','button');d.tabIndex=0;d.setAttribute('aria-label','Launchpad. Drag to reorder.');d.innerHTML=`<i>${LPSVG}</i><span class="tip">Launchpad</span>`;d.onclick=()=>launchpad();d.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();launchpad()}};dock.prepend(d);icons.unshift(d);applySavedOrder(dock,'.ic','dockOrder')}
setupIconReordering(dock,'.ic','dockOrder');
function refreshDockIndicators(){icons.forEach(icon=>icon.classList.toggle('on',!!wins[icon.dataset.id]&&wins[icon.dataset.id].dataset.space===String(activeSpace)&&!wins[icon.dataset.id].classList.contains('min')))}
let spaceGesture=null,spaceSettleTimer=null,spaceTransition=null,spaceChangedAt=0;
/* A gesture commits when the finger crosses half the screen, or sooner when it is clearly a flick. */
const shouldCommit=state=>state.progress>=.5||state.progress>=.2&&state.speed>=.9;
/* Only real finger movement counts: a paused finger lets the flick reading expire. */
function trackGestureSpeed(state,progress){
 const now=performance.now(),next=Math.max(0,Math.min(1,progress)),delta=Math.abs(next-state.progress);
 if(delta>.002){
  if(state.lastMove)state.speed=delta/(Math.max(8,now-state.lastMove)/1000);
  state.lastMove=now
 }else if(now-state.lastMove>140)state.speed=0
}
function updateSpaceGesture(state,progress){
 trackGestureSpeed(state,progress);
 state.progress=Math.max(0,Math.min(1,progress));
 const width=innerWidth,offset=state.progress*width,direction=state.direction;
 $('#wall').style.setProperty('--space-swipe-x',`${-direction*offset}px`);
 state.incomingWall.style.setProperty('--space-swipe-x',`${direction*(width-offset)}px`);
 Object.values(wins).forEach(win=>{
  if(!win.classList.contains('space-swipe'))return;
  const isOutgoing=Number(win.dataset.space)===state.from;
  win.style.setProperty('--space-swipe-x',`${isOutgoing?-direction*offset:direction*(width-offset)}px`)
 })
}
function clearSpaceGesture(state){
 document.body.classList.remove('space-swipe-active','space-swipe-settling');
 $('#wall').classList.remove('space-swipe-outgoing');
 $('#wall').style.removeProperty('--space-swipe-x');
 state.incomingWall.remove();
 Object.values(wins).forEach(win=>{
  win.classList.remove('space-swipe','space-swipe-settling');
  win.style.removeProperty('--space-swipe-x');
  if(Number(win.dataset.space)===activeSpace&&!win.classList.contains('min'))win.classList.remove('space-hidden');
  else win.classList.add('space-hidden')
 });
 if(spaceTransition===state){spaceTransition=null;document.documentElement.style.removeProperty('--space-settle')}
 spaceSettleTimer=null;syncFullscreenChrome()
}
function beginSpaceGesture(direction){
 if(lpOn()||![-1,1].includes(direction))return null;
 if(desktopExposed)restoreDesktop();
 if(spaceGesture)finishSpaceGesture(false,true);
 if(spaceSettleTimer&&spaceTransition){clearTimeout(spaceSettleTimer);clearSpaceGesture(spaceTransition)}
 const wall=$('#wall'),incomingWall=document.createElement('div');
 incomingWall.className='space-swipe-wall-incoming';incomingWall.style.background=getComputedStyle(wall).background;
 document.body.insertBefore(incomingWall,$('#menubar'));
 const state={from:activeSpace,to:(activeSpace+direction+4)%4,direction,progress:0,speed:0,lastMove:0,incomingWall};
 spaceGesture=spaceTransition=state;document.body.classList.add('space-swipe-active');wall.classList.add('space-swipe-outgoing');
 Object.values(wins).forEach(win=>{
  const desktop=Number(win.dataset.space);
  if((desktop===state.from||desktop===state.to)&&!win.classList.contains('min')&&!win.classList.contains('closing')){
   win.classList.remove('space-hidden','space-leaving','space-entering');win.style.display='';win.classList.add('space-swipe')
  }
 });
 updateSpaceGesture(state,0);syncFullscreenChrome();
 return state
}
function finishSpaceGesture(commit,immediate=false){
 const state=spaceGesture;if(!state)return;
 spaceGesture=null;
 const completed=commit&&shouldCommit(state);
 if(completed){activeSpace=state.to;spaceChangedAt=performance.now();updateSpaceButton();refreshDockIndicators();if(lpOn())launchpad(false)}
 if(immediate){clearSpaceGesture(state);return}
 const settle=Math.round(130+Math.abs((completed?1:0)-state.progress)*240);
 document.documentElement.style.setProperty('--space-settle',`${settle}ms`);
 document.body.classList.add('space-swipe-settling');
 Object.values(wins).forEach(win=>{if(win.classList.contains('space-swipe'))win.classList.add('space-swipe-settling')});
 state.incomingWall.classList.add('space-swipe-settling');
 updateSpaceGesture(state,completed?1:0);
 if(completed&&window.silk?.platform==='linux'&&silk.workspaces){
  silk.workspaces.switchTo(state.to).then(result=>{if(!result?.ok)console.error('Could not switch desktop workspace:',result?.error||'unknown error')}).catch(error=>console.error('Could not switch desktop workspace:',error))
 }
 spaceSettleTimer=setTimeout(()=>clearSpaceGesture(state),settle+30)
}
async function switchSpace(index,syncSystem=true,direction){
 if(!Number.isInteger(index)||index<0||index>3)return;
 if(desktopExposed)restoreDesktop();
 if(spaceGesture)finishSpaceGesture(false,true);
 if(spaceSettleTimer&&spaceTransition){clearTimeout(spaceSettleTimer);clearSpaceGesture(spaceTransition)}
 const previous=activeSpace;if(index===previous){updateSpaceButton();return}
 const travel=direction|| (index>previous?1:-1);
 activeSpace=index;spaceChangedAt=performance.now();
 Object.entries(wins).forEach(([id,win])=>{
  win.style.setProperty('--space-exit-x',`${-travel*18}px`);win.style.setProperty('--space-enter-x',`${travel*18}px`);
  if(win.dataset.space===String(index)){
   win.classList.remove('space-hidden','space-leaving');win.style.display='';
   if(!win.classList.contains('min')&&!cfg.reduceMotion){win.classList.add('space-entering');void win.offsetWidth;requestAnimationFrame(()=>win.classList.remove('space-entering'))}
  }else if(win.dataset.space===String(previous)&&!win.classList.contains('min')&&!cfg.reduceMotion){
   win.classList.add('space-leaving');setTimeout(()=>{if(activeSpace!==Number(win.dataset.space)){win.classList.add('space-hidden');win.classList.remove('space-leaving')}},280)
  }else{win.classList.add('space-hidden');win.classList.remove('space-leaving','space-entering')}
 });
 if(lpOn())launchpad(false);
 refreshDockIndicators();updateSpaceButton();syncFullscreenChrome();
 if(switchState)paintSwitcher();
 if(syncSystem&&window.silk?.platform==='linux'&&silk.workspaces){
  try{const result=await silk.workspaces.switchTo(index);if(!result?.ok)console.error('Could not switch desktop workspace:',result?.error||'unknown error')}
  catch(error){console.error('Could not switch desktop workspace:',error)}
 }
}
async function syncSystemWorkspace(){
 if(window.silk?.platform!=='linux'||!silk.workspaces)return;
 try{
  const askedAt=performance.now();
  const result=await silk.workspaces.list();spacesAvailable=!!result?.available;
  if(!result?.available)return;
  /* A poll that started before a local switch, or lands while one is still reaching the window manager, holds the old desktop and would snap the shell back to it. */
  if(spaceGesture||spaceSettleTimer||spaceChangedAt>askedAt||performance.now()-spaceChangedAt<1500)return;
  const names=Array.from({length:4},(_,index)=>result.workspaces[index]?.name||`Desktop ${index+1}`);
  if(names.some((name,index)=>name!==workspaceNames[index])){workspaceNames=names;updateSpaceButton()}
  if(Number.isInteger(result.current)&&result.current!==activeSpace)switchSpace(result.current,false)
 }
 catch(error){console.error('Could not read desktop workspace:',error);spacesAvailable=false}
}
function launch(id){
 if(apps[id].run){apps[id].run();return}
 const ic=dockIcon(id),w=wins[id];
 if(w){ if(Number(w.dataset.space)!==activeSpace){switchSpace(Number(w.dataset.space))}if(w.classList.contains('min')){restore(w,id)}focus(w,id); return }
 ic.classList.remove('bounce');void ic.offsetWidth;ic.classList.add('bounce');ic.classList.add('on');
 const a=apps[id],el=document.createElement('div');el.className='win';
 const n=Object.keys(wins).length,minWidth=Math.min(260,Math.max(160,innerWidth-16)),width=Math.min(a.w*cfg.windowScale,Math.max(minWidth,innerWidth-16)),height=Math.min(a.h*cfg.windowScale,Math.max(120,innerHeight-110)),saved=cfg.rememberWindows?getWindowBounds(id):null;
 const left=Math.max(8,Math.min(innerWidth-width-8,saved?Number(saved.left):cfg.centerWindows?(innerWidth-width)/2:(innerWidth-width)/2+n*28-40));
 const top=Math.max(28,Math.min(innerHeight-height-8,saved?Number(saved.top):cfg.centerWindows?(innerHeight-height)/2:(innerHeight-height)/2+n*28-70));
 const restoredWidth=saved?Math.min(innerWidth-16,Math.max(minWidth,Number(saved.width)||width)):width,restoredHeight=saved?Math.min(innerHeight-36,Math.max(120,Number(saved.height)||height)):height;
 el.style.cssText=`min-width:${minWidth}px;width:${restoredWidth}px;height:${restoredHeight}px;left:${Math.max(8,Math.min(innerWidth-restoredWidth-8,left))}px;top:${Math.max(28,Math.min(innerHeight-restoredHeight-8,top))}px`;
 el.innerHTML=`<div class="tb"><button class="dot r"></button><button class="dot y"></button><button class="dot g"></button><span class="t">${a.n}</span></div><div class="body">${a.html()}</div>`;
 el.dataset.space=String(activeSpace);desk.appendChild(el);wins[id]=el;saveSessionWindows();
 const showTimer=setTimeout(()=>{el.classList.add('show');focus(el,id)},180);
 a.init&&a.init(el);
 const [r,y,g]=el.querySelectorAll('.dot');
 g.title='Enter Full Screen';g.setAttribute('aria-label',g.title);
 r.onclick=e=>{e.stopPropagation();if(cfg.confirmClose&&!confirm(`Close ${a.n}?`))return;clearTimeout(showTimer);clearTimeout(el._boundsTimer);el._dispose?.();saveWindowBounds(id,el);el.classList.remove('show');el.classList.add('closing');ic.classList.remove('on');delete wins[id];saveSessionWindows();if(curApp===id){curApp=null;buildBar()}syncFullscreenChrome();setTimeout(()=>el.remove(),260)};
 y.onclick=e=>{e.stopPropagation();minimize(el,id)};
 g.onclick=e=>{e.stopPropagation();fullscreenToggle(el)};
 el.addEventListener('pointerdown',()=>focus(el,id));
 dragify(el,el.querySelector('.tb'));resizify(el);
}
function focus(el,id){el.style.zIndex=++z;curApp=id;Object.values(wins).forEach(w=>w.classList.toggle('inactive',w!==el));buildBar();syncFullscreenChrome()}
function getWindowBounds(id){try{const all=JSON.parse(localStorage.getItem('silk.windows')||'{}');const value=all[id];return value&&['left','top','width','height'].every(k=>Number.isFinite(Number(value[k])))?value:null}catch{return null}}
function saveWindowBounds(id,el){if(!cfg.rememberWindows||el.dataset.max||el.dataset.fullscreen)return;try{const all=JSON.parse(localStorage.getItem('silk.windows')||'{}');all[id]={left:parseFloat(el.style.left),top:parseFloat(el.style.top),width:parseFloat(el.style.width),height:parseFloat(el.style.height)};localStorage.setItem('silk.windows',JSON.stringify(all))}catch(e){console.error('Could not save window placement:',e)}}
function saveSessionWindows(){if(!cfg.restoreWindows)return;try{localStorage.setItem('silk.session',JSON.stringify(Object.entries(wins).filter(([,win])=>win.isConnected&&!win.classList.contains('closing')).map(([id])=>id)))}catch(e){console.error('Could not save the open app session:',e)}}
function getSavedSessionWindows(){if(!cfg.restoreWindows)return[];try{const ids=JSON.parse(localStorage.getItem('silk.session')||'[]');return Array.isArray(ids)?[...new Set(ids.filter(id=>typeof id==='string'&&apps[id]&&!apps[id].run))]:[]}catch(e){console.error('Could not read the saved app session:',e);return[]}}
window.addEventListener('beforeunload',()=>{saveSessionWindows();Object.values(wins).forEach(el=>el._dispose?.())});
function minimize(el,id){
 saveWindowBounds(id,el);
 const r=el.getBoundingClientRect(),i=dockIcon(id).getBoundingClientRect();
 el.style.transformOrigin=`${i.left+i.width/2-r.left}px ${i.top+i.height/2-r.top}px`;
 el.classList.remove('show');el.classList.add('min');el.classList.add('inactive');curApp=null;buildBar();syncFullscreenChrome()}
function restore(el,id){
 el.classList.remove('min','inactive');void el.offsetWidth;el.classList.add('show');syncFullscreenChrome()}
function syncFullscreenChrome(){
 const top=Object.values(wins).filter(win=>Number(win.dataset.space)===activeSpace&&win.classList.contains('show')&&!win.classList.contains('min')&&!win.classList.contains('closing')).sort((a,b)=>Number(b.style.zIndex)-Number(a.style.zIndex))[0];
 const fullscreen=!!top?.dataset.fullscreen&&!document.body.classList.contains('launchpad-open')&&!document.body.classList.contains('desk-expose')&&!document.body.classList.contains('space-swipe-active');
 if(fullscreen&&!document.body.classList.contains('app-fullscreen'))resetDockMagnification();
 document.body.classList.toggle('app-fullscreen',fullscreen);
 if(!fullscreen)document.body.classList.remove('fullscreen-menu-visible','fullscreen-dock-visible');
}
function updateFullscreenChromePointer(event){
 const body=document.body;if(!body.classList.contains('app-fullscreen'))return;
 const menuVisible=event.clientY<=6||body.classList.contains('fullscreen-menu-visible')&&(event.clientY<=36||!!event.target.closest('.dd,.mi'));
 const edge=cfg.dockPosition==='left'?event.clientX<=6:cfg.dockPosition==='right'?event.clientX>=innerWidth-6:event.clientY>=innerHeight-6;
 const near=cfg.dockPosition==='left'?event.clientX<=120:cfg.dockPosition==='right'?event.clientX>=innerWidth-120:event.clientY>=innerHeight-120;
 body.classList.toggle('fullscreen-menu-visible',menuVisible);
 body.classList.toggle('fullscreen-dock-visible',edge||body.classList.contains('fullscreen-dock-visible')&&(near||dockDragging));
}
document.addEventListener('pointermove',updateFullscreenChromePointer);
document.addEventListener('pointerleave',()=>document.body.classList.remove('fullscreen-menu-visible','fullscreen-dock-visible'));
function fullscreenToggle(el){
 const id=Object.keys(wins).find(id=>wins[id]===el),button=el.querySelector('.dot.g');
 clearTimeout(el._boundsTimer);el.classList.add('max');
 if(el.dataset.fullscreen){
  const bounds=JSON.parse(el.dataset.fullscreen);delete el.dataset.fullscreen;el.classList.remove('fullscreen');Object.assign(el.style,bounds);constrainWindows();saveWindowBounds(id,el);
 }else{
  saveWindowBounds(id,el);
  el.dataset.fullscreen=el.dataset.max||JSON.stringify({left:el.style.left,top:el.style.top,width:el.style.width,height:el.style.height,minWidth:el.style.minWidth});delete el.dataset.max;
  el.classList.add('fullscreen');Object.assign(el.style,{left:'0px',top:'0px',width:innerWidth+'px',height:innerHeight+'px',minWidth:'0px'});
 }
 button.title=el.dataset.fullscreen?'Exit Full Screen':'Enter Full Screen';button.setAttribute('aria-label',button.title);
 el._boundsTimer=setTimeout(()=>{el.classList.remove('max');el._boundsTimer=0},480);focus(el,id);
}
function maxToggle(el){
 if(el.dataset.fullscreen){fullscreenToggle(el);return}
 clearTimeout(el._boundsTimer);
 if(el.dataset.max){const p=JSON.parse(el.dataset.max);el.classList.add('max');Object.assign(el.style,p);delete el.dataset.max;constrainWindows();saveWindowBounds(Object.keys(wins).find(id=>wins[id]===el),el);el._boundsTimer=setTimeout(()=>{el.classList.remove('max');el._boundsTimer=0},480)}
 else{saveWindowBounds(Object.keys(wins).find(id=>wins[id]===el),el);el.dataset.max=JSON.stringify({left:el.style.left,top:el.style.top,width:el.style.width,height:el.style.height});
  el.classList.add('max');Object.assign(el.style,{left:'8px',top:'34px',minWidth:Math.min(260,Math.max(160,innerWidth-16))+'px',width:Math.max(160,innerWidth-16)+'px',height:Math.max(120,innerHeight-132)+'px'})}}
function dragify(el,h){
 h.addEventListener('dblclick',e=>{if(cfg.titlebarDoubleClick&&!e.target.closest('.dot,button,input'))maxToggle(el)});
 h.addEventListener('pointerdown',e=>{
  if(e.target.closest('.dot,button,input')||el.dataset.max||el.dataset.fullscreen)return;
  const sx=e.clientX-el.offsetLeft,sy=e.clientY-el.offsetTop;
  el.classList.add('drag');h.setPointerCapture(e.pointerId);
  const mv=ev=>{const left=Math.max(8,Math.min(innerWidth-el.offsetWidth-8,ev.clientX-sx)),top=Math.max(28,Math.min(innerHeight-el.offsetHeight-8,ev.clientY-sy));el.style.left=left+'px';el.style.top=top+'px'};
  const up=()=>{el.classList.remove('drag');h.style.cursor='';saveWindowBounds(Object.keys(wins).find(id=>wins[id]===el),el);h.removeEventListener('pointermove',mv);h.removeEventListener('pointerup',up)};
  h.addEventListener('pointermove',mv);h.addEventListener('pointerup',up)})}
const MAG_RADIUS=2.15,MAG_BELL_SUM=2.2,ICON_GLYPH=26/56;
let baseWanted=56,base=56,mx=null,magRaf=null,dockGeom=null,magLast=0,dockDragging=false;
function syncIconOrder(){
 const ordered=[...dock.children].filter(node=>node.classList&&node.classList.contains('ic'));
 if(ordered.length!==icons.length||ordered.some((node,index)=>node!==icons[index])){
  icons=ordered;
  icons.forEach(ic=>{if(ic._s===undefined)ic._s=1});
 }
}
icons.forEach(i=>i._s=1);
function magnifyAmount(){return cfg.mag?cfg.magAmt:1}
function measureDock(){
 syncIconOrder();
 const cs=getComputedStyle(dock),vertical=cfg.dockPosition!=='bottom',
  gap=parseFloat(vertical?cs.rowGap:cs.columnGap)||0,
  padStart=parseFloat(vertical?cs.paddingTop:cs.paddingLeft)||0,
  padEnd=parseFloat(vertical?cs.paddingBottom:cs.paddingRight)||0,
  crossPadding=(parseFloat(vertical?cs.paddingLeft:cs.paddingTop)||0)+(parseFloat(vertical?cs.paddingRight:cs.paddingBottom)||0),
  along=vertical?innerHeight:innerWidth,room=Math.max(180,along-24),count=Math.max(1,icons.length),
  fit=Math.floor((room-padStart-padEnd-(count-1)*gap)/count);
 base=Math.max(28,Math.min(baseWanted,fit));
 const rest=count*base+(count-1)*gap,roomForBell=Math.max(0,room-padStart-padEnd-rest),mag=1+Math.min(magnifyAmount()-1,roomForBell/(base*MAG_BELL_SUM));
 dockGeom={vertical,gap,padStart,padEnd,along,mid:along/2,mag,crossSize:base*mag+crossPadding,maxLength:rest+padStart+padEnd+base*(mag-1)*MAG_BELL_SUM};
 icons.forEach(ic=>{ic._w=null});if(cfg.reduceMotion)resetDockMagnification();else kickMagnify()
}
function bellScale(distance,peak){
 const a=Math.abs(distance);
 return a>=MAG_RADIUS?1:1+(peak-1)*.5*(1+Math.cos(Math.PI*a/MAG_RADIUS))
}
function magSolve(){
 const g=dockGeom,n=icons.length;
 if(!n||!g)return[];
 if(mx==null||dockDragging||cfg.reduceMotion||g.mag<=1)return new Array(n).fill(1);
 const layout=focus=>{
  const scales=icons.map((_,i)=>bellScale(i-focus,g.mag)),widths=scales.map(s=>base*s),total=widths.reduce((sum,w)=>sum+w,0)+(n-1)*g.gap+g.padStart+g.padEnd;
  let position=g.mid-total/2+g.padStart;const centers=widths.map(width=>{const center=position+width/2;position+=width+g.gap;return center});
  const slot=Math.floor(focus),fraction=focus-slot;
  const cursor=focus<0?centers[0]+focus*(base+g.gap):focus>=n-1?centers[n-1]+(focus-n+1)*(base+g.gap):centers[slot]+fraction*(centers[slot+1]-centers[slot]);
  return {cursor,scales}
 };
 // Solve against target geometry, never the animated hitboxes or a rounded icon anchor.
 let low=-MAG_RADIUS,high=n-1+MAG_RADIUS;
 for(let i=0;i<18;i++){const middle=(low+high)/2;if(layout(middle).cursor<mx)low=middle;else high=middle}
 return layout((low+high)/2).scales
}
function magTick(ts){
 magRaf=null;syncIconOrder();
 const dt=Math.max(4,Math.min(60,ts-magLast)),k=1-Math.pow(.7,dt/16.7);magLast=ts;
 const scales=magSolve();let busy=false;
 icons.forEach((ic,index)=>{
  const target=scales[index]??1;
  ic._s+=(target-ic._s)*k;
  if(Math.abs(target-ic._s)>.0015)busy=true;else ic._s=target;
  const size=base*ic._s;
  if(Math.abs(size-(ic._w||0))>.25||ic._s===target){ic._w=size;ic.style.width=ic.style.height=size+'px';ic.firstChild.style.fontSize=(size*ICON_GLYPH).toFixed(1)+'px'}
 });
 if(busy)magRaf=requestAnimationFrame(magTick)
}
function kickMagnify(){if(magRaf==null){magLast=performance.now();magRaf=requestAnimationFrame(magTick)}}
function resetDockMagnification(){
 cancelAnimationFrame(magRaf);magRaf=null;mx=null;syncIconOrder();
 icons.forEach(ic=>{ic._s=1;ic._w=base;ic.style.width=ic.style.height=base+'px';ic.firstChild.style.fontSize=(base*ICON_GLYPH).toFixed(1)+'px'})
}
document.addEventListener('pointermove',e=>{
 if(e.pointerType==='touch'||dockDragging)return;
 const g=dockGeom,rect=dock.getBoundingClientRect(),along=g.vertical?e.clientY:e.clientX;
 const cross=g.vertical?(cfg.dockPosition==='left'?e.clientX>=rect.left&&e.clientX<=rect.left+g.crossSize:e.clientX<=rect.right&&e.clientX>=rect.right-g.crossSize):e.clientY<=rect.bottom&&e.clientY>=rect.bottom-g.crossSize;
 const over=cross&&Math.abs(along-g.mid)<=g.maxLength/2&&!document.body.classList.contains('launchpad-open')&&(!document.body.classList.contains('app-fullscreen')||document.body.classList.contains('fullscreen-dock-visible'));
 const next=over?along:null;if(next!==mx){mx=next;kickMagnify()}
});
document.addEventListener('pointerleave',()=>{mx=null;kickMagnify()});
measureDock();kickMagnify();
/* clock */
function clk(){const now=new Date(),date=cfg.showDate?now.toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'})+' ':'';
 $('#clock').textContent=date+now.toLocaleTimeString([],{hour:cfg.clock24?'2-digit':'numeric',minute:'2-digit',...(cfg.clockSeconds?{second:'2-digit'}:{}),...(cfg.clock24?{hourCycle:'h23'}:{})})}
setInterval(()=>$('#clock')&&clk(),1000);
/* apps */
let openTab=null;
if(window.silk)silk.onOpenTab(u=>openTab&&openTab(u));
const I={
 side:'<svg width="20" height="16" viewBox="0 0 20 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1.5" y="1.5" width="17" height="13" rx="3"/><path d="M7.5 2v12"/></svg>',
 back:'<svg width="12" height="16" viewBox="0 0 12 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 2.5 3.5 8l5 5.5"/></svg>',
 fwd:'<svg width="12" height="16" viewBox="0 0 12 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3.5 2.5 5 5.5-5 5.5"/></svg>',
 lock:'<svg width="9" height="11" viewBox="0 0 10 12" fill="currentColor"><path d="M2 5V3.5a3 3 0 0 1 6 0V5h.5A1.5 1.5 0 0 1 10 6.5v4A1.5 1.5 0 0 1 8.5 12h-7A1.5 1.5 0 0 1 0 10.5v-4A1.5 1.5 0 0 1 1.5 5zm1.5 0h3V3.5a1.5 1.5 0 0 0-3 0z"/></svg>',
 rl:'<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M13 8a5 5 0 1 1-1.6-3.7"/><path d="M13 2.5v3h-3"/></svg>',
 share:'<svg width="15" height="17" viewBox="0 0 16 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 11V1.5M5 4l3-3 3 3"/><path d="M5 7H3.5A1.5 1.5 0 0 0 2 8.5v6A1.5 1.5 0 0 0 3.5 16h9a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 12.5 7H11"/></svg>',
 plus:'<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M7 1v12M1 7h12"/></svg>',
 tabs:'<svg width="17" height="15" viewBox="0 0 18 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="4.5" y="1.5" width="12" height="9" rx="2"/><path d="M1.5 5v6.5a2 2 0 0 0 2 2H13"/></svg>',
 up:'<svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 9 7 5.4 10.5 9"/></svg>',
 down:'<svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 5 7 8.6 10.5 5"/></svg>',
 x:'<svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="m3.6 3.6 6.8 6.8M10.4 3.6l-6.8 6.8"/></svg>'};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const store={get(k){try{return JSON.parse(localStorage.getItem('silk.'+k))||[]}catch(e){return[]}},set(k,v){try{localStorage.setItem('silk.'+k,JSON.stringify(v))}catch(e){}}};
const hostOf=u=>{try{return new URL(u).hostname.replace(/^www\./,'')}catch(e){return String(u)}};
const tc=u=>{let h=0;for(const c of hostOf(u))h=(h*31+c.charCodeAt(0))%360;return'hsl('+h+',55%,48%)'};
const SITES='google.com youtube.com wikipedia.org github.com reddit.com amazon.in amazon.com netflix.com instagram.com facebook.com x.com linkedin.com whatsapp.com stackoverflow.com flipkart.com spotify.com claude.ai anthropic.com chatgpt.com openai.com gmail.com maps.google.com news.google.com bbc.com imdb.com twitch.tv discord.com roblox.com pinterest.com microsoft.com apple.com primevideo.com hotstar.com zomato.com swiggy.com irctc.co.in timesofindia.com ndtv.com quora.com medium.com canva.com figma.com notion.so drive.google.com docs.google.com outlook.com yahoo.com bing.com duckduckgo.com steampowered.com epicgames.com'.split(' ');
const mk=(sv,x,y,f)=>'url("data:image/svg+xml,'+encodeURIComponent(sv)+'") '+x+' '+y+', '+f;
const X="<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>";
const CA_PATH=X+"<path d='M6 3.5v15.2l3.9-3.5 2.6 5.7 2.6-1.2-2.6-5.6 5.2-.1z' fill='black' stroke='white' stroke-width='1.5' stroke-linejoin='round'/></svg>";
const CP_PATH=X+"<path d='M10 2.8c-.8 0-1.4.6-1.4 1.4v7.7L7.2 10.5c-.5-.5-1.3-.5-1.8 0s-.5 1.2-.1 1.700l3.600 5c1 1.500 2.600 2.400 4.400 2.400h1.600c2.800 0 4.700-2 4.700-4.700v-3.300c0-.8-.6-1.400-1.400-1.400-.3 0-.6.100-.8.300-.1-.7-.7-1.200-1.400-1.200-.4 0-.8.200-1 .5-.2-.6-.7-1-1.400-1-.3 0-.5.100-.7.200V4.200c0-.8-.6-1.400-1.400-1.400z' fill='white' stroke='black' stroke-width='1.2' stroke-linejoin='round'/></svg>";
const CT_PATH=X+"<path d='M8.5 3.5h7M12 3.500v17M8.5 20.500h7' stroke='white' stroke-width='3.600' stroke-linecap='round' fill='none'/><path d='M8.5 3.500h7M12 3.500v17M8.5 20.500h7' stroke='black' stroke-width='1.500' stroke-linecap='round' fill='none'/></svg>";
let cursorWhite='white';
const cursor=(svg,x,y,style,size=24)=>mk(svg.replace("width='24' height='24'",`width='${size}' height='${size}'`).replace(/'white'/g,`'${cursorWhite}'`),Math.round(x*size/24),Math.round(y*size/24),style);
const CA=cursor(CA_PATH,6,3,'default'),CP=cursor(CP_PATH,10,3,'pointer'),CT=cursor(CT_PATH,12,12,'text');
const rs=document.documentElement.style;rs.setProperty('--cur',CA);rs.setProperty('--curp',CP);rs.setProperty('--curt',CT);
let WEBCUR='';function updateCursorSize(){const size=Math.round(24*cfg.cursorSize);rs.setProperty('--cur',cursor(CA_PATH,6,3,'default',size));rs.setProperty('--curp',cursor(CP_PATH,10,3,'pointer',size));rs.setProperty('--curt',cursor(CT_PATH,12,12,'text',size));WEBCUR='html,html *{cursor:'+cursor(CA_PATH,6,3,'default',size)+'!important}html p,html h1,html h2,html h3,html h4,html li,html pre,html code,html span{cursor:'+cursor(CT_PATH,12,12,'text',size)+'!important}html a,html a *,html button,html button *,html [role=button],html summary,html select,html label,html input[type=submit],html input[type=button],html input[type=checkbox],html input[type=radio],html input[type=range]{cursor:'+cursor(CP_PATH,10,3,'pointer',size)+'!important}html input:not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]):not([type=range]),html textarea,html [contenteditable=true],html [contenteditable=true] *{cursor:'+cursor(CT_PATH,12,12,'text',size)+'!important}';Object.values(wins).forEach(w=>w._b&&w._b.updateCursor&&w._b.updateCursor())}
const IC={
 logo:'<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M12 1c1 6 5 10 11 11-6 1-10 5-11 11-1-6-5-10-11-11C7 11 11 7 12 1z"/></svg>',
 wifi:'<svg width="17" height="13" viewBox="0 0 17 13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M1.5 4.5a10 10 0 0 1 14 0M4 7.300a6.400 6.400 0 0 1 9 0"/><circle cx="8.5" cy="10.300" r="1.200" fill="currentColor" stroke="none"/></svg>',
 bluetooth:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m7 7 10 10-5 4V3l5 4L7 17"/></svg>',
 moon:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.2 15.4A8.4 8.4 0 0 1 8.6 4.8 8.7 8.7 0 1 0 19.2 15.4Z"/></svg>',
 airdrop:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3.3 9.1a12.3 12.3 0 0 1 17.4 0M6.5 12.2a7.8 7.8 0 0 1 11 0M9.6 15.3a3.4 3.4 0 0 1 4.8 0"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/></svg>',
 keyboard:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M7 9h.01M10 9h.01M13 9h.01M16 9h.01M7 12h.01M10 12h.01M13 12h.01M16 12h.01M8 15.5h8"/></svg>',
 mirror:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="13" height="12" rx="2"/><path d="M7 20h5m-2-4v4m7-12h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4"/></svg>',
 lock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/></svg>',
 sun:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>',
 sunLow:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="3.5"/><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.64 5.64l1.42 1.42m9.88 9.88 1.42 1.42"/></svg>',
 volumeLow:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10v4h4l5 4V6l-5 4H4Z"/></svg>',
 volumeHigh:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M16 9a5 5 0 0 1 0 6m3-9a9 9 0 0 1 0 12"/></svg>',
 music:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
 previous:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zm13 1v12L9 12z"/></svg>',
 play:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
 pause:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
 next:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM5 6v12l10-6z"/></svg>',
 bat:'<svg width="24" height="12" viewBox="0 0 24 12" fill="none" stroke="currentColor" stroke-width="1.2"><rect x=".6" y=".6" width="20" height="10.800" rx="3.200" opacity=".6"/><rect x="2.200" y="2.200" width="16.800" height="7.600" rx="1.800" fill="currentColor" stroke="none"/><path d="M22 4v4" stroke-linecap="round" opacity=".6"/></svg>',
 cc:'<svg width="16" height="14" viewBox="0 0 16 14" fill="none" stroke="currentColor" stroke-width="1.4"><rect x=".7" y=".7" width="14.600" height="5" rx="2.500"/><circle cx="4" cy="3.200" r="1.300" fill="currentColor" stroke="none"/><rect x=".7" y="8.300" width="14.600" height="5" rx="2.500"/><circle cx="12" cy="10.800" r="1.300" fill="currentColor" stroke="none"/></svg>',
 srch:'<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.600" stroke-linecap="round"><circle cx="6" cy="6" r="4.600"/><path d="m9.500 9.500 3.300 3.300"/></svg>',
 chevron:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m9 4 8 8-8 8"/></svg>',
 mute:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="m16 10 5 5m0-5-5 5"/></svg>'};
let curApp=null,dd=null,ddKey=null,curMenus={},bri=100,volume=50,lastAudibleVolume=50,hardwareBrightness=false,batInfo=null,nativeBar=null,nativeChild=[],nativeClearPending=false;
const mleft=$('#mleft'),mright=$('#mright');
const toggleLite=()=>{cfg.lite=document.body.classList.toggle('lite');save()};
const toggleFS=()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();
document.body.insertAdjacentHTML('beforeend','<div id="power"><span></span></div><div id="dim"></div>');
const pw=$('#power'),dim=$('#dim');
function power(k){if(window.silk&&silk.platform==='linux'&&silk.power){if(k==='sleep'){silk.power('sleep');return}setTimeout(()=>silk.power(k),900)}pw.firstChild.textContent=k==='off'?'SilkOS is shut down. Click to power on.':k==='restart'?'Restarting…':'';pw.dataset.k=k;pw.classList.add('on');if(k==='restart')setTimeout(()=>location.reload(),1400)}
pw.onclick=()=>{if(pw.dataset.k!=='restart')pw.classList.remove('on')};
document.body.insertAdjacentHTML('beforeend','<section id="lockscreen" hidden role="dialog" aria-modal="true" aria-labelledby="lock-title"><div class="lock-clock"><div class="lock-time"></div><div class="lock-date"></div></div><div class="lock-card"><div class="lock-avatar" aria-hidden="true">S</div><h1 id="lock-title">SilkOS</h1><p class="lock-prompt"></p><form class="lock-form"><input class="lock-password" type="password" autocomplete="current-password" aria-label="Screen-lock password" placeholder="Password" required><input class="lock-confirm" type="password" autocomplete="new-password" aria-label="Confirm screen-lock password" placeholder="Confirm" hidden><button class="lock-submit" type="submit">Unlock</button><p class="lock-status" role="status" aria-live="polite"></p></form></div><button class="lock-cancel" type="button" hidden>Cancel setup</button></section>');
const lockEl=$('#lockscreen'),lockForm=lockEl.querySelector('.lock-form'),lockPassword=lockEl.querySelector('.lock-password'),lockConfirm=lockEl.querySelector('.lock-confirm'),lockSubmit=lockEl.querySelector('.lock-submit'),lockStatus=lockEl.querySelector('.lock-status');
let lockConfigured=false;
function updateLockClock(){
 const now=new Date(),parts=new Intl.DateTimeFormat([],{hour:'numeric',minute:'2-digit'}).formatToParts(now),hour=parts.find(p=>p.type==='hour')?.value,minute=parts.find(p=>p.type==='minute')?.value,period=parts.find(p=>p.type==='dayPeriod')?.value,time=lockEl.querySelector('.lock-time');
 time.replaceChildren(document.createTextNode(`${hour}:${minute}`));
 if(period){const mark=document.createElement('span');mark.className='lock-period';mark.textContent=period;time.append(' ',mark)}
 lockEl.querySelector('.lock-date').textContent=now.toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'})
}
function setLockMode(mode,message=''){
 lockEl.dataset.mode=mode;const setup=mode==='setup';lockEl.querySelector('.lock-prompt').textContent=setup?'Create a password to lock this screen. Any non-empty password works.':'Enter your password to unlock.';
 lockConfirm.hidden=!setup;lockEl.querySelector('.lock-cancel').hidden=!setup;lockPassword.autocomplete=setup?'new-password':'current-password';
 lockSubmit.textContent=setup?'Set Password':'Unlock';lockStatus.textContent=message;lockPassword.value='';lockConfirm.value='';
 requestAnimationFrame(()=>lockPassword.focus())
}
async function lockScreen(){
 if(!window.silk||!silk.lock){alert('Screen locking is available in the SilkOS desktop app.');return}
 try{
  const state=await silk.lock.status();if(!state.ok)throw new Error(state.error||'Could not read screen-lock settings.');
  lockConfigured=state.configured;closeDd(true);spot(false);$('#lp')?.classList.remove('on');updateLockClock();
  const locked=await silk.lock.setWindowLocked(true);if(!locked)throw new Error('Could not keep the lock screen above other windows.');
  lockEl.hidden=false;setLockMode(lockConfigured?'unlock':'setup');
 }catch(e){console.error('Could not lock the screen:',e);alert(e.message||'Could not lock the screen.')}
}
lockForm.addEventListener('submit',async e=>{
 e.preventDefault();const mode=lockEl.dataset.mode,password=lockPassword.value;
 if(mode==='setup'&&password!==lockConfirm.value){lockStatus.textContent='The passwords do not match.';lockConfirm.focus();return}
 lockSubmit.disabled=true;lockStatus.textContent='';
 try{
  if(mode==='setup'){
   const result=await silk.lock.setPassword(password);
   if(!result.ok)throw new Error(result.error||'Could not save the screen-lock password.');
   lockConfigured=true;setLockMode('unlock','Password saved. Enter it to unlock.');
  }else{
   const result=await silk.lock.verify(password);
   if(!result.ok)throw new Error(result.error||'Could not verify the screen-lock password.');
   if(!result.valid){lockStatus.textContent='That password is not correct. Try again.';lockPassword.value='';lockPassword.focus();return}
   const released=await silk.lock.setWindowLocked(false);if(!released)throw new Error('Could not release the screen lock.');
   lockEl.hidden=true;lockPassword.value='';lockConfirm.value='';
  }
 }catch(error){console.error('Screen-lock operation failed:',error);lockStatus.textContent=error.message||'Screen-lock operation failed.'}
 finally{lockSubmit.disabled=false}
});
lockEl.querySelector('.lock-cancel').onclick=async()=>{
 try{const released=await silk.lock.setWindowLocked(false);if(!released)throw new Error('Could not cancel screen-lock setup.');lockEl.hidden=true;lockPassword.value='';lockConfirm.value=''}
 catch(error){console.error('Could not cancel screen-lock setup:',error);lockStatus.textContent=error.message||'Could not cancel setup.'}
};
document.addEventListener('keydown',e=>{
 if(lockEl.hidden)return;
 if(e.key==='Escape'){e.preventDefault();e.stopPropagation();return}
 if(e.key==='Tab'){
  const items=[...lockEl.querySelectorAll('input,button')].filter(item=>!item.hidden&&!item.disabled&&item.getClientRects().length);
  if(!items.length)return;
  const first=items[0],last=items[items.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
 }
});
updateLockClock();setInterval(updateLockClock,15000);
function openUrl(u){const had=!!wins.browser;launch('browser');setTimeout(()=>openTab&&openTab(u),had?60:450)}
function menusFor(id){
 const A=id?apps[id].n:'SilkOS',w=id&&wins[id],b=id==='browser'&&w?w._b:null,x=!w,m={};
 const cl=()=>w&&w.querySelector('.dot.r').click();
 m[A]=[['About '+A,()=>launch('settings')],'-',['Hide '+A,()=>w&&minimize(w,id),'',x],['Quit '+A,cl,'',x]];
 m.File=b?[['New Tab',()=>b.add(''),'Ctrl+T'],['Open Location…',b.addr,'Ctrl+L'],['Close Tab',b.closeCur,'Ctrl+W'],['Add Bookmark',b.addBm,'Ctrl+D'],'-',['Import Bookmarks…',b.impBm],['Import History…',b.impHist]]:[['Close Window',cl,'',x]];
 m.Edit=[['Undo',()=>document.execCommand('undo')],['Redo',()=>document.execCommand('redo')],'-',['Cut',()=>document.execCommand('cut')],['Copy',()=>document.execCommand('copy')],['Paste',()=>document.execCommand('paste')],['Select All',()=>document.execCommand('selectAll')]];
 m.View=(b?[['Reload Page',b.reload,'Ctrl+R'],['Show Tab Overview',b.ov],['Toggle Sidebar',b.side],'-']:[]).concat([['Enter Full Screen',toggleFS,'F11']]);
 m.Window=[['Minimize',()=>w&&minimize(w,id),'',x],['Zoom',()=>w&&maxToggle(w),'',x],'-'].concat(Object.keys(wins).map(k=>[(k===id?'✓ ':'    ')+apps[k].n,()=>launch(k)]));
 m.Help=[['Search',()=>spot(true),'Ctrl+K'],['SilkOS Help',()=>launch('settings')]];
 return m}
function updateSpaceButton(){
 const button=$('#spaces');if(!button)return;
 button.innerHTML=uiIcon('window')+`<span class="spaces-label">${esc(workspaceNames[activeSpace]||`Desktop ${activeSpace+1}`)}</span>`;
 button.title=`${workspaceNames[activeSpace]||`Desktop ${activeSpace+1}`} · swipe three or four fingers or press Ctrl+Alt+←/→`;
 button.setAttribute('aria-label',`Current desktop: ${workspaceNames[activeSpace]||`Desktop ${activeSpace+1}`}`);
}
function buildBar(){
 const id=curApp&&wins[curApp]?curApp:null;curMenus=menusFor(id);
 /* A SilkOS app owns the bar again, so the menus belonging to the last native window go with it. */
 nativeBar=null;nativeClearPending=false;closeNativeChild();
 mleft.innerHTML='<button class="mi" data-k="apple">'+IC.logo+'</button>'+Object.keys(curMenus).map((k,i)=>`<button class="mi${i?'':' bold'}" data-k="${esc(k)}">${esc(k)}</button>`).join('');
 mleft.classList.remove('native');
 wire(mleft)}
function wire(box){box.querySelectorAll('.mi').forEach(b=>{const k=b.dataset.k;
 b.onclick=e=>{e.stopPropagation();if(k==='srch'){spot(true);return}ddKey===k?closeDd():openK(b)};
 b.onpointerenter=()=>{if(dd&&k!=='srch'&&ddKey!==k)openK(b)}})}
function listEl(items){const el=document.createElement('div');items.forEach(it=>{
 if(it==='-'){el.insertAdjacentHTML('beforeend','<div class="sep"></div>');return}
 const[l,f,sc,dis]=it,d=document.createElement('div');d.className='di'+(dis?' dis':'');d.innerHTML='<span>'+esc(l)+'</span><em>'+(sc||'')+'</em>';
 if(!dis&&f)d.onclick=()=>{closeDd();setTimeout(f,70)};el.appendChild(d)});return el}
/* Native GTK menus arrive from the desktop bus as a tree of items belonging to whichever X window is
 * frontmost. They are painted after SilkOS's own menus and last only until a SilkOS app takes the bar
 * or the helper reports the window lost its menu. */
const NATIVE_KEY='native:';
function nativeNode(id){
 const walk=nodes=>{for(const node of nodes||[]){if(node.id===id)return node;const deeper=walk(node.children);if(deeper)return deeper}return null};
 return nativeBar?walk(nativeBar.entries):null}
function paintNativeBar(){
 mleft.querySelectorAll('.mi[data-k^="native:"]').forEach(button=>button.remove());
 const entries=nativeBar?nativeBar.entries.filter(entry=>!entry.separator):[];
 /* A native window covers SilkOS, so its own menus are unreachable and only confuse the bar. */
 mleft.classList.toggle('native',!!entries.length);
 if(!entries.length)return;
 /* WM_CLASS is often a reverse-DNS id for Flatpaks, so the last segment is the name a person chose. */
 const title=(nativeBar.app||'').split('.').pop().replace(/^./,character=>character.toUpperCase());
 if(title)mleft.insertAdjacentHTML('beforeend',`<button class="mi bold native-title" data-k="native:title" disabled>${esc(title)}</button>`);
 entries.forEach(entry=>{mleft.insertAdjacentHTML('beforeend',`<button class="mi" data-k="${esc(NATIVE_KEY+entry.id)}">${esc(entry.label||'Menu')}</button>`)});
 wire(mleft)}
function dropNativeBar(){nativeBar=null;nativeClearPending=false;paintNativeBar()}
function closeNativeChild(){const open=nativeChild;nativeChild=[];open.forEach(({el})=>{el.classList.remove('on');setTimeout(()=>el.remove(),220)})}
function renderNativeMenu(el,id){el.replaceChildren();const node=nativeNode(id);nativeMenuItems(el,node?node.children:[])}
function nativeMenuItems(el,nodes){
 nodes.forEach(node=>{
  if(node.separator){el.insertAdjacentHTML('beforeend','<div class="sep"></div>');return}
  const item=document.createElement('div');item.className='di'+(node.disabled?' dis':'');
  const mark=node.togglable?(node.checked?'✓ ':'    '):'';
  item.innerHTML='<span>'+esc(mark+(node.label||'—'))+'</span>'+(node.submenu?'<em class="sub">'+IC.chevron+'</em>':'<em>'+esc(node.shortcut||'')+'</em>');
  if(!node.disabled){
   if(node.submenu){item.onclick=()=>openNativeChild(node,item);item.onpointerenter=()=>openNativeChild(node,item)}
   else{item.onpointerenter=closeNativeChild;item.onclick=()=>{closeDd();if(window.silk?.nativeMenu)silk.nativeMenu.activate(node.id)}}
  }
  el.appendChild(item)});
 if(!el.childNodes.length)el.insertAdjacentHTML('beforeend','<div class="di dis"><span>No items</span></div>')}
function openNativeChild(node,item){
 /* Re-entering the item whose submenu is already showing must not close, re-ask and reopen it. */
 if(nativeChild.length&&nativeChild[nativeChild.length-1].id===node.id)return;
 closeNativeChild();
 /* An app that exports a placeholder fills the subtree only once it is asked for, so the request
  * goes out now and the popup refreshes in place when the items arrive. */
 if(node.lazy||!node.children.length){node.lazy=false;if(window.silk?.nativeMenu)silk.nativeMenu.open(node.id)}
 const el=document.createElement('div');el.className='dd native';nativeMenuItems(el,node.children);
 document.body.appendChild(el);
 const r=item.getBoundingClientRect();fitPopup(el,r.right-4,r.top-6);
 requestAnimationFrame(()=>el.classList.add('on'));
 nativeChild=nativeChild.concat([{el,id:node.id}])}
function applyNativeBar(frame){
 if(frame.type==='clear'){
  /* Tearing the items down while the pointer is inside them would strand the open dropdown, so a
     pending clear waits for the menu to close. */
  if(ddKey&&ddKey.startsWith(NATIVE_KEY)){nativeClearPending=true;return}
  dropNativeBar();return}
 nativeBar=frame;nativeClearPending=false;paintNativeBar();
 if(dd&&ddKey&&ddKey.startsWith(NATIVE_KEY)){
  /* Repainting rebuilds the buttons, so the one whose menu is open has to pick its highlight back up. */
  const active=mleft.querySelector(`.mi[data-k="${esc(ddKey)}"]`);
  if(active)active.classList.add('on');
  renderNativeMenu(dd,Number(ddKey.slice(NATIVE_KEY.length)));
  nativeChild.forEach(child=>renderNativeMenu(child.el,child.id))}}
const hardwareUpdates=new Map();
function queueHardwareUpdate(key,value,writer,immediate=false){
 let job=hardwareUpdates.get(key);
 if(!job){job={timer:0,pending:undefined,running:false,writer};hardwareUpdates.set(key,job)}
 job.pending=value;job.writer=writer;clearTimeout(job.timer);
 if(immediate){job.timer=0;void drainHardwareUpdate(key,job)}
 else job.timer=setTimeout(()=>{job.timer=0;void drainHardwareUpdate(key,job)},100);
}
let settingsSaveTimer=0;
function saveSettings(immediate=false){
 clearTimeout(settingsSaveTimer);
 if(immediate)save();
 else settingsSaveTimer=setTimeout(save,140);
}
async function drainHardwareUpdate(key,job){
 if(job.running||job.pending===undefined)return;
 const value=job.pending;job.pending=undefined;job.running=true;
 try{await job.writer(value)}catch(e){console.error(`Could not update ${key}:`,e)}
 finally{
  job.running=false;
  if(job.pending!==undefined)job.timer=setTimeout(()=>{job.timer=0;void drainHardwareUpdate(key,job)},40);
  else if(hardwareUpdates.get(key)===job)hardwareUpdates.delete(key);
 }
}
/* The pointer is drawn by the display server, so a dimming overlay cannot reach it. While dimming is software only, the pointer's white outline is darkened to match; real backlight or gamma dimming already covers it. */
function syncCursorDim(){
 const factor=hardwareBrightness?1:1-(100-bri)/100*.85,level=Math.round(factor*20)/20,v=Math.round(255*level),white=level>=1?'white':`rgb(${v},${v},${v})`;
 if(white!==cursorWhite){cursorWhite=white;updateCursorSize()}
}
function setBrightness(value,immediate=false,statusEl=null){
 bri=cfg.bri=Math.max(5,Math.min(100,Math.round(Number(value))));
 if(window.silk&&silk.platform==='linux'&&silk.brightness){
  queueHardwareUpdate('brightness',bri,async next=>{
   const ok=await silk.brightness(next);hardwareBrightness=!!ok;
   dim.style.opacity=ok?'0':(100-next)/100*.85;syncCursorDim();
   if(statusEl?.isConnected)statusEl.textContent=ok?'':'Brightness control unavailable; using screen dimming.';
  },immediate);
 }else{hardwareBrightness=false;dim.style.opacity=(100-bri)/100*.85;syncCursorDim()}
 saveSettings(immediate);
}
function setVolume(value,immediate=false,statusEl=null){
 volume=cfg.volume=Math.max(0,Math.min(100,Math.round(Number(value))));if(volume>0){cfg.muted=false;lastAudibleVolume=cfg.lastAudibleVolume=volume}else if(!cfg.muted&&volume===0){cfg.muted=true}saveSettings(immediate);
 if(!window.silk||silk.platform!=='linux'||!silk.volume){if(statusEl?.isConnected)statusEl.textContent='Volume controls are unavailable on this system.';return}
 queueHardwareUpdate('volume',volume,async next=>{
  const result=await silk.volume(next);
  if(statusEl?.isConnected)statusEl.textContent=result===null?'Audio output control is unavailable.':'';
 },immediate);
}
function ccEl(){const el=document.createElement('div');el.className='cc';el.setAttribute('role','group');el.setAttribute('aria-label','Control Center');
 el.innerHTML=`<div class="cc-radio cc-tile"><div class="cc-service" data-service="wifi"><button type="button" class="cc-service-main" aria-pressed="false"><span class="cc-glyph">${IC.wifi}</span><span class="cc-copy"><strong>Wi-Fi</strong><small>Checking…</small></span></button><button type="button" class="cc-more" data-radio-open="wifi" aria-label="Choose a Wi-Fi network">${IC.chevron}</button></div><div class="cc-service" data-service="bluetooth"><button type="button" class="cc-service-main" aria-pressed="false"><span class="cc-glyph">${IC.bluetooth}</span><span class="cc-copy"><strong>Bluetooth</strong><small>Checking…</small></span></button><button type="button" class="cc-more" data-radio-open="bluetooth" aria-label="Show nearby Bluetooth devices">${IC.chevron}</button></div><div class="cc-service" data-off><button type="button" class="cc-service-main" disabled><span class="cc-glyph">${IC.airdrop}</span><span class="cc-copy"><strong>AirDrop</strong><small>Not available</small></span></button></div></div><button type="button" class="cc-dnd cc-tile${cfg.quietMode?' on':''}" data-feature="quiet" aria-pressed="${!!cfg.quietMode}"><span class="cc-glyph">${IC.moon}</span><span class="cc-copy"><strong>Do Not Disturb</strong><small>${cfg.quietMode?'On':'Off'}</small></span></button><div class="cc-duo"><div class="cc-mini cc-tile"><span class="cc-glyph">${IC.keyboard}</span><span>Keyboard Brightness</span><small class="cc-kbd-value">Checking…</small><input class="cc-kbd-range" type="range" min="0" max="100" value="0" aria-label="Keyboard brightness" disabled hidden></div><button type="button" class="cc-mini cc-tile" disabled><span class="cc-glyph">${IC.mirror}</span><span>Screen Mirroring</span></button></div><section class="cc-slider cc-tile"><div class="cc-slider-head"><span>Display</span><small class="cc-bright-value">${bri}%</small></div><div class="cc-slider-row"><span class="cc-cap">${IC.sun}<i></i><input class="cc-range cc-brightness" type="range" min="5" max="100" value="${bri}" aria-label="Brightness"></span></div></section><section class="cc-slider cc-tile"><div class="cc-slider-head"><span>Sound</span><small class="cc-volume-value">Loading…</small></div><div class="cc-slider-row"><span class="cc-cap">${IC.volumeLow}<i></i><input class="cc-range cc-volume" type="range" min="0" max="100" value="${volume}" aria-label="Volume"></span><button type="button" class="cc-out${cfg.muted?' on':''}" data-a="mute" aria-label="Mute output">${IC.mute}</button></div></section><section class="cc-media cc-tile"><span class="cc-media-art">${IC.music}</span><span class="cc-media-meta"><strong class="cc-track">No media playing</strong><small class="cc-artist">Open a player to see controls</small></span><span class="cc-media-actions"><button data-media="previous" aria-label="Previous track" disabled>${IC.previous}</button><button data-media="play-pause" aria-label="Play or pause" disabled>${IC.play}</button><button data-media="next" aria-label="Next track" disabled>${IC.next}</button></span></section><section class="cc-pane cc-tile" data-radio-pane="wifi" hidden><div class="cc-pane-head"><strong>Wi-Fi Networks</strong><button type="button" class="cc-chip" data-radio-refresh="wifi">Scan</button><button type="button" class="cc-chip" data-radio-close aria-label="Close Wi-Fi networks">Close</button></div><p class="cc-pane-info" data-radio-info="wifi">Scan for nearby networks.</p><div class="cc-pane-list" data-radio-list="wifi"></div><form class="cc-join" hidden><strong></strong><input type="password" name="password" autocomplete="current-password" aria-label="Wi-Fi password" placeholder="Password"><button type="submit" class="cc-chip">Join</button><button type="button" class="cc-chip" data-wifi-cancel>Cancel</button></form></section><section class="cc-pane cc-tile" data-radio-pane="bluetooth" hidden><div class="cc-pane-head"><strong>Bluetooth Devices</strong><button type="button" class="cc-chip" data-radio-refresh="bluetooth">Scan</button><button type="button" class="cc-chip" data-radio-close aria-label="Close Bluetooth devices">Close</button></div><p class="cc-pane-info" data-radio-info="bluetooth">Scan for nearby devices.</p><div class="cc-pane-list" data-radio-list="bluetooth"></div></section><div class="cc-foot"><p class="cc-status" role="status" aria-live="polite"></p><button type="button" class="cc-chip cc-lock" data-a="lock"><span class="cc-lock-icon">${IC.lock}</span>Lock Screen</button></div>`;
 const status=el.querySelector('.cc-status'),brightness=el.querySelector('.cc-brightness'),volumeSlider=el.querySelector('.cc-volume');
 const setStatus=text=>{status.textContent=text||''};
 /* The capsule fill is painted from the value because a native range cannot style its own track fill. */
 const paintFill=input=>{const cap=input.closest('.cc-cap');if(!cap)return;const min=Number(input.min)||0,max=Number(input.max)||100;cap.style.setProperty('--fill',`${(Number(input.value)-min)/(max-min)*100}%`)};
 const serviceMain=name=>el.querySelector(`[data-service="${name}"] .cc-service-main`);
 const service=(name,enabled,detail,available=true)=>{const row=el.querySelector(`[data-service="${name}"]`),button=serviceMain(name);row.classList.toggle('on',!!enabled);button.setAttribute('aria-pressed',String(!!enabled));button.disabled=!available;row.querySelector('small').textContent=detail};
 const refreshWifi=async()=>{if(!window.silk||silk.platform!=='linux'||!silk.wifi){service('wifi',false,'Unavailable',false);return}try{const result=await silk.wifi();if(!result||!result.available){service('wifi',false,result?.error||'Network service unavailable',false);return}service('wifi',result.enabled,result.enabled?(result.connected?(result.name||'Connected'):'Not connected'):'Off')}catch(error){console.error('Could not read Wi-Fi status:',error);service('wifi',false,'Could not read status',false)}};
 const refreshBluetooth=async()=>{if(!window.silk||silk.platform!=='linux'||!silk.bluetooth){service('bluetooth',false,'Unavailable',false);return}try{const result=await silk.bluetooth();if(!result?.available){service('bluetooth',false,result?.error||'No Bluetooth adapter',false);return}service('bluetooth',result.powered,result.powered?'On':'Off')}catch(error){console.error('Could not read Bluetooth status:',error);service('bluetooth',false,'Could not read status',false)}};
 const toggleRadio=async(name,read,write)=>{const button=serviceMain(name),label=button.querySelector('small'),wasEnabled=button.getAttribute('aria-pressed')==='true';button.disabled=true;label.textContent='Updating…';try{const result=await write(!wasEnabled);if(!result?.available){setStatus(result?.error||`${name==='wifi'?'Wi-Fi':'Bluetooth'} could not be changed.`);await read();return}await read();setStatus('')}catch(error){console.error(`Could not change ${name} state:`,error);label.textContent='Could not change';setStatus(`${name==='wifi'?'Wi-Fi':'Bluetooth'} could not be changed.`);button.disabled=false}};
 const radioPane=name=>el.querySelector(`[data-radio-pane="${name}"]`);
 const openRadioPane=name=>{el.querySelectorAll('.cc-pane').forEach(pane=>pane.hidden=pane.dataset.radioPane!==name);if(name==='wifi')loadWifiNetworks();else loadBluetoothDevices()};
 const wifiList=el.querySelector('[data-radio-list="wifi"]'),wifiInfo=el.querySelector('[data-radio-info="wifi"]'),wifiForm=el.querySelector('.cc-join'),wifiPassword=wifiForm.querySelector('input');
 async function connectToWifi(ssid,password=''){
  wifiInfo.textContent=`Connecting to ${ssid}…`;
  try{const result=await silk.connectWifi(ssid,password);if(!result?.ok)throw new Error(result?.error||'Could not connect to this network.');wifiInfo.textContent=`Connected to ${ssid}.`;wifiForm.hidden=true;wifiPassword.value='';await refreshWifi()}
  catch(error){console.error('Could not connect to Wi-Fi:',error);wifiInfo.textContent=error.message||'Could not connect to this network.'}
 }
 async function loadWifiNetworks(){
  wifiInfo.textContent='Scanning for Wi-Fi networks…';wifiList.replaceChildren();wifiForm.hidden=true;
  if(!window.silk||silk.platform!=='linux'||!silk.wifiNetworks){wifiInfo.textContent='Wi-Fi scanning requires the Linux desktop app.';return}
  try{
   const result=await silk.wifiNetworks();if(!result?.available)throw new Error(result?.error||'Wi-Fi is unavailable.');
   if(!result.enabled){wifiInfo.textContent='Turn Wi-Fi on to scan for networks.';return}
   if(!result.networks?.length){wifiInfo.textContent='No Wi-Fi networks found. Try scanning again.';return}
   wifiInfo.textContent='Select a network to connect.';
   result.networks.forEach(network=>{
    const item=document.createElement('button');item.type='button';item.className='cc-net';item.innerHTML='<span></span><small></small>';item.querySelector('span').textContent=network.ssid;item.querySelector('small').textContent=`${network.signal}%${network.security?' · '+network.security:' · Open'}${network.active?' · Connected':''}`;
    item.onclick=()=>{wifiForm.querySelector('strong').textContent=network.ssid;wifiPassword.hidden=!network.security;wifiPassword.required=!!network.security;wifiPassword.value='';wifiForm.hidden=false;if(network.security)wifiPassword.focus();else connectToWifi(network.ssid)};wifiList.appendChild(item)
   })
  }catch(error){console.error('Could not scan for Wi-Fi networks:',error);wifiInfo.textContent=error.message||'Could not scan for Wi-Fi networks.'}
 }
 wifiForm.onsubmit=event=>{event.preventDefault();connectToWifi(wifiForm.querySelector('strong').textContent,wifiPassword.value)};
 wifiForm.querySelector('[data-wifi-cancel]').onclick=()=>{wifiForm.hidden=true;wifiPassword.value=''};
 const bluetoothList=el.querySelector('[data-radio-list="bluetooth"]'),bluetoothInfo=el.querySelector('[data-radio-info="bluetooth"]');
 async function loadBluetoothDevices(){
  bluetoothInfo.textContent='Scanning for Bluetooth devices…';bluetoothList.replaceChildren();
  if(!window.silk||silk.platform!=='linux'||!silk.bluetoothDevices){bluetoothInfo.textContent='Bluetooth scanning requires the Linux desktop app.';return}
  try{
   const result=await silk.bluetoothDevices();if(!result?.available)throw new Error(result?.error||'Bluetooth scanning is unavailable.');
   if(!result.devices?.length){bluetoothInfo.textContent='No nearby devices found. Put your device in pairing mode and scan again.';return}
   bluetoothInfo.textContent='Select a device to pair or connect.';
   result.devices.forEach(device=>{const item=document.createElement('button');item.type='button';item.className='cc-net';item.innerHTML='<span></span><small>Connect</small>';item.querySelector('span').textContent=device.name;item.onclick=async()=>{item.disabled=true;bluetoothInfo.textContent=`Connecting to ${device.name}…`;try{const connected=await silk.connectBluetooth(device.address);if(!connected?.ok)throw new Error(connected?.error||'Could not connect to the Bluetooth device.');bluetoothInfo.textContent=`Connected to ${device.name}.`}catch(error){console.error('Could not connect Bluetooth device:',error);bluetoothInfo.textContent=error.message||'Could not connect to the Bluetooth device.'}finally{item.disabled=false}};bluetoothList.appendChild(item)})
  }catch(error){console.error('Could not scan for Bluetooth devices:',error);bluetoothInfo.textContent=error.message||'Could not scan for Bluetooth devices.'}
 }
 el.querySelectorAll('[data-radio-open]').forEach(button=>button.onclick=()=>openRadioPane(button.dataset.radioOpen));
 el.querySelectorAll('[data-radio-refresh]').forEach(button=>button.onclick=()=>button.dataset.radioRefresh==='wifi'?loadWifiNetworks():loadBluetoothDevices());
 el.querySelectorAll('[data-radio-close]').forEach(button=>button.onclick=()=>{radioPane('wifi').hidden=true;radioPane('bluetooth').hidden=true});
 serviceMain('wifi').onclick=()=>toggleRadio('wifi',refreshWifi,enabled=>silk.wifi(enabled));
 serviceMain('bluetooth').onclick=()=>toggleRadio('bluetooth',refreshBluetooth,enabled=>silk.bluetooth(enabled));
 const quiet=el.querySelector('[data-feature="quiet"]');
 quiet.onclick=()=>{cfg.quietMode=!cfg.quietMode;quiet.classList.toggle('on',cfg.quietMode);quiet.setAttribute('aria-pressed',String(cfg.quietMode));quiet.querySelector('small').textContent=cfg.quietMode?'On':'Off';quiet.classList.remove('pulse');void quiet.offsetWidth;quiet.classList.add('pulse');saveSettings(true)};
 el.querySelector('[data-a="lock"]').onclick=()=>lockScreen();
 const kbd=el.querySelector('.cc-kbd-range'),kbdValue=el.querySelector('.cc-kbd-value');
 const showKbd=value=>{kbd.hidden=false;kbd.value=String(value);kbdValue.textContent=`${value}%`};
 if(window.silk&&silk.platform==='linux'&&silk.keyboardBrightness)silk.keyboardBrightness().then(result=>{if(!el.isConnected)return;if(!result?.available){kbdValue.textContent='Not available';return}kbd.disabled=false;showKbd(result.value)}).catch(error=>{console.error('Could not read keyboard brightness:',error);kbdValue.textContent='Unavailable'});
 else{kbdValue.textContent='Unavailable'}
 const updateKbd=immediate=>{showKbd(kbd.value);queueHardwareUpdate('keyboardBrightness',Number(kbd.value),async next=>{const result=await silk.keyboardBrightness(next);if(!result?.available){kbdValue.textContent='Unavailable';setStatus('Keyboard brightness control is unavailable.');return}showKbd(result.value)},immediate)};
 kbd.oninput=()=>updateKbd(false);kbd.onchange=()=>updateKbd(true);
 const loadMedia=async()=>{const buttons=el.querySelectorAll('[data-media]');if(!window.silk||silk.platform!=='linux'||!silk.media){buttons.forEach(button=>button.disabled=true);return}try{const result=await silk.media();if(!el.isConnected)return;buttons.forEach(button=>button.disabled=!result?.available);el.querySelector('.cc-track').textContent=result?.available?result.title:'No media playing';el.querySelector('.cc-artist').textContent=result?.available?result.artist:'Open a player to see controls';if(result?.available){const play=el.querySelector('[data-media="play-pause"]');play.innerHTML=result.playing?IC.pause:IC.play;play.setAttribute('aria-label',result.playing?'Pause':'Play')}}catch(error){console.error('Could not read media status:',error);buttons.forEach(button=>button.disabled=true)}};
 el.querySelectorAll('[data-media]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{const result=await silk.media(button.dataset.media);if(!result?.available)setStatus('Media controls are unavailable.');await loadMedia()}catch(error){console.error('Could not control media playback:',error);setStatus('Could not control media playback.')}});
 refreshWifi();refreshBluetooth();loadMedia();
 const brightValue=el.querySelector('.cc-bright-value'),volumeValue=el.querySelector('.cc-volume-value'),muteButton=el.querySelector('[data-a="mute"]');
 const updateBri=immediate=>{brightValue.textContent=`${brightness.value}%`;paintFill(brightness);setBrightness(brightness.value,immediate,status)};
 brightness.oninput=()=>updateBri(false);brightness.onchange=()=>updateBri(true);
 const updateVol=immediate=>{volumeValue.textContent=`${volumeSlider.value}%`;paintFill(volumeSlider);muteButton.classList.toggle('on',Number(volumeSlider.value)===0);setVolume(volumeSlider.value,immediate,status)};
 volumeSlider.oninput=()=>updateVol(false);volumeSlider.onchange=()=>updateVol(true);
 muteButton.onclick=()=>{if(volumeSlider.disabled){setStatus('Volume control is unavailable.');return}const next=cfg.muted?(cfg.lastAudibleVolume||lastAudibleVolume||50):0;setVolume(next,true,status);volumeSlider.value=String(next);volumeValue.textContent=`${next}%`;paintFill(volumeSlider);muteButton.classList.toggle('on',cfg.muted);muteButton.setAttribute('aria-label',cfg.muted?'Unmute output':'Mute output')};
 paintFill(brightness);paintFill(volumeSlider);
 if(window.silk&&silk.platform==='linux'&&silk.brightness){
  /* The user's saved level wins. If it is currently shown by screen dimming, re-apply it to the hardware instead of adopting the hardware value, which would snap the slider to 100% and remove the dimming. */
  if(!hardwareBrightness&&bri<100)setBrightness(bri,true,status);
  else silk.brightness().then(actual=>{if(!Number.isFinite(actual)||!el.isConnected)return;hardwareBrightness=true;bri=cfg.bri=actual;brightness.value=String(actual);el.querySelector('.cc-bright-value').textContent=`${actual}%`;paintFill(brightness);dim.style.opacity='0';save()});
 }
 if(window.silk&&silk.platform==='linux'&&silk.volume)silk.volume().then(actual=>{if(!Number.isFinite(actual)){volumeSlider.disabled=true;el.querySelector('.cc-volume-value').textContent='Unavailable';status.textContent='Audio output control is unavailable.';return}volume=cfg.volume=actual;cfg.muted=actual===0;if(actual>0)lastAudibleVolume=cfg.lastAudibleVolume=actual;volumeSlider.value=String(actual);el.querySelector('.cc-volume-value').textContent=`${actual}%`;muteButton.classList.toggle('on',cfg.muted);paintFill(volumeSlider);save()});
 else{volumeSlider.disabled=true;el.querySelector('.cc-volume-value').textContent='Unavailable'}
 return el}
function calEl(){const n=new Date(),f=new Date(n.getFullYear(),n.getMonth(),1).getDay(),dm=new Date(n.getFullYear(),n.getMonth()+1,0).getDate(),el=document.createElement('div');el.className='calw';
 let h='<h5>'+n.toLocaleString([],{month:'long',year:'numeric'})+'</h5><div class="cal">'+'SMTWTFS'.split('').map(c=>'<i>'+c+'</i>').join('')+'<b></b>'.repeat(f);
 for(let d=1;d<=dm;d++)h+='<b'+(d===n.getDate()?' class="today"':'')+'>'+d+'</b>';el.innerHTML=h+'</div>';return el}
function fitPopup(el,x,y,alignRight=false){
 el.style.left='0px';el.style.right='auto';el.style.top='0px';
 const width=el.offsetWidth,height=el.offsetHeight,margin=8;
 const left=alignRight?x-width:x,top=y;
 el.style.left=`${Math.max(margin,Math.min(innerWidth-width-margin,left))}px`;
 el.style.top=`${Math.max(margin,Math.min(innerHeight-height-margin,top))}px`;
 el.style.transformOrigin=alignRight?'top right':'top left';
}
function openK(b){const k=b.dataset.k,right=b.parentNode===mright;let el;
 if(k==='apple')el=listEl([['About SilkOS',()=>launch('settings')],'-',[(document.body.classList.contains('lite')?'✓ ':'    ')+'Lite Mode (no blur)',toggleLite],['Enter Full Screen',toggleFS,'F11'],'-',['Lock Screen',lockScreen],['Sleep',()=>power('sleep')],['Restart…',()=>power('restart')],['Shut Down…',()=>power('off')]]);
 else if(k==='spaces')el=listEl([...workspaceNames.map((name,index)=>[(index===activeSpace?'✓ ':'    ')+name,()=>switchSpace(index),index===activeSpace?'Current':'Ctrl+Alt+'+(index<activeSpace?'←':'→'),index===activeSpace]),'-',['Swipe with three or four fingers to switch desktops',null,'',true]]);
 else if(k==='cc')el=ccEl();else if(k==='clock')el=calEl();
 else if(k==='wifi')el=listEl([[wfInfo?(wfInfo.connected?(wfInfo.type==='wifi'?'Wi-Fi: ':'Network: ')+(wfInfo.name||'Connected'):'Not connected'):'Wi-Fi: '+(navigator.onLine?'Connected':'Not connected'),null,'',true]]);
 else if(k==='bat')el=listEl([[batInfo?Math.round(batInfo.level*100)+'% · '+(batInfo.charging?'Charging':'On battery'):'Battery',null,'',true]]);
 else if(k.startsWith(NATIVE_KEY)){el=document.createElement('div');const node=nativeNode(Number(k.slice(NATIVE_KEY.length)));nativeMenuItems(el,node?node.children:[])}
 else el=listEl(curMenus[k]||[]);
 closeDd(true,true);ddKey=k;b.classList.add('on');dd=el;el.classList.add('dd');document.body.appendChild(el);
 const r=b.getBoundingClientRect();fitPopup(el,right?r.right:r.left,r.bottom+4,right);
 requestAnimationFrame(()=>el.classList.add('on'))}
function closeDd(now,keepNative){
 closeNativeChild();
 const wasNative=!!ddKey&&ddKey.startsWith(NATIVE_KEY);
 if(!dd)return;
 const d=dd;dd=null;ddKey=null;document.querySelectorAll('.mi.on').forEach(x=>x.classList.remove('on'));d.classList.remove('on');setTimeout(()=>d.remove(),now?0:220);
 if(!keepNative&&wasNative&&nativeClearPending)dropNativeBar()}
mright.innerHTML='<button class="mi" id="spaces" data-k="spaces" aria-label="Desktop spaces"></button><button class="mi" id="bat" data-k="bat"></button><button class="mi" data-k="wifi">'+IC.wifi+'</button><button class="mi" data-k="srch">'+IC.srch+'</button><button class="mi" data-k="cc">'+IC.cc+'</button><button class="mi" id="clock" data-k="clock"></button>';
wire(mright);
updateSpaceButton();
/* Each status poll runs a helper process on Linux, so idle them while the shell is hidden. */
function statusPoll(interval,poll){
 let timer=null,pending=false;
 const run=()=>{if(pending)return;pending=true;Promise.resolve(poll()).catch(error=>console.error(error)).then(()=>{pending=false})},
  stop=()=>{if(timer){clearInterval(timer);timer=null}},
  start=()=>{if(timer||document.hidden)return;run();timer=setInterval(run,interval)};
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else start()});
 start()
}
if(window.silk&&silk.platform==='linux'&&silk.battery)statusPoll(30000,()=>silk.battery().then(r=>{if(!r){$('#bat').style.display='none';return}batInfo={level:r.level/100,charging:r.charging};$('#bat').style.display='';$('#bat').innerHTML=IC.bat+'<span>'+r.level+'%</span>'}));else if(navigator.getBattery)navigator.getBattery().then(b=>{batInfo=b;const u=()=>{$('#bat').innerHTML=IC.bat+'<span>'+Math.round(b.level*100)+'%</span>'};u();b.addEventListener('levelchange',u);b.addEventListener('chargingchange',u)}).catch(()=>{});
let wfInfo=null;const wf=mright.querySelector('[data-k=wifi]'),wfu=()=>wf.style.opacity=(wfInfo?wfInfo.connected:navigator.onLine)?1:.4;wfu();addEventListener('online',wfu);addEventListener('offline',wfu);
if(window.silk&&silk.platform==='linux'&&silk.wifi)statusPoll(10000,()=>silk.wifi().then(r=>{wfInfo=r;wfu()}));
/* Re-apply the saved brightness once at startup: screen dimming through gamma does not survive a restart of the display server. */
if(window.silk?.platform==='linux'&&silk.brightness&&cfg.bri<100)setBrightness(cfg.bri,true);
if(window.silk?.platform==='linux'&&silk.workspaces)statusPoll(900,async()=>{await syncSystemWorkspace()});
/* spotlight */
document.body.insertAdjacentHTML('beforeend','<div id="spot" class="glass"><input placeholder="Spotlight Search" spellcheck="false" autocomplete="off"><div class="srs"></div></div>');
const sp=$('#spot'),spi=sp.querySelector('input'),srs=sp.querySelector('.srs');let sres=[],si=0;
function spot(on){sp.classList.toggle('on',on);if(on){closeDd(true);spi.value='';sfind();setTimeout(()=>spi.focus(),30)}else spi.blur()}
function sfind(){const raw=spi.value.trim(),v=raw.toLowerCase();sres=[];
 const all=Object.entries(apps).filter(([k,a])=>!v||a.n.toLowerCase().includes(v)).map(([k,a])=>({i:a.i,t:a.n,s:'Application',f:()=>launch(k)}));
 if(v&&/^[\d\s+\-*/().%]+$/.test(v)&&/\d/.test(v)){try{const r=Function('"use strict";return ('+v+')')();if(isFinite(r))sres.push({i:'🧮',t:String(+r.toPrecision(12)),s:'Calculator',f:()=>launch('calc')})}catch(e){}}
 sres=sres.concat(all);if(v)sres.push({i:'🔍',t:'Search the web for “'+raw+'”',s:'Browser',f:()=>openUrl(raw)});
 si=0;spaint()}
function spaint(){srs.innerHTML=sres.map((r,i)=>`<div class="sr${i===si?' on':''}" data-i="${i}"><i>${r.i}</i><span>${esc(r.t)}</span><em>${r.s}</em></div>`).join('');
 srs.querySelectorAll('.sr').forEach(n=>n.onclick=()=>{const r=sres[+n.dataset.i];spot(false);r.f()})}
spi.oninput=sfind;
spi.onkeydown=e=>{if(e.key==='ArrowDown'){si=Math.min(si+1,sres.length-1);spaint();e.preventDefault()}else if(e.key==='ArrowUp'){si=Math.max(si-1,0);spaint();e.preventDefault()}else if(e.key==='Enter'&&sres[si]){const r=sres[si];spot(false);r.f()}else if(e.key==='Escape')spot(false)};
/* launchpad */
document.body.insertAdjacentHTML('beforeend','<div id="lp"><input placeholder="Search" spellcheck="false" autocomplete="off"><div class="lpg"></div></div>');
const lp=$('#lp'),lpi=lp.querySelector('input'),lpg=lp.querySelector('.lpg');
const lpOn=()=>lp.classList.contains('on');
function lpList(){const v=lpi.value.trim().toLowerCase();return Object.keys(apps).filter(k=>!v||apps[k].n.toLowerCase().includes(v))}
function lpDraw(){const l=lpList(),q=!!lpi.value.trim();
 const ordered=orderedIconIds(l,'launchpadOrder');
 lpg.innerHTML=ordered.length?ordered.map((k,i)=>`<div class="lpa${q&&!i?' sel':''}" data-id="${esc(k)}" role="button" tabindex="0" aria-label="Launch ${esc(apps[k].n)}. Drag to reorder." style="--lp-delay:${Math.min(i,16)*12}ms;--lp-out-delay:${Math.max(0,Math.min(16,ordered.length-i-1))*10}ms"><b style="background:${apps[k].c}">${apps[k].svg||apps[k].i}</b><span>${esc(apps[k].n)}</span></div>`).join(''):'<div class="lpe">No Results</div>'}
const LP_VARS=['--lp-progress','--lp-blur','--lp-dim','--lp-grid-y','--lp-grid-scale','--lp-icon-y','--lp-icon-scale'];
const LP_BLUR=44,LP_DIM=.56;
/* The pinch maps straight onto the blur and the dim, so the desktop recedes exactly as far as the fingers travel.
   --lp-blur and --lp-dim are registered with @property, which is what lets the click-open path animate them too. */
function setLaunchpadGestureProgress(progress){
 const value=Math.max(0,Math.min(1,progress));
 lp.style.setProperty('--lp-progress',String(value));
 lp.style.setProperty('--lp-blur',`${(LP_BLUR*value).toFixed(2)}px`);
 lp.style.setProperty('--lp-dim',String(+(LP_DIM*value).toFixed(3)));
 lp.style.setProperty('--lp-grid-y',`${12*(1-value)}px`);
 lp.style.setProperty('--lp-grid-scale',String(.94+.06*value));
 lp.style.setProperty('--lp-icon-y',`${12*(1-value)}px`);
 lp.style.setProperty('--lp-icon-scale',String(.9+.1*value));
}
function beginLaunchpadGesture(startOpen,progress){
 if(!startOpen){closeDd(true);spot(false);mx=null;lpi.value='';lpDraw()}
 document.body.classList.add('launchpad-open');lp.classList.add('gesture-active');setLaunchpadGestureProgress(progress);syncFullscreenChrome()
}
function clearLaunchpadGesture(){
 lp.classList.remove('gesture-active');
 LP_VARS.forEach(property=>lp.style.removeProperty(property));
 if(!lpOn())document.body.classList.remove('launchpad-open');
 syncFullscreenChrome()
}
function launchpad(on=!lpOn()){
 if(lp.classList.contains('gesture-active'))clearLaunchpadGesture();
 if(on===lpOn())return;
 if(on){closeDd(true);spot(false);mx=null;document.body.classList.add('launchpad-open');lpi.value='';lpDraw();void lp.offsetWidth;lp.classList.add('on');setTimeout(()=>lpi.focus(),30)}
 else{lp.classList.remove('on');document.body.classList.remove('launchpad-open');lpi.blur()}syncFullscreenChrome()}
function lpGo(id){launchpad(false);setTimeout(()=>launch(id),cfg.reduceMotion?20:500+Math.min(24,lpg.querySelectorAll('.lpa').length)*14)}
setupIconReordering(lpg,'.lpa','launchpadOrder');
lp.onclick=e=>{const a=e.target.closest('.lpa');if(a)lpGo(a.dataset.id);else if(!e.target.closest('input'))launchpad(false)};
lp.onkeydown=e=>{const a=e.target.closest('.lpa');if(a&&(e.key==='Enter'||e.key===' ')){e.preventDefault();lpGo(a.dataset.id)}};
lpi.oninput=lpDraw;
lpi.onkeydown=e=>{if(e.key==='Enter'){const l=orderedIconIds(lpList(),'launchpadOrder');if(l.length)lpGo(l[0])}else if(e.key==='Escape')launchpad(false)};
let touchGesture=null;
let touchpadGesture=null;
let verticalGesture=null;
let desktopExposed=false;
let deskSettleTimer=null;
const exposedWindows=()=>Object.values(wins).filter(win=>win.isConnected&&!win.classList.contains('min')&&!win.classList.contains('closing')&&!win.classList.contains('space-hidden')&&Number(win.dataset.space)===activeSpace);
function setDesktopExposeProgress(progress){
 const value=Math.max(0,Math.min(1,progress)),root=document.documentElement.style;
 root.setProperty('--desk-y',`${value*26}px`);root.setProperty('--desk-scale',String(1-value*.08));root.setProperty('--desk-opacity',String(1-value))
}
function settleDesktopExpose(open,progress){
 clearTimeout(deskSettleTimer);desktopExposed=open;
 const settle=Math.round(150+Math.abs((open?1:0)-(progress==null?1:progress))*200);
 document.documentElement.style.setProperty('--desk-settle',`${settle}ms`);
 document.body.classList.add('desk-expose-settling');setDesktopExposeProgress(open?1:0);syncFullscreenChrome();
 deskSettleTimer=setTimeout(()=>{document.body.classList.remove('desk-expose-settling');document.documentElement.style.removeProperty('--desk-settle');if(!desktopExposed)document.body.classList.remove('desk-expose');syncFullscreenChrome()},settle+20)
}
function beginDesktopExpose(){
 if(desktopExposed||!exposedWindows().length)return null;
 document.body.classList.add('desk-expose');setDesktopExposeProgress(0);syncFullscreenChrome();
 return {kind:'desktop',progress:0,speed:0,lastMove:0}
}
function restoreDesktop(){if(desktopExposed)settleDesktopExpose(false)}
function beginSwitcherGesture(){
 if(desktopExposed){restoreDesktop();return null}
 const ids=switcherIds();if(!ids.length)return null;
 const current=ids.indexOf(curApp);
 switchState={ids,index:current<0?0:current};paintSwitcher();
 switcher.classList.add('gesture');switcher.style.setProperty('--sw-progress','0');
 return {kind:'switcher',progress:0,speed:0,lastMove:0}
}
function beginVerticalGesture(direction){
 /* A swipe down while the switcher is up dismisses it instead of exposing the desktop behind it. */
 if(switchState){if(direction==='down')finishWindowSwitch(false);return null}
 return direction==='up'?beginSwitcherGesture():direction==='down'?beginDesktopExpose():null}
function updateVerticalGesture(state,progress){
 if(!state)return;
 trackGestureSpeed(state,progress);
 state.progress=Math.max(0,Math.min(1,progress));
 if(state.kind==='switcher')switcher.style.setProperty('--sw-progress',String(state.progress));else setDesktopExposeProgress(state.progress)
}
function finishVerticalGesture(state,commit){
 if(!state)return;
 const completed=commit&&shouldCommit(state);
 if(state.kind==='switcher'){
  switcher.classList.remove('gesture');switcher.style.removeProperty('--sw-progress');
  if(completed)switcher.classList.add('on');else finishWindowSwitch(false);
  return
 }
 settleDesktopExpose(completed,state.progress)
}
function handleTouchpadGesture(gesture){
 if(!gesture)return;
 if(gesture.type==='swipe'){
  if(touchGesture?.fingers===4)return;
  if(gesture.direction==='up'||gesture.direction==='down'){
   if(gesture.phase==='begin'){
    if(!verticalGesture&&!spaceGesture&&!lpOn()){verticalGesture=beginVerticalGesture(gesture.direction);if(verticalGesture)verticalGesture.direction=gesture.direction}
    return
   }
   if(!verticalGesture)return;
   const state=verticalGesture;
   if(gesture.phase==='end'){verticalGesture=null;if(gesture.direction===state.direction)updateVerticalGesture(state,gesture.progress);finishVerticalGesture(state,gesture.direction===state.direction);return}
   if(gesture.direction===state.direction)updateVerticalGesture(state,gesture.progress);
   return
  }
  if(verticalGesture)return;
  if(gesture.phase==='begin'){
   const direction=gesture.direction==='left'?1:-1,state=beginSpaceGesture(direction);
   touchpadGesture={type:'swipe',direction,ignored:!state};
   return
  }
  if(!touchpadGesture||touchpadGesture.type!=='swipe')return;
  if(touchpadGesture.ignored){if(gesture.phase==='end')touchpadGesture=null;return}
  const active=touchpadGesture;
  if(gesture.direction!==(active.direction===1?'left':'right'))return;
  if(spaceGesture)updateSpaceGesture(spaceGesture,gesture.progress);
  if(gesture.phase==='end'){touchpadGesture=null;finishSpaceGesture(true)}
  return
 }
 if(touchGesture?.fingers===5||verticalGesture)return;
 if(gesture.phase==='begin'){
  const startOpen=lpOn(),opening=gesture.direction==='in',ignored=opening?startOpen:!startOpen;
  touchpadGesture={type:'pinch',direction:gesture.direction,ignored};
  if(!ignored)beginLaunchpadGesture(startOpen,opening?0:1);
  return
 }
 if(!touchpadGesture||touchpadGesture.type!=='pinch')return;
 const active=touchpadGesture;
 if(active.ignored){if(gesture.phase==='end')touchpadGesture=null;return}
 const progress=active.direction==='in'?gesture.progress:1-gesture.progress;
 setLaunchpadGestureProgress(progress);
 if(gesture.phase==='end'){touchpadGesture=null;launchpad(progress>=.5)}
}
if(window.silk?.onTouchpadGesture)silk.onTouchpadGesture(handleTouchpadGesture);
/* Native menu frames only arrive while an X window other than SilkOS is frontmost. */
if(window.silk?.nativeMenu?.onBar)silk.nativeMenu.onBar(applyNativeBar);
function touchCenter(touches){const points=[...touches];return points.reduce((point,touch)=>({x:point.x+touch.clientX/points.length,y:point.y+touch.clientY/points.length}),{x:0,y:0})}
function touchSpread(touches,center){const points=[...touches];return points.reduce((total,touch)=>total+Math.hypot(touch.clientX-center.x,touch.clientY-center.y),0)/points.length}
document.addEventListener('touchstart',event=>{
 if(event.touches.length!==4&&event.touches.length!==5)return;
 const center=touchCenter(event.touches),spread=touchSpread(event.touches,center);
 touchGesture={fingers:event.touches.length,start:center,last:center,spread};
 if(event.touches.length===5){
  touchGesture.startOpen=lpOn();touchGesture.progress=touchGesture.startOpen?1:0;
  beginLaunchpadGesture(touchGesture.startOpen,touchGesture.progress)
 }
},{passive:true});
document.addEventListener('touchmove',event=>{
 if(!touchGesture||event.touches.length!==touchGesture.fingers)return;
 touchGesture.last=touchCenter(event.touches);touchGesture.lastPoints=[...event.touches].map(touch=>({clientX:touch.clientX,clientY:touch.clientY}));event.preventDefault();
 if(touchGesture.fingers===4){
  const dx=touchGesture.last.x-touchGesture.start.x,dy=touchGesture.last.y-touchGesture.start.y;
  if(Math.abs(dx)>8&&Math.abs(dx)>Math.abs(dy)*1.1){
   if(verticalGesture){const state=verticalGesture;verticalGesture=null;finishVerticalGesture(state,false)}
   touchGesture.verticalDirection='';
   const direction=dx<0?1:-1;
   if(touchGesture.spaceDirection!==direction){
    if(spaceGesture)finishSpaceGesture(false,true);
    touchGesture.spaceDirection=direction;beginSpaceGesture(direction)
   }
   if(spaceGesture){touchGesture.spaceProgress=Math.min(1,Math.abs(dx)/innerWidth);updateSpaceGesture(spaceGesture,touchGesture.spaceProgress)}
  }else if(Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)*1.1){
   if(spaceGesture){finishSpaceGesture(false,true);touchGesture.spaceDirection=0;touchGesture.spaceProgress=0}
   const direction=dy<0?'up':'down';
   if(touchGesture.verticalDirection!==direction){
    if(verticalGesture){const state=verticalGesture;verticalGesture=null;finishVerticalGesture(state,false)}
    touchGesture.verticalDirection=direction;verticalGesture=beginVerticalGesture(direction)
   }
   if(verticalGesture){touchGesture.verticalProgress=Math.min(1,Math.abs(dy)/innerHeight);updateVerticalGesture(verticalGesture,touchGesture.verticalProgress)}
  }else{
   if(spaceGesture){finishSpaceGesture(false,true);touchGesture.spaceDirection=0;touchGesture.spaceProgress=0}
   if(verticalGesture){const state=verticalGesture;verticalGesture=null;finishVerticalGesture(state,false)}
   touchGesture.verticalDirection=''
  }
 }
 if(touchGesture.fingers===5){
  const spread=touchSpread(touchGesture.lastPoints,touchGesture.last),delta=touchGesture.startOpen?spread-touchGesture.spread:touchGesture.spread-spread;
  touchGesture.progress=Math.max(0,Math.min(1,(delta+8)/Math.max(80,touchGesture.spread*.85)));
  setLaunchpadGestureProgress(touchGesture.progress)
 }
},{passive:false});
document.addEventListener('touchend',event=>{
 if(!touchGesture||event.touches.length>=touchGesture.fingers)return;
 const gesture=touchGesture;touchGesture=null;
 if(gesture.fingers===4){
  if(verticalGesture&&gesture.verticalDirection){const state=verticalGesture;verticalGesture=null;finishVerticalGesture(state,true)}
  else if(gesture.spaceDirection)finishSpaceGesture(true)
 }else launchpad(gesture.progress>=.5);
},{passive:true});
document.addEventListener('touchcancel',()=>{const gesture=touchGesture;touchGesture=null;if(gesture?.fingers===5)launchpad(gesture.startOpen);else if(gesture?.fingers===4){if(verticalGesture){const state=verticalGesture;verticalGesture=null;finishVerticalGesture(state,false)}else finishSpaceGesture(false)}},{passive:true});
dock.addEventListener('click',e=>{if(lpOn()&&!e.target.closest('[data-id=launchpad]'))launchpad(false)});
document.addEventListener('pointerdown',e=>{if(desktopExposed)restoreDesktop();if(switchState&&!e.target.closest('.switcher'))finishWindowSwitch(false);if(dd&&!e.target.closest('.dd,.mi'))closeDd();if(sp.classList.contains('on')&&!e.target.closest('#spot,[data-k=srch]'))spot(false)});
addEventListener('blur',()=>closeDd());
let switchState=null;
const switcher=document.createElement('section');switcher.className='switcher';switcher.setAttribute('role','dialog');switcher.setAttribute('aria-label','Open windows');switcher.innerHTML='<h2 class="switcher-title">Open Windows</h2><div class="switcher-list"></div>';document.body.appendChild(switcher);
function paintSwitcher(){
 if(!switchState)return;
 const list=switcher.querySelector('.switcher-list');list.classList.toggle('list',cfg.switcherStyle==='list');
 list.innerHTML=switchState.ids.map((id,index)=>`<button class="switcher-item${index===switchState.index?' active':''}" data-id="${esc(id)}" aria-pressed="${index===switchState.index}"><span class="switcher-icon"${cfg.showSwitcherIcons?'':' hidden'}>${apps[id].svg||esc(apps[id].i)}</span><span class="switcher-name">${esc(apps[id].n)}</span></button>`).join('');
 list.querySelectorAll('.switcher-item').forEach(item=>item.onclick=()=>{switchState.index=switchState.ids.indexOf(item.dataset.id);finishWindowSwitch(true)});
}
function switcherIds(){return Object.entries(wins).filter(([,win])=>win.isConnected&&!win.classList.contains('closing')&&(cfg.includeMinimized||!win.classList.contains('min'))).sort((a,b)=>cfg.switcherOrder==='alphabetical'?apps[a[0]].n.localeCompare(apps[b[0]].n):(Number(b[1].style.zIndex)||0)-(Number(a[1].style.zIndex)||0)).map(([id])=>id)}
function cycleWindows(reverse=false){
 const ids=switcherIds();
 if(!ids.length)return;
 if(!switchState){const current=ids.indexOf(curApp);switchState={ids,index:current<0?(reverse?0:ids.length-1):current}}
 else switchState.ids=ids.filter(id=>switchState.ids.includes(id));
 if(!switchState.ids.length){switchState=null;return}
 if(switchState.index>=switchState.ids.length)switchState.index=0;
 switchState.index=(switchState.index+(reverse?-1:1)+switchState.ids.length)%switchState.ids.length;
 paintSwitcher();switcher.classList.add('on');
}
function finishWindowSwitch(commit){
 if(!switchState)return;
 const id=commit?switchState.ids[switchState.index]:null;switchState=null;switcher.classList.remove('on');
 if(id&&wins[id]){const win=wins[id];if(win.classList.contains('min'))restore(win,id);focus(win,id)}
}
function shortcut(k){if(k==='space-left')return switchSpace((activeSpace+3)%4,true,-1);if(k==='space-right')return switchSpace((activeSpace+1)%4,true,1);if(k==='alt-tab'||k==='alt-tab-reverse')return cycleWindows(k==='alt-tab-reverse');if(k==='alt-release'){finishWindowSwitch(true);return}if(k==='lp')return launchpad();if(k==='k'||k===' ')return spot(!sp.classList.contains('on'));const b=curApp==='browser'&&wins.browser&&wins.browser._b;if(!b)return;
 if(k==='t')b.add('');else if(k==='w')b.closeCur();else if(k==='l')b.addr();else if(k==='r')b.reload();else if(k==='f')b.find();else if(k==='d')b.addBm()}
if(window.silk&&silk.onShortcut)silk.onShortcut(shortcut);
document.addEventListener('keydown',e=>{if(e.ctrlKey&&e.altKey&&e.key==='ArrowLeft'){e.preventDefault();shortcut('space-left')}else if(e.ctrlKey&&e.altKey&&e.key==='ArrowRight'){e.preventDefault();shortcut('space-right')}else if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey&&['t','l','w','r','f','k','d',' '].includes(e.key.toLowerCase())){e.preventDefault();shortcut(e.key.toLowerCase())}else if(e.key==='F4'){e.preventDefault();launchpad(true)}else if(e.key==='Enter'&&switchState){e.preventDefault();finishWindowSwitch(true)}else if(e.key==='Escape'){if(desktopExposed)restoreDesktop();if(switchState)finishWindowSwitch(false);closeDd();spot(false);launchpad(false);const bf=curApp==='browser'&&wins.browser&&wins.browser._b;if(bf)bf.findOff()}});
if(!window.silk){
 document.addEventListener('keydown',e=>{if(e.altKey&&e.key==='Tab'){e.preventDefault();cycleWindows(e.shiftKey)}else if(e.key==='Escape'&&switchState){e.preventDefault();finishWindowSwitch(false)}});
 document.addEventListener('keyup',e=>{if(e.key==='Alt'||e.key==='AltGraph')finishWindowSwitch(true)});
}
lastAudibleVolume=cfg.lastAudibleVolume||cfg.volume||50;
const save=()=>{try{localStorage.setItem('silk.cfg',JSON.stringify(cfg))}catch(e){}};
const ENG={google:{n:'Google',u:'https://www.google.com/search?q='},ddg:{n:'DuckDuckGo',u:'https://duckduckgo.com/?q='},bing:{n:'Bing',u:'https://www.bing.com/search?q='}};
function searchURL(v){return(ENG[cfg.engine]||ENG.google).u+encodeURIComponent(v)}
const WALLS=[['Aurora','radial-gradient(60% 60% at 20% 20%,#7aa7ff,transparent),radial-gradient(50% 50% at 80% 30%,#ff8fc7,transparent),radial-gradient(60% 60% at 60% 90%,#ffc27a,transparent),#3b3b8f'],['Sunset','radial-gradient(70% 60% at 30% 100%,#ff5e62,transparent),radial-gradient(60% 60% at 80% 20%,#ffc371,transparent),#5b2a86'],['Ocean','radial-gradient(60% 60% at 20% 30%,#4facfe,transparent),radial-gradient(60% 70% at 85% 80%,#00f2c3,transparent),#0b2a5b'],['Forest','radial-gradient(60% 60% at 25% 25%,#9be15d,transparent),radial-gradient(60% 60% at 80% 80%,#00a99d,transparent),#0f3d2e'],['Graphite','radial-gradient(60% 60% at 30% 20%,#6b7280,transparent),radial-gradient(60% 60% at 80% 90%,#374151,transparent),#111827']];
// Windows paint a viewport-anchored copy of the wallpaper rather than a live backdrop-filter:
// one blur layer per window measured ~21fps with seven windows open, against the display's 57fps cap.
function applyWindowVibrancy(wall){const painted=getComputedStyle(wall),R=document.documentElement,base=painted.backgroundColor;
 R.style.setProperty('--material-vibrancy',painted.backgroundImage);
 R.style.setProperty('--material-base',/,\s*0\)$/.test(base)?'var(--win)':base);
 R.style.setProperty('--material-vibrancy-size',cfg.wallpaperImage?'cover':'120% 120%');
 document.body.classList.toggle('photo-wallpaper',!!cfg.wallpaperImage)}
let appliedTapToClick=null;
/* Applied once at startup and again whenever the setting changes, so the touchpad always follows the saved choice. */
function applyTrackpad(){
 if(window.silk?.platform!=='linux'||!silk.trackpad)return;
 const wanted=!!cfg.tapToClick;if(wanted===appliedTapToClick)return;appliedTapToClick=wanted;
 silk.trackpad.setTapToClick(wanted).then(result=>{if(!result?.available)appliedTapToClick=null}).catch(error=>{appliedTapToClick=null;console.error('Could not change tap to click:',error)})
}
function applyCfg(){const R=document.documentElement,dark=cfg.theme==='dark'||(cfg.theme==='auto'&&matchMedia('(prefers-color-scheme:dark)').matches);cfg.theme==='auto'?R.removeAttribute('data-theme'):R.setAttribute('data-theme',cfg.theme);R.style.setProperty('--accent',cfg.accent);updateCursorSize();
 const wall=$('#wall');wall.style.background=cfg.wallpaperImage?`center / cover no-repeat url("${cfg.wallpaperImage}")`:WALLS[cfg.wall]?WALLS[cfg.wall][1]:WALLS[0][1];document.body.classList.toggle('static-wallpaper',!cfg.wallpaperMotion);document.body.classList.toggle('lite',!!cfg.lite);
 applyWindowVibrancy(wall);
 document.body.classList.toggle('reduce-motion',!!cfg.reduceMotion);document.body.classList.toggle('high-contrast',!!cfg.highContrast);document.body.classList.toggle('high-contrast-dark',!!cfg.highContrast&&dark);
 const dockWrap=$('#dockwrap');dockWrap.classList.remove('pos-left','pos-right');if(cfg.dockPosition!=='bottom')dockWrap.classList.add('pos-'+cfg.dockPosition);
 baseWanted=cfg.dock;measureDock();dockWrap.classList.toggle('ah',!!cfg.hide);bri=cfg.bri;dim.style.opacity=hardwareBrightness?'0':(100-bri)/100*.85;syncCursorDim();applyTrackpad();clk()}
document.addEventListener('mousemove',e=>{if(!cfg.hide)return;const w=$('#dockwrap'),edge=cfg.dockPosition==='bottom'?e.clientY>innerHeight-10:cfg.dockPosition==='left'?e.clientX<10:e.clientX>innerWidth-10,near=cfg.dockPosition==='bottom'?e.clientY>innerHeight-120:cfg.dockPosition==='left'?e.clientX<120:e.clientX>innerWidth-120;w.classList.toggle('show',edge||(w.classList.contains('show')&&near))});
function resizify(el){['n','s','e','w','ne','nw','se','sw'].forEach(d=>{const h=document.createElement('div');h.className='rz '+d;el.appendChild(h);
 h.onpointerdown=ev=>{if(el.dataset.max||el.dataset.fullscreen)return;ev.preventDefault();ev.stopPropagation();h.setPointerCapture(ev.pointerId);
  const r={l:el.offsetLeft,t:el.offsetTop,w:el.offsetWidth,h:el.offsetHeight,x:ev.clientX,y:ev.clientY};el.classList.add('rzing');
  const mv=m=>{const dx=m.clientX-r.x,dy=m.clientY-r.y;let L=r.l,T=r.t,W=r.w,H=r.h;
   const minW=Math.min(260,Math.max(160,innerWidth-16)),minH=Math.min(200,Math.max(100,innerHeight-36));
   if(d.includes('e'))W=Math.max(minW,Math.min(innerWidth-r.l-8,r.w+dx));if(d.includes('s'))H=Math.max(minH,Math.min(innerHeight-r.t-8,r.h+dy));
   if(d.includes('w')){W=Math.max(minW,Math.min(r.w-dx,r.l+r.w-8));L=r.l+r.w-W}if(d.includes('n')){H=Math.max(minH,Math.min(r.h-dy,r.t+r.h-28));T=r.t+r.h-H}
   Object.assign(el.style,{left:L+'px',top:T+'px',width:W+'px',height:H+'px'})};
  const up=()=>{el.classList.remove('rzing');saveWindowBounds(Object.keys(wins).find(id=>wins[id]===el),el);h.removeEventListener('pointermove',mv);h.removeEventListener('pointerup',up)};h.addEventListener('pointermove',mv);h.addEventListener('pointerup',up)}})}
function constrainWindows(){Object.values(wins).forEach(el=>{
 if(el.dataset.fullscreen){Object.assign(el.style,{left:'0px',top:'0px',width:innerWidth+'px',height:innerHeight+'px'});return}
 if(el.dataset.max){Object.assign(el.style,{left:'8px',top:'34px',width:Math.max(160,innerWidth-16)+'px',height:Math.max(120,innerHeight-132)+'px'});return}
 const minWidth=Math.min(260,Math.max(160,innerWidth-16)),width=Math.min(parseFloat(el.style.width),Math.max(minWidth,innerWidth-16)),height=Math.min(parseFloat(el.style.height),Math.max(120,innerHeight-36));
 Object.assign(el.style,{minWidth:minWidth+'px',width:width+'px',height:height+'px',left:Math.max(8,Math.min(innerWidth-width-8,parseFloat(el.style.left)))+'px',top:Math.max(28,Math.min(innerHeight-height-8,parseFloat(el.style.top)))+'px'})
})}
window.addEventListener('resize',()=>{constrainWindows();measureDock()});
document.addEventListener('contextmenu',e=>{if(e.target.closest('.win,.dd,#dockwrap,#menubar'))return;e.preventDefault();closeDd(true);
 const open=p=>{launch('settings');setTimeout(()=>wins.settings&&wins.settings._go(p),60)};
const el=listEl([['Change Wallpaper…',()=>open('app')],['Use '+(document.documentElement.dataset.theme==='dark'||(!document.documentElement.dataset.theme&&matchMedia('(prefers-color-scheme:dark)').matches)?'Light':'Dark')+' Mode',()=>{const dk=document.documentElement.dataset.theme==='dark'||(!document.documentElement.dataset.theme&&matchMedia('(prefers-color-scheme:dark)').matches);cfg.theme=dk?'light':'dark';save();applyCfg()}],'-',['Open Browser',()=>launch('browser')],['Spotlight Search',()=>spot(true),'Ctrl+K'],['Settings…',()=>open('gen')]]);
 ddKey='ctx';dd=el;el.classList.add('dd');document.body.appendChild(el);fitPopup(el,e.clientX,e.clientY);requestAnimationFrame(()=>el.classList.add('on'))});
applyCfg();
buildBar();
syncFlatpaks();
const startupApps=getSavedSessionWindows(),appsToLaunch=startupApps.length?startupApps:(cfg.startBrowser?['browser']:[]);
appsToLaunch.forEach((id,index)=>setTimeout(()=>launch(id),index*100));
if(appsToLaunch.includes('browser'))setTimeout(()=>wins.browser&&!wins.browser.dataset.max&&maxToggle(wins.browser),700+Math.max(0,appsToLaunch.indexOf('browser'))*100);
window.silkStartup?.ready();
