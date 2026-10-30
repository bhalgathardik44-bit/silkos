function finderInit(el){
 const body=el.querySelector('.body'),F=window.silk&&silk.files;
 body.innerHTML='<div class="fnd"><aside class="fsb"><div class="fsb-head">Favorites</div><div class="fsb-empty">Loading…</div></aside><div class="fmn"><div class="ftb"><div class="fnav"><button type="button" class="fup fback" aria-label="Back" disabled>‹</button><button type="button" class="fup ffwd" aria-label="Forward" disabled>›</button></div><b class="fpt"></b><label class="fsearch"><span aria-hidden="true">⌕</span><input type="search" placeholder="Search" aria-label="Search this folder" spellcheck="false" autocomplete="off"></label><button type="button" class="fnew" aria-label="New Folder" title="New Folder (Shift+Ctrl+N)">＋</button><button type="button" class="fsort" aria-label="Sort options" title="Sort options">⇅</button></div><div class="fhead"><span class="ficon"></span><span class="fh" data-sort="name"><span>Name</span><i class="fcar"></i></span><span class="fh" data-sort="size"><span>Size</span><i class="fcar"></i></span><span class="fh" data-sort="date"><span>Date Modified</span><i class="fcar"></i></span></div><div class="fls" role="listbox" aria-label="Files" tabindex="0"><div class="frows"></div></div><div class="fstatus"><span class="fcount"></span><span class="fmsg" role="status" aria-live="polite"></span><span class="fsel"></span></div></div></div>';
 const sb=body.querySelector('.fsb'),ls=body.querySelector('.fls'),rows=body.querySelector('.frows'),pt=body.querySelector('.fpt'),search=body.querySelector('.fsearch input'),fback=body.querySelector('.fback'),ffwd=body.querySelector('.ffwd'),fhead=body.querySelector('.fhead'),countEl=body.querySelector('.fcount'),selEl=body.querySelector('.fsel'),msgEl=body.querySelector('.fmsg'),newBtn=body.querySelector('.fnew'),sortBtn=body.querySelector('.fsort');
 if(!F){rows.innerHTML='<div class="stm">Finder works when SilkOS runs on Linux.</div>';return}
 const join=(dir,name)=>(dir.endsWith('/')?dir:dir+'/')+name;
 let cur='',locations={},items=[],details=new Map(),selected=new Set(),lastIndex=-1,navToken=0,renderToken=0,searchQuery='',hist=[],histIndex=-1,dragNames=null,messageTimer=null;
 const byName=(a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'});
 const displayPath=path=>locations.home&&(path===locations.home||path.startsWith(locations.home+'/'))?'~'+path.slice(locations.home.length):path;
 const detailOf=name=>details.get(name);
 const writable=()=>!!locations.home&&(cur===locations.home||cur.startsWith(locations.home+'/'));
 const fileIcon=name=>/\.(png|jpe?g|gif|webp|bmp|svg|avif|ico|heic)$/i.test(name)?'🖼️':/\.(mp3|wav|flac|ogg|m4a|aac|opus)$/i.test(name)?'🎵':/\.(mp4|mkv|webm|mov|avi)$/i.test(name)?'🎬':/\.(zip|tar|gz|xz|7z|rar|deb|flatpak)$/i.test(name)?'📦':/\.(txt|md|pdf|js|json|css|html|sh|py|yml|yaml|toml)$/i.test(name)?'📝':/\.exe$/i.test(name)?'🪟':'📄';
 const shownName=name=>cfg.hideFileExtensions&&!name.startsWith('.')?name.replace(/\.[^.]+$/,'')||name:name;
 const fmtSize=bytes=>{
  if(!Number.isFinite(bytes))return '';
  if(bytes<1024)return `${bytes} B`;
  const units=['KB','MB','GB','TB'];let value=bytes/1024,unit=0;
  while(value>=1024&&unit<units.length-1){value/=1024;unit++}
  return `${value<10?value.toFixed(1):Math.round(value)} ${units[unit]}`
 };
 const fmtDate=ms=>{
  if(!Number.isFinite(ms))return '';
  const date=new Date(ms);
  return date.toDateString()===new Date().toDateString()?date.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):date.toLocaleDateString([],{year:'numeric',month:'short',day:'numeric'})
 };
 const markName=(name,query)=>{
  const at=query?name.toLowerCase().indexOf(query.toLowerCase()):-1;
  if(at<0)return esc(name);
  return esc(name.slice(0,at))+'<mark>'+esc(name.slice(at,at+query.length))+'</mark>'+esc(name.slice(at+query.length))
 };
 function sortItems(list){
  const mode=cfg.finderSort||'folders';
  return [...list].sort((a,b)=>{
   if(a.dir!==b.dir)return a.dir?-1:1;
   if(mode==='name-desc')return -byName(a.name,b.name);
   if(mode==='date')return (detailOf(b.name)?.mtime||0)-(detailOf(a.name)?.mtime||0)||byName(a.name,b.name);
   if(mode==='size'){
    const left=a.dir?-1:detailOf(a.name)?.size||0,right=b.dir?-1:detailOf(b.name)?.size||0;
    return right-left||byName(a.name,b.name)
   }
   return byName(a.name,b.name)
  })
 }
 const displayed=()=>{
  const query=searchQuery.toLowerCase();
  return sortItems(query?items.filter(item=>item.name.toLowerCase().includes(query)):items)
 };
 const setMessage=(text,bad=false)=>{
  msgEl.textContent=text||'';msgEl.classList.toggle('bad',!!bad);
  clearTimeout(messageTimer);
  if(text&&!bad)messageTimer=setTimeout(()=>{msgEl.textContent=''},4200)
 };
 function updateStatus(){
  const visible=displayed(),total=items.length;
  countEl.textContent=searchQuery?`${visible.length} of ${total} item${total===1?'':'s'}`:`${total} item${total===1?'':'s'}`;
  if(!selected.size){selEl.textContent='';return}
  let bytes=0,known=false;
  selected.forEach(name=>{const info=detailOf(name);if(info&&!info.dir){bytes+=info.size;known=true}});
  selEl.textContent=`${selected.size} selected${known&&bytes?` · ${fmtSize(bytes)}`:''}`
 }
 function paintSelection(){
  rows.querySelectorAll('.fit').forEach(row=>{
   const on=selected.has(row.dataset.n);
   row.classList.toggle('sel',on);row.setAttribute('aria-selected',String(on))
  });
  updateStatus()
 }
 function selectName(names,focus=true){
  selected=new Set(names);paintSelection();
  if(!focus)return;
  const row=[...rows.querySelectorAll('.fit')].find(candidate=>selected.has(candidate.dataset.n));
  if(row)row.scrollIntoView({block:'nearest'})
 }
 function fillDetails(){
  rows.querySelectorAll('.fit').forEach(row=>{
   const info=detailOf(row.dataset.n);if(!info)return;
   const size=row.querySelector('.fsize'),date=row.querySelector('.fdate');
   if(size)size.textContent=info.dir?'—':fmtSize(info.size);
   if(date)date.textContent=fmtDate(info.mtime)
  });
  updateStatus()
 }
 async function hydrate(list,token){
  if(typeof F.stat!=='function')return;
  const names=list.filter(item=>!details.has(item.name)).map(item=>item.name);
  for(let start=0;start<names.length;start+=80){
   const chunk=names.slice(start,start+80);
   let result=null;
   try{result=await F.stat(chunk.map(name=>join(cur,name)))}catch(error){console.error('Could not read item details:',error)}
   if(token!==renderToken)return;
   if(!result?.ok)return;
   result.items.forEach(info=>details.set(String(info.path).split(/[\\/]/).pop(),info));
   fillDetails();
   /* Sorting by size or date cannot settle until the stats are in, so the list re-sorts once they arrive. */
   if((cfg.finderSort==='date'||cfg.finderSort==='size')&&!rows.querySelector('.fit.editing')){paint();return}
  }
 }
 function paint(){
  const token=++renderToken,visible=displayed(),scrollTop=ls.scrollTop;
  rows.innerHTML=visible.length?visible.map((item,index)=>{
   const name=item.name,on=selected.has(name);
   return `<div class="fit${on?' sel':''}" data-n="${esc(name)}" data-d="${item.dir?1:''}" role="option" aria-selected="${on}" draggable="true" style="--row:${Math.min(index,10)}" title="${esc(name)}"><span class="ficon">${item.dir?'📁':fileIcon(name)}</span><span class="fname">${markName(shownName(name),searchQuery)}</span><span class="fsize">${item.dir?'—':detailOf(name)?fmtSize(detailOf(name).size):''}</span><span class="fdate">${detailOf(name)?fmtDate(detailOf(name).mtime):''}</span></div>`
  }).join(''):`<div class="stm fempty">${searchQuery?`No items match “${esc(searchQuery)}”.`:'This folder is empty.'}</div>`;
  ls.scrollTop=scrollTop;
  pt.textContent=displayPath(cur);pt.title=cur;
  sb.querySelectorAll('[data-p]').forEach(place=>place.classList.toggle('on',place.dataset.p===cur));
  updateStatus();
  void hydrate(visible,token)
 }
 function paintNav(){
  fback.disabled=histIndex<=0;
  ffwd.disabled=histIndex>=hist.length-1
 }
 async function go(target,{push=true}={}){
  const token=++navToken,d=String(target||'/');
  let result=null;
  try{result=await F.list(d,!!cfg.showHiddenFiles)}catch(error){console.error('Could not list the folder:',error);result={error:'Could not open this folder.'}}
  if(token!==navToken)return;
  if(result?.error){
   setMessage(result.error,true);
   if(!cur){cur=d;pt.textContent=displayPath(d);rows.innerHTML=`<div class="stm fempty">${esc(result.error)}</div>`}
   return
  }
  cur=d;items=Array.isArray(result.items)?result.items:[];
  details=new Map();selected.clear();lastIndex=-1;searchQuery='';search.value='';
  cfg.finderLastLocation=d;save();
  if(push){hist=hist.slice(0,histIndex+1);hist.push(d);histIndex=hist.length-1}
  paintNav();paint()
 }
 const historyNav=delta=>{
  const next=histIndex+delta;
  if(next<0||next>=hist.length)return;
  histIndex=next;paintNav();
  void go(hist[histIndex],{push:false})
 };
 const configuredLocation=()=>cfg.finderLocation==='last'?cfg.finderLastLocation||locations.home:locations[cfg.finderLocation]||locations.home;
 const copyPath=path=>{navigator.clipboard?.writeText(path).catch(error=>console.error('Could not copy the path:',error))};
 const sortMenu=()=>{
  const pick=(label,value)=>[(cfg.finderSort===value?'✓ ':'    ')+label,()=>{cfg.finderSort=value;save();paint();paintSortHeader()}];
  return [pick('Folders First','folders'),pick('Name','name'),pick('Name (Z–A)','name-desc'),'-',pick('Date Modified','date'),pick('Size','size')]
 };
 function paintSortHeader(){
  const mode=cfg.finderSort||'folders';
  fhead.querySelectorAll('.fh').forEach(cell=>{
   const key=cell.dataset.sort,on=key==='name'?(mode==='name'||mode==='folders'||mode==='name-desc'):key===mode;
   cell.classList.toggle('on',on);
   const car=cell.querySelector('.fcar');
   if(car)car.textContent=on?(key==='name'&&mode==='name-desc'?'▼':key==='name'?'▲':key==='date'||key==='size'?'▼':''):''
  })
 }
 const backgroundMenu=(x,y)=>[
  ['New Folder',()=>beginCreate()],
  ['Refresh',()=>go(cur,{push:false})],
  '-',
  [cfg.showHiddenFiles?'✓ Show Hidden Files':'    Show Hidden Files',()=>toggleHidden()],
  '-',
  ['Sort By…',()=>showContextMenu(sortMenu(),x,y)],
  '-',
  ['Copy Folder Path',()=>copyPath(cur)]
 ];
 function toggleHidden(){
  cfg.showHiddenFiles=!cfg.showHiddenFiles;save();void go(cur,{push:false});
  if(typeof buildBar==='function')buildBar()
 }
 ls.addEventListener('click',e=>{
  const row=e.target.closest('.fit');
  if(!row||e.target.closest('.fedit'))return;
  const visible=displayed(),index=visible.findIndex(item=>item.name===row.dataset.n);
  if(index<0)return;
  if(e.shiftKey&&lastIndex>=0){
   const from=Math.min(lastIndex,index),to=Math.max(lastIndex,index);
   selected=new Set(visible.slice(from,to+1).map(item=>item.name))
  }else if(e.metaKey||e.ctrlKey){
   const name=row.dataset.n;
   if(selected.has(name))selected.delete(name);else selected.add(name);
   lastIndex=index
  }else{
   selected=new Set([row.dataset.n]);lastIndex=index
  }
  paintSelection();
  ls.focus({preventScroll:true})
 });
 ls.addEventListener('dblclick',e=>{
  const row=e.target.closest('.fit');if(!row)return;
  const item=items.find(entry=>entry.name===row.dataset.n);if(!item)return;
  item.dir?void go(join(cur,item.name)):F.open(join(cur,item.name))
 });
 function openSelection(){
  const name=[...selected][0];if(!name)return;
  const item=items.find(entry=>entry.name===name);if(!item)return;
  item.dir?void go(join(cur,name)):F.open(join(cur,name))
 }
 async function trashSelection(){
  if(!selected.size){setMessage('Select an item to move to the Trash.');return}
  if(!writable()){setMessage('SilkOS can only change files in your home folder.',true);return}
  const names=[...selected];
  let result=null;
  try{result=await F.trash(names.map(name=>join(cur,name)))}catch(error){console.error('Could not move items to the Trash:',error)}
  if(!result?.ok){setMessage(result?.error||'Could not move the items to the Trash.',true);return}
  selected.clear();
  await go(cur,{push:false});
  setMessage(`${result.trashed} item${result.trashed===1?'':'s'} moved to the Trash.`)
 }
 function beginRename(name){
  if(!writable()){setMessage('SilkOS can only change files in your home folder.',true);return}
  const row=[...rows.querySelectorAll('.fit')].find(candidate=>candidate.dataset.n===name);
  if(!row||row.classList.contains('editing'))return;
  row.classList.add('editing');row.draggable=false;
  const nameEl=row.querySelector('.fname'),input=document.createElement('input');
  input.className='fedit';input.value=name;input.setAttribute('aria-label','Rename item');
  nameEl.textContent='';nameEl.append(input);
  requestAnimationFrame(()=>{input.focus();const dot=name.lastIndexOf('.');input.setSelectionRange(0,dot>0?dot:name.length)});
  let settled=false;
  const restore=()=>{row.classList.remove('editing');paint()};
  input.onkeydown=event=>{
   event.stopPropagation();
   if(event.key==='Enter'){event.preventDefault();input.blur()}
   else if(event.key==='Escape'){event.preventDefault();settled=true;restore()}
  };
  input.onblur=async()=>{
   if(settled)return;
   settled=true;
   const next=input.value.trim();
   if(!next||next===name){restore();return}
   let result=null;
   try{result=await F.rename(join(cur,name),next)}catch(error){console.error('Could not rename the item:',error)}
   if(!result?.ok){setMessage(result?.error||'Could not rename the item.',true);restore();return}
   await go(cur,{push:false});
   selectName([next])
  }
 }
 function beginCreate(){
  if(!writable()){setMessage('SilkOS can only change files in your home folder.',true);return}
  rows.querySelectorAll('.fit.editing').forEach(row=>row.remove());
  const row=document.createElement('div');
  row.className='fit editing new';row.draggable=false;
  row.innerHTML='<span class="ficon">📁</span><span class="fname"><input class="fedit" placeholder="New Folder" aria-label="New folder name" spellcheck="false"></span><span class="fsize">—</span><span class="fdate"></span>';
  rows.prepend(row);ls.scrollTop=0;
  const input=row.querySelector('input');input.focus();
  let settled=false;
  const cancel=()=>{if(settled)return;settled=true;row.remove();ls.focus()};
  input.onkeydown=event=>{
   event.stopPropagation();
   if(event.key==='Enter'){event.preventDefault();input.blur()}
   else if(event.key==='Escape'){event.preventDefault();cancel()}
  };
  input.onblur=async()=>{
   if(settled)return;
   settled=true;
   const name=input.value.trim();
   if(!name){row.remove();ls.focus();return}
   let result=null;
   try{result=await F.mkdir(cur,name)}catch(error){console.error('Could not create the folder:',error)}
   if(!result?.ok){row.remove();setMessage(result?.error||'Could not create the folder.',true);return}
   await go(cur,{push:false});
   selectName([name])
  }
 }
 async function moveNames(names,destination){
  if(!names.length)return;
  if(!writable()){setMessage('SilkOS can only change files in your home folder.',true);return}
  const moving=names.filter(name=>join(cur,name)!==destination);
  if(!moving.length){setMessage('These items are already in that folder.');return}
  let result=null;
  try{result=await F.move(moving.map(name=>join(cur,name)),destination)}catch(error){console.error('Could not move the items:',error)}
  if(!result?.ok){setMessage(result?.error||'Could not move the items.',true);return}
  selected.clear();
  await go(cur,{push:false});
  const label=destination.split('/').filter(Boolean).pop()||destination;
  setMessage(`Moved ${moving.length} item${moving.length===1?'':'s'} to ${label}.`)
 }
 ls.addEventListener('keydown',e=>{
  if(e.target.closest('input'))return;
  const visible=displayed();
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){
   e.preventDefault();selected=new Set(visible.map(item=>item.name));paintSelection();return
  }
  if(e.key==='Escape'){
   if(searchQuery){e.preventDefault();search.value='';searchQuery='';paint();return}
   if(selected.size){e.preventDefault();selected.clear();paintSelection()}
   return
  }
  if(e.key==='Delete'||((e.metaKey||e.ctrlKey)&&(e.key==='Backspace'||e.key==='Delete'))){
   e.preventDefault();void trashSelection();return
  }
  if(e.key==='F2'){e.preventDefault();const name=[...selected][0];if(name)beginRename(name);return}
  if(e.key==='Enter'){e.preventDefault();openSelection();return}
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
   if(!visible.length)return;
   e.preventDefault();
   const current=visible.findIndex(item=>selected.has(item.name));
   const step=e.key==='ArrowDown'?1:-1;
   if(e.shiftKey&&lastIndex>=0){
    const next=Math.max(0,Math.min(visible.length-1,(current<0?lastIndex:current)+step));
    const from=Math.min(lastIndex,next),to=Math.max(lastIndex,next);
    selected=new Set(visible.slice(from,to+1).map(item=>item.name));
    paintSelection();
    const row=[...rows.querySelectorAll('.fit')][next];
    if(row)row.scrollIntoView({block:'nearest'});
    return
   }
   const next=current<0?(step>0?0:visible.length-1):Math.max(0,Math.min(visible.length-1,current+step));
   selected=new Set([visible[next].name]);lastIndex=next;
   paintSelection();
   const row=[...rows.querySelectorAll('.fit')][next];
   if(row)row.scrollIntoView({block:'nearest'})
  }
 });
 ls.addEventListener('contextmenu',e=>{
  e.preventDefault();e.stopPropagation();
  const row=e.target.closest('.fit');
  if(!row){showContextMenu(backgroundMenu(e.clientX,e.clientY),e.clientX,e.clientY);return}
  if(!selected.has(row.dataset.n)){selected=new Set([row.dataset.n]);lastIndex=displayed().findIndex(item=>item.name===row.dataset.n);paintSelection()}
  const names=[...selected],name=row.dataset.n,item=items.find(entry=>entry.name===name),path=join(cur,name),directory=!!item?.dir;
  showContextMenu([
   [directory?'Open Folder':'Open',()=>directory?go(path):F.open(path)],
   '-',
   ['New Folder',()=>beginCreate()],
   ...(names.length===1?[['Rename',()=>beginRename(name)]]:[]),
   ['Move to Trash',()=>void trashSelection()],
   '-',
   ['Copy Path',()=>copyPath(names.length===1?path:names.map(entry=>join(cur,entry)).join('\n'))],
   ...(names.length===1?[['Copy Name',()=>copyPath(name)]]:[]),
   '-',
   ['Sort By…',()=>showContextMenu(sortMenu(),e.clientX,e.clientY)]
  ],e.clientX,e.clientY)
 });
 sb.addEventListener('dragover',e=>{
  const place=e.target.closest('[data-p]');
  if(!place||!dragNames)return;
  e.preventDefault();e.dataTransfer.dropEffect='move';
  sb.querySelectorAll('.drop').forEach(node=>node.classList.toggle('drop',node===place))
 });
 sb.addEventListener('dragleave',e=>{
  if(!sb.contains(e.relatedTarget))sb.querySelectorAll('.drop').forEach(node=>node.classList.remove('drop'))
 });
 sb.addEventListener('drop',e=>{
  const place=e.target.closest('[data-p]');
  if(!place||!dragNames)return;
  e.preventDefault();sb.querySelectorAll('.drop').forEach(node=>node.classList.remove('drop'));
  const names=dragNames;dragNames=null;
  void moveNames(names,place.dataset.p)
 });
 sb.addEventListener('contextmenu',e=>{
  e.preventDefault();e.stopPropagation();
  const place=e.target.closest('[data-p]');
  if(!place){showContextMenu(backgroundMenu(e.clientX,e.clientY),e.clientX,e.clientY);return}
  showContextMenu([['Open',()=>go(place.dataset.p)],'-',['Copy Path',()=>copyPath(place.dataset.p)]],e.clientX,e.clientY)
 });
 ls.addEventListener('dragstart',e=>{
  const row=e.target.closest('.fit');
  if(!row||row.classList.contains('editing')){e.preventDefault();return}
  if(!selected.has(row.dataset.n)){selected=new Set([row.dataset.n]);paintSelection()}
  dragNames=[...selected];
  e.dataTransfer.effectAllowed='move';
  try{e.dataTransfer.setData('text/plain',dragNames.map(name=>join(cur,name)).join('\n'))}catch(error){console.error('Could not start the drag:',error)}
  ls.classList.add('dragging')
 });
 ls.addEventListener('dragend',()=>{
  dragNames=null;ls.classList.remove('dragging');
  ls.querySelectorAll('.drop').forEach(node=>node.classList.remove('drop'))
 });
 ls.addEventListener('dragover',e=>{
  const row=e.target.closest('.fit');
  if(!row||!row.dataset.d||!dragNames||dragNames.includes(row.dataset.n))return;
  e.preventDefault();e.dataTransfer.dropEffect='move';
  row.classList.add('drop')
 });
 ls.addEventListener('dragleave',e=>{
  const row=e.target.closest('.fit');
  if(row&&!row.contains(e.relatedTarget))row.classList.remove('drop')
 });
 ls.addEventListener('drop',e=>{
  const row=e.target.closest('.fit');
  if(!row||!row.dataset.d||!dragNames)return;
  e.preventDefault();row.classList.remove('drop');
  const names=dragNames;dragNames=null;
  void moveNames(names,join(cur,row.dataset.n))
 });
 fhead.addEventListener('click',e=>{
  const cell=e.target.closest('[data-sort]');if(!cell)return;
  const key=cell.dataset.sort;
  cfg.finderSort=key==='name'?(cfg.finderSort==='name'?'name-desc':'name'):key;
  save();paint();paintSortHeader()
 });
 search.addEventListener('input',()=>{
  searchQuery=search.value.trim();selected.clear();lastIndex=-1;paint()
 });
 search.addEventListener('keydown',e=>{
  e.stopPropagation();
  if(e.key==='Escape'){e.preventDefault();search.value='';searchQuery='';ls.focus();paint()}
 });
 fback.onclick=()=>historyNav(-1);
 ffwd.onclick=()=>historyNav(1);
 newBtn.onclick=()=>beginCreate();
 sortBtn.onclick=()=>{const rect=sortBtn.getBoundingClientRect();showContextMenu(sortMenu(),rect.right,rect.bottom+4,true)};
 el._refresh=()=>go(cur,{push:false});
 el._setFinderLocation=()=>go(configuredLocation());
 el._goFolder=dir=>go(dir);
 el._newFolder=()=>beginCreate();
 el._trashSelected=()=>trashSelection();
 el._renameSelected=()=>{const name=[...selected][0];if(name)beginRename(name)};
 el._focusSearch=()=>{search.focus();search.select()};
 el._toggleHiddenFiles=()=>toggleHidden();
 paintSortHeader();
 F.home().then(home=>{
  locations={home,desktop:join(home,'Desktop'),documents:join(home,'Documents'),downloads:join(home,'Downloads'),pictures:join(home,'Pictures')};
  const places=[['🏠','Home',locations.home],['🖥️','Desktop',locations.desktop],['📄','Documents',locations.documents],['⬇️','Downloads',locations.downloads],['🖼️','Pictures',locations.pictures]];
  sb.innerHTML='<div class="fsb-head">Favorites</div>'+places.map(([icon,label,path])=>`<div data-p="${esc(path)}"><span class="fsb-ico">${icon}</span><span class="fsb-label">${label}</span></div>`).join('')+'<div class="fsb-head">Locations</div><div data-p="/"><span class="fsb-ico">💽</span><span class="fsb-label">Computer</span></div>';
  sb.onclick=e=>{const place=e.target.closest('[data-p]');if(place)void go(place.dataset.p)};
  void go(configuredLocation())
 }).catch(error=>{
  console.error('Could not read the home folder:',error);
  sb.innerHTML='<div class="fsb-empty">Home folder unavailable.</div>';
  rows.innerHTML='<div class="stm">Finder could not read your home folder.</div>'
 })
}
