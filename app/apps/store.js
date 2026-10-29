function storeInit(el){
 const apps=[
  {id:'com.spotify.Client',name:'Spotify',tag:'Music',category:'audio',summary:'Music and podcasts for every moment.',mark:'♫'},
  {id:'org.mozilla.firefox',name:'Firefox',tag:'Browser',category:'internet',summary:'A fast browser built around your privacy.',mark:'F'},
  {id:'org.videolan.VLC',name:'VLC',tag:'Video',category:'audio',summary:'Play almost any video or audio format.',mark:'▶'},
  {id:'com.discordapp.Discord',name:'Discord',tag:'Community',category:'internet',summary:'Talk, share, and hang out with communities.',mark:'D'},
  {id:'com.valvesoftware.Steam',name:'Steam',tag:'Games',category:'games',summary:'Discover and play your PC game library.',mark:'S'},
  {id:'org.gimp.GIMP',name:'GIMP',tag:'Photo editing',category:'creative',summary:'A powerful free image editor.',mark:'G'},
  {id:'org.libreoffice.LibreOffice',name:'LibreOffice',tag:'Office',category:'productivity',summary:'Documents, spreadsheets, and presentations.',mark:'L'},
  {id:'com.obsproject.Studio',name:'OBS Studio',tag:'Streaming',category:'creative',summary:'Record and livestream your screen.',mark:'O'},
  {id:'org.telegram.desktop',name:'Telegram',tag:'Messaging',category:'internet',summary:'Fast messaging across all your devices.',mark:'T'},
  {id:'org.kde.kdenlive',name:'Kdenlive',tag:'Video editing',category:'creative',summary:'Create polished videos with a full editor.',mark:'K'},
  {id:'org.audacityteam.Audacity',name:'Audacity',tag:'Audio editing',category:'audio',summary:'Record and edit audio with precision.',mark:'A'},
  {id:'org.blender.Blender',name:'Blender',tag:'3D design',category:'creative',summary:'Make 3D art, animation, and visual effects.',mark:'B'},
  {id:'org.mozilla.Thunderbird',name:'Thunderbird',tag:'Email',category:'productivity',summary:'Keep your email and calendars in one place.',mark:'T'},
  {id:'org.inkscape.Inkscape',name:'Inkscape',tag:'Vector design',category:'creative',summary:'Create illustrations and scalable graphics.',mark:'I'},
  {id:'com.heroicgameslauncher.hgl',name:'Heroic Games Launcher',tag:'Games',category:'games',summary:'Manage games from multiple PC stores.',mark:'H'},
  {id:'com.bitwarden.desktop',name:'Bitwarden',tag:'Password manager',category:'utilities',summary:'Keep passwords organized across devices.',mark:'B'}
 ];
 const categories=[
  {id:'featured',name:'For You',description:'Popular picks to get your desktop started.'},
  {id:'audio',name:'Audio & Video',description:'Listen, watch, and make something worth sharing.'},
  {id:'creative',name:'Creative',description:'Tools for design, photography, video, and sound.'},
  {id:'games',name:'Games',description:'Find your next favorite game and game tools.'},
  {id:'internet',name:'Internet',description:'Browsers, messaging, and online communities.'},
  {id:'productivity',name:'Productivity',description:'Get organized and get more done.'},
  {id:'utilities',name:'Utilities',description:'Handy tools for everyday desktop tasks.'}
 ];
 const b=el.querySelector('.body'),S=window.silk&&silk.store;
 const guessIcon=id=>`https://dl.flathub.org/repo/appstream/x86_64/icons/128x128/${encodeURIComponent(id)}.png`;
 const tint=id=>{let h=0;for(const ch of String(id))h=(h*31+ch.charCodeAt(0))%360;return `linear-gradient(150deg,hsl(${h} 72% 56%),hsl(${(h+38)%360} 66% 33%))`};
 const markOf=id=>(String(id).split('.').pop()||'?').slice(0,1).toUpperCase();
 const FLATHUB_CATS=['AudioVideo','Development','Education','Game','Graphics','Network','Office','Science','System','Utility'];
 b.innerHTML=`<div class="sto"><aside class="store-side"><nav class="store-rail" aria-label="Store sections"></nav></aside><section class="store-main"><header class="store-head"><button class="store-back" type="button" hidden>‹ Back</button><div class="store-title"><h2>Store</h2><p></p></div><label class="store-search">${uiIcon('search')}<input type="search" placeholder="Search Flathub" aria-label="Search apps and games" spellcheck="false" autocomplete="off"></label></header><main class="store-content" tabindex="-1"></main><footer class="store-status" role="status" aria-live="polite"></footer></section></div>`;
 const rail=b.querySelector('.store-rail'),back=b.querySelector('.store-back'),heading=b.querySelector('.store-title h2'),subheading=b.querySelector('.store-title p'),q=b.querySelector('.store-search input'),content=b.querySelector('.store-content'),status=b.querySelector('.store-status');
 const info=new Map(),bases=new Map(),jobs=new Map(),pending=new Set();
 let installed=new Map(),updates=[],active='featured',app='',searching=false,searchError='',searchResults=[],timer,searchRequest=0,noteTimer,lastKind='',heroShown='';
 const defaultNote=S?'Details come from Flathub. Apps install into your user profile, so no password is needed.':'Preview: browsing works here, installs are available when SilkOS runs on Linux.';
 /* Installed and Updates are rail entries without a catalog, so they head themselves with live counts. */
 const plural=(n,word)=>`${n} ${word}${n===1?'':'s'}`;
 const tab=()=>categories.find(item=>item.id===active)||(active==='installed'?{name:'Installed',description:installed.size?plural(installed.size,'app')+' on this computer':'Nothing installed from the Store yet'}:active==='updates'?{name:'Updates',description:updates.length?plural(updates.length,'app')+' ready to update':'Everything from the Store is up to date'}:categories[0]);
 const baseOf=id=>bases.get(id)||apps.find(item=>item.id===id)||{id,name:String(id).split('.').pop()||id,tag:'',category:'',summary:id,mark:markOf(id)};
 const nameOf=id=>(info.get(id)||{}).name||installed.get(id)?.name||baseOf(id).name;
 const summaryOf=id=>(info.get(id)||{}).summary||baseOf(id).summary||id;
 const listApps=()=>active==='featured'?apps:apps.filter(item=>item.category===active);
 const heroId=()=>{const items=listApps();return items.length?items[new Date().getDate()%items.length].id:''};
 const say=text=>{status.textContent=text;clearTimeout(noteTimer);noteTimer=setTimeout(()=>{status.textContent=defaultNote},6000)};
 status.textContent=defaultNote;
 /* Flathub returns AppStream HTML, so rebuild the text from a small tag whitelist and let no attribute through. */
 function safeHtml(source){
  if(!source)return '';
  const keep={P:'p',UL:'ul',OL:'ol',LI:'li',CODE:'code',B:'b',STRONG:'b',I:'i',EM:'i',BR:'br',H4:'h4',H5:'h4'};
  const walk=node=>[...node.childNodes].map(child=>{
   if(child.nodeType===3)return esc(child.nodeValue);
   if(child.nodeType!==1)return '';
   const tag=keep[child.tagName];
   if(!tag)return walk(child).join('');
   if(tag==='br')return '<br>';
   const inner=walk(child).trim();
   return inner?`<${tag}>${inner}</${tag}>`:'';
  }).join('');
  return walk(new DOMParser().parseFromString(String(source),'text/html').body).trim();
 }
 /* Screenshots arrive with their band width; keep the ratio so the strip holds its shape before the pixels load. */
 const pickShot=shot=>{const sizes=((shot||{}).sizes||[]).filter(s=>s&&s.src);if(!sizes.length)return null;
  const best=sizes.reduce((a,s)=>Math.abs(+a.width-900)<=Math.abs(+s.width-900)?a:s);
  const w=+best.width,h=+best.height;return {src:best.src,ratio:w>0&&h>0&&w/h<4?String(+(w/h).toFixed(3)):''}};
 const formatDate=stamp=>{const time=Number(stamp);if(!time)return '';const d=new Date(time<1e11?time*1e3:time);return isNaN(d.getTime())?'':d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'})};
 const stubOf=id=>{const base=baseOf(id);return {id,name:base.name,summary:base.summary,developer:'',license:'',version:'',date:'',homepage:'',bugtracker:'',help:'',cats:[base.tag||'App'],icon:guessIcon(id),mark:base.mark,shots:[],desc:'',verified:false,free:true,loaded:false}};
 function normalize(raw,base){
  const releases=raw.releases||[],latest=releases.find(item=>item&&item.version)||releases[0]||{},urls=raw.urls||{},meta=raw.metadata||{};
  const matched=(raw.categories||[]).filter(cat=>FLATHUB_CATS.includes(cat));
  /* Curated entries keep their short editorial titles; everything else uses the upstream name. */
  const editorial=apps.find(item=>item.id===base.id);
  return {id:base.id,name:(editorial||{}).name||raw.name||base.name,summary:raw.summary||base.summary,developer:raw.developer_name||'',
   license:raw.project_license||'',version:latest.version||'',date:formatDate(latest.timestamp),
   homepage:urls.homepage||'',bugtracker:urls.bugtracker||'',help:urls.help||'',
   cats:matched.length?matched:[base.tag||'App'],icon:raw.icon||guessIcon(base.id),mark:base.mark,
   shots:(raw.screenshots||[]).map(pickShot).filter(Boolean),desc:safeHtml(raw.description),
   verified:meta['flathub::verification::verified']===true,free:raw.is_free_license!==false,loaded:true};
 }
 async function loadDetail(id){
  try{
   if(S&&S.detail){const reply=await S.detail(id);if(reply&&reply.error)throw new Error(reply.error);return reply&&reply.data}
   const reply=await fetch(`https://flathub.org/api/v2/appstream/${encodeURIComponent(id)}`,{headers:{accept:'application/json'}});
   if(!reply.ok)throw new Error(`HTTP ${reply.status}`);
   return await reply.json();
  }catch(error){console.warn(`Store: no Flathub details for ${id}:`,error);return null}
 }
 /* Details arrive without blocking the list: each answer patches the cards already on screen.
    Four requests at a time keeps a category page from opening a dozen sockets at Flathub. */
 function ensureDetails(ids){
  const missing=[...new Set(ids)].filter(id=>!info.has(id)&&!pending.has(id));
  missing.forEach(id=>pending.add(id));
  const wanted=id=>loadDetail(id).then(raw=>{
   pending.delete(id);
   info.set(id,raw?normalize(raw,baseOf(id)):stubOf(id));
   afterDetail(id);
  });
  let next=0;
  return Promise.all(Array.from({length:Math.min(4,missing.length)},async()=>{for(let i=next++;i<missing.length;i=next++)await wanted(missing[i])}));
 }
 function afterDetail(id){
  const record=info.get(id);
  content.querySelectorAll(`[data-app="${CSS.escape(id)}"]`).forEach(node=>{
   const img=node.querySelector('.store-art img');
   if(img&&record.icon&&img.getAttribute('src')!==record.icon)img.setAttribute('src',record.icon);
   const blurb=node.querySelector('.store-meta p');
   if(blurb&&record.summary)blurb.textContent=record.summary;
  });
  if(app===id||!app&&id===heroShown&&content.scrollTop<40)render();
 }
 const artHTML=id=>`<div class="store-art" style="--art:${tint(id)}">${esc(baseOf(id).mark||markOf(id))}<img src="${esc((info.get(id)||{}).icon||guessIcon(id))}" alt="" loading="lazy" decoding="async" onerror="this.remove()"></div>`;
 function actionHTML(id,label,act){
  const job=jobs.get(id);
  if(job)return `<button class="stb" type="button" disabled>${esc(job.label||label||'Working…')}</button><div class="store-prog${job.percent===null?' run':''}"><i${job.percent===null?'':` style="width:${job.percent}%"`}></i></div>`;
  const has=installed.has(id);
  return `<button class="stb" type="button" data-id="${esc(id)}" data-act="${esc(act||(has?'run':'install'))}">${esc(label||(has?'Open':'Get'))}</button>`;
 }
 const jobWrap=(id,label,act)=>`<span class="store-act" data-job="${esc(id)}" data-label="${esc(label)}" data-act="${esc(act)}">${actionHTML(id,label,act)}</span>`;
 const tileHTML=id=>`<article class="store-tile" data-app="${esc(id)}" data-open="${esc(id)}" tabindex="0">${artHTML(id)}<div class="store-meta"><h4>${esc(nameOf(id))}</h4><p>${esc(summaryOf(id))}</p></div>${jobWrap(id,installed.has(id)?'Open':'Get',installed.has(id)?'run':'install')}</article>`;
 const rowHTML=(id,label,act,note)=>`<div class="store-row" data-app="${esc(id)}" data-open="${esc(id)}" tabindex="0">${artHTML(id)}<div class="store-meta"><h4>${esc(nameOf(id))}</h4><p>${esc(note||summaryOf(id))}</p></div>${jobWrap(id,label,act)}</div>`;
 const gridHTML=ids=>`<div class="store-grid">${ids.map(tileHTML).join('')}</div>`;
 const skeletonTiles=count=>`<div class="store-grid">${Array.from({length:count},()=>'<div class="store-tile store-skeleton"><div class="sk" style="width:62px;height:62px;border-radius:15px"></div><div class="store-meta"><h4 class="sk" style="height:12px;width:66%"></h4><p class="sk" style="height:10px;width:88%;margin-top:7px"></p></div><div class="sk" style="height:24px;width:58px;border-radius:999px"></div></div>').join('')}</div>`;
 function paint(html,kind){
  content.innerHTML=html;
  if(kind!==lastKind){lastKind=kind;content.scrollTop=0;content.classList.remove('in');void content.offsetWidth;content.classList.add('in')}
 }
 const byName=(a,c)=>nameOf(a).localeCompare(nameOf(c));
 const versionNote=item=>item.version?`Version ${item.version}`:'Ready to open';
 function paintBrowse(){
  const items=listApps(),hero=heroId(),record=info.get(hero),grid=items.filter(item=>item.id!==hero);
  heroShown=hero;
  const library=installed.size?`<div class="store-section"><h3>In your library</h3><span>${installed.size} installed</span></div><div class="store-list">${[...installed.keys()].sort(byName).slice(0,5).map(id=>rowHTML(id,'Open','run',versionNote(installed.get(id)))).join('')}</div>`:'';
  const eyebrow=`${(record&&record.cats[0])||tab().name} · Featured today`;
  const heroBlock=hero?`<section class="store-hero" data-app="${esc(hero)}" data-open="${esc(hero)}" style="--hero:${tint(hero)}">${artHTML(hero)}<div class="store-hero-copy"><span class="store-eyebrow">${esc(eyebrow)}</span><h3>${esc(nameOf(hero))}</h3><p>${esc(summaryOf(hero))}</p></div>${jobWrap(hero,installed.has(hero)?'Open':'Get',installed.has(hero)?'run':'install')}</section>`:'';
  paint(`${heroBlock}<div class="store-section"><h3>${esc(tab().name)}</h3><span>${plural(grid.length,'app')}</span></div>${grid.length?gridHTML(grid.map(item=>item.id)):'<div class="stm">Nothing in this category yet.</div>'}${library}`,'browse');
  ensureDetails(items.map(item=>item.id));
 }
 function paintSearch(){
  if(searching){paint(skeletonTiles(6),'search');return}
  if(searchError){paint(`<div class="stm">${esc(searchError)}</div>`,'search');return}
  if(!searchResults.length){paint('<div class="stm">No apps matched that search. Try another word.</div>','search');return}
  paint(`<div class="store-section"><h3>Results</h3><span>${searchResults.length} found</span></div><div class="store-list">${searchResults.map(item=>rowHTML(item.id,installed.has(item.id)?'Open':'Get',installed.has(item.id)?'run':'install')).join('')}</div>`,'search');
  ensureDetails(searchResults.slice(0,12).map(item=>item.id));
 }
 function paintInstalled(){
  if(!S){paint('<div class="stm">Installed apps appear when SilkOS runs on Linux.</div>','installed');return}
  const ids=[...installed.keys()].sort(byName);
  if(!ids.length){paint('<div class="stm">No Store apps installed yet. Pick one from For You.</div>','installed');return}
  paint(`<div class="store-section"><h3>Installed</h3><span>${plural(ids.length,'app')}</span></div><div class="store-list">${ids.map(id=>rowHTML(id,'Open','run',versionNote(installed.get(id)))).join('')}</div>`,'installed');
  ensureDetails(ids);
 }
 function paintUpdates(){
  if(!S){paint('<div class="stm">Update checks run when SilkOS is on Linux.</div>','updates');return}
  if(!updates.length){paint('<div class="store-section"><h3>Updates</h3><span>Checked</span></div><div class="stm">Everything you installed from the Store is up to date.</div>','updates');return}
  paint(`<div class="store-section"><h3>Updates</h3>${jobWrap('ALL','Update All','update-all')}</div><div class="store-list">${updates.map(item=>{
   if(!bases.has(item.id))bases.set(item.id,{id:item.id,name:item.name||item.id,tag:'',category:'',summary:'',mark:markOf(item.id)});
   return rowHTML(item.id,'Update','update',`Version ${item.from||'?'} → ${item.to}`);
  }).join('')}</div>`,'updates');
  ensureDetails(updates.map(item=>item.id));
 }
 function paintApp(){
  const id=app,record=info.get(id);
  if(!record){
   paint(`<div class="store-app"><div class="store-app-head"><div class="sk" style="width:92px;height:92px;border-radius:22px;flex:none"></div><div class="store-app-id"><h3>${esc(nameOf(id))}</h3><p class="sk" style="height:11px;width:210px;margin-top:8px"></p></div><div class="sk" style="height:32px;width:76px;border-radius:999px"></div></div><div class="store-shots">${'<div class="sk" style="height:216px;width:384px;border-radius:12px;flex:none"></div>'.repeat(3)}</div></div>`,'app');
   ensureDetails([id]);
   return;
  }
  const has=installed.has(id);
  const facts=[['Version',record.version||'—'],['Updated',record.date||'—'],['License',record.license||'—'],['Category',record.cats[0]||'—']];
  const links=[['Website',record.homepage],['Issue tracker',record.bugtracker],['Get help',record.help]].filter(pair=>pair[1]);
  paint(`<section class="store-app"><div class="store-app-head" data-app="${esc(id)}">${artHTML(id)}<div class="store-app-id"><span class="store-eyebrow">${esc(record.cats.join(' · '))}${record.verified?' · Verified by Flathub':''}</span><h3>${esc(record.name)}</h3><p>${esc(record.developer||'The Flathub community')} · ${record.free?'Free':'Not free'}</p></div><div class="store-actions">${jobWrap(id,has?'Open':'Get',has?'run':'install')}${has?`<button class="stb" type="button" data-id="${esc(id)}" data-act="uninstall">Remove</button>`:''}</div></div>${record.shots.length?`<div class="store-shots">${record.shots.map(shot=>`<img src="${esc(shot.src)}" alt="Screenshot of ${esc(record.name)}" loading="lazy" decoding="async"${shot.ratio?` style="aspect-ratio:${shot.ratio}"`:''}>`).join('')}</div>`:''}<div class="store-facts">${facts.map(([label,value])=>`<div class="store-fact"><span>${label}</span><b title="${esc(value)}">${esc(value)}</b></div>`).join('')}</div>${record.desc?`<div class="store-section"><h3>Overview</h3><span>${esc(record.loaded?'from Flathub':'cached description')}</span></div><div class="store-desc">${record.desc}</div>`:''}${links.length?`<div class="store-links">${links.map(([label,url])=>`<button type="button" data-link="${esc(url)}">${esc(label)}</button>`).join('')}</div>`:''}</section>`,'app');
 }
 function render(){
  const query=q.value.trim();
  rail.querySelectorAll('.store-nav').forEach(node=>node.classList.toggle('on',!app&&!query&&node.dataset.cat===active));
  back.hidden=!app;
  if(app){const record=info.get(app);heading.textContent=record?record.name:nameOf(app);subheading.textContent=record?(record.developer||'Flathub'):'Loading from Flathub…'}
  else if(query){heading.textContent='Search';subheading.textContent=`Results for “${query}”`}
  else{heading.textContent=tab().name;subheading.textContent=tab().description}
  if(app)paintApp();
  else if(query)paintSearch();
  else if(active==='installed')paintInstalled();
  else if(active==='updates')paintUpdates();
  else paintBrowse();
 }
 const navItem=(cat,label,badge)=>`<button class="store-nav" type="button" data-cat="${esc(cat)}">${esc(label)}${badge?`<em>${badge}</em>`:''}</button>`;
 function renderNav(){
  rail.innerHTML=`<h5>Discover</h5>${categories.map(item=>navItem(item.id,item.name)).join('')}<h5>Library</h5>${navItem('installed','Installed',installed.size)}${navItem('updates','Updates',updates.length)}`;
 }
 const openApp=id=>{if(app===id)return;app=id;render()};
 const paintJob=id=>content.querySelectorAll(`[data-job="${CSS.escape(String(id))}"]`).forEach(node=>{node.innerHTML=actionHTML(String(id),node.dataset.label,node.dataset.act)});
 async function loadInstalled(){
  if(!S)return;
  try{
   const reply=await S.installed();
   if(reply.error)throw new Error(reply.error);
   installed=new Map((reply.apps||[]).filter(item=>item&&item.id).map(item=>[item.id,item]));
  }catch(error){installed=new Map();say(error.message||'Could not list installed apps.')}
 }
 async function loadUpdates(){
  if(!S)return;
  try{
   const reply=await S.updates();
   if(reply.error){updates=[];say(reply.error);return}
   updates=reply.updates||[];
  }catch{updates=[]}
 }
 async function activate(button){
  const id=button.dataset.id,act=button.dataset.act||'install';
  if(!id||jobs.has(id))return;
  if(!S){say('Install apps when SilkOS runs on Linux.');return}
  if(act==='uninstall'&&!confirm(`Uninstall ${nameOf(id)} from this computer?`))return;
  /* flatpak keeps a lock on the user repo, so two installs or updates at once would fail for the user. */
  if(act!=='run'&&[...jobs.values()].some(job=>job.act!=='run')){say('The Store is already busy with another download.');return}
  jobs.set(id,{label:'',percent:null,act});
  button.disabled=true;
  paintJob(id);
  try{
   let reply;
   if(act==='run')reply=await S.run(id);
   else if(act==='uninstall')reply=await S.uninstall(id);
   else if(act==='update')reply=await S.updateAll(id);
   else if(act==='update-all')reply=await S.updateAll();
   else reply=await S.install(id);
   if(reply&&reply.error)throw new Error(reply.error);
   if(act==='run')say(`${nameOf(id)} is opening.`);
   else if(act==='install'){installed.set(id,{id,name:nameOf(id)});syncFlatpaks();say(`${nameOf(id)} is installed and added to your dock.`)}
   else if(act==='uninstall'){installed.delete(id);say(`${nameOf(id)} was uninstalled.`)}
   else say('Your apps are up to date.');
  }catch(error){console.error('Store action failed:',error);say(error.message||'The Store could not finish that action.')}
  finally{jobs.delete(id);await Promise.all([loadInstalled(),loadUpdates()]);renderNav();render()}
 }
 async function runSearch(query){
  const request=++searchRequest;
  clearTimeout(timer);
  if(!query){searching=false;searchError='';searchResults=[];render();return}
  app='';searching=true;searchError='';searchResults=[];render();
  try{
   let items;
   if(S&&S.search){const reply=await S.search(query);if(reply.error)throw new Error(reply.error);items=reply.apps||[]}
   else{
    const needle=query.toLowerCase();
    items=apps.filter(item=>`${item.name} ${item.tag} ${item.summary}`.toLowerCase().includes(needle));
   }
   if(request!==searchRequest||q.value.trim()!==query)return;
   items.filter(item=>item&&item.id).forEach(item=>{if(!bases.has(item.id))bases.set(item.id,{id:item.id,name:item.name||item.id,tag:'',category:'',summary:item.desc||item.summary||'',mark:markOf(item.id)})});
   searchResults=items.filter(item=>item&&item.id&&item.name);
  }catch(error){
   if(request===searchRequest)searchError=error.message||'Could not search Flathub.';
  }finally{
   if(request===searchRequest){searching=false;render()}
  }
 }
 rail.onclick=event=>{const node=event.target.closest('.store-nav');if(!node)return;app='';q.value='';searchRequest++;searching=false;searchError='';searchResults=[];active=node.dataset.cat;render()};
 back.onclick=()=>{app='';render()};
 content.onclick=event=>{
  const link=event.target.closest('[data-link]');
  if(link){openUrl(link.dataset.link);return}
  const button=event.target.closest('.stb');
  if(button&&button.dataset.id){activate(button);return}
  const open=event.target.closest('[data-open]');
  if(open)openApp(open.dataset.open);
 };
 content.onkeydown=event=>{
  if(event.key!=='Enter'&&event.key!==' ')return;
  const open=event.target.closest('[data-open]');
  if(!open)return;
  event.preventDefault();
  openApp(open.dataset.open);
 };
 q.oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>runSearch(q.value.trim()),260)};
 q.onkeydown=event=>{if(event.key==='Escape'){q.value='';runSearch('');return}if(event.key==='Enter'){event.preventDefault();runSearch(q.value.trim())}};
 if(S&&S.onProgress)S.onProgress(step=>{
  const id=step&&step.id?step.id:'ALL',job=jobs.get(id);
  if(!job)return;
  job.label=step.label||job.label;
  job.percent=typeof step.percent==='number'?step.percent:null;
  paintJob(id);
 });
 el._refresh=()=>render();
 renderNav();
 render();
 Promise.all([loadInstalled(),loadUpdates()]).then(()=>{renderNav();render()});
}
