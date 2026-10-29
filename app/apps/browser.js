function browserInit(el){
 el.classList.add('safari');
 el.querySelector('.tb').innerHTML=`<div class="tl"><div class="lights"><button class="dot r"></button><button class="dot y"></button><button class="dot g"></button></div><button class="sb" data-a="side" title="Show tabs and bookmarks" aria-label="Show tabs and bookmarks">${I.side}</button><button class="sb" data-a="b" title="Back" aria-label="Back">${I.back}</button><button class="sb" data-a="f" title="Forward" aria-label="Forward">${I.fwd}</button></div><div class="addr"><div class="prog"></div><input class="url" spellcheck="false" autocomplete="off" aria-label="Address or search"><div class="dom"></div><button class="sb rl" data-a="r" title="Reload this page" aria-label="Reload this page">${I.rl}</button></div><div class="tr"><button class="sb" data-a="share" title="Copy the page address" aria-label="Copy the page address">${I.share}</button><button class="sb" data-a="n" title="New tab" aria-label="New tab">${I.plus}</button><button class="sb" data-a="ov" title="All tabs" aria-label="All tabs">${I.tabs}</button></div>`;
 const q=s=>el.querySelector(s),pages=q('.pages'),stabs=q('.stabs'),side=q('.side div'),main=q('.main'),ov=q('.ov'),url=q('.url'),dm=q('.dom'),bar=q('.prog'),start=q('.start'),backB=q('[data-a=b]'),fwdB=q('[data-a=f]'),relB=q('[data-a=r]');
 if(!window.silk){pages.innerHTML='<div class="about">The Browser app needs the desktop (Electron) version of SilkOS.</div>';return}
 const FAV=[
  ['Google','google.com','#fff','google'],
  ['YouTube','youtube.com','#fff','youtube'],
  ['Wikipedia','wikipedia.org','#fff','wikipedia'],
  ['GitHub','github.com','#24292e','github'],
  ['Reddit','reddit.com','#ff4500','reddit'],
  ['Amazon','amazon.in','#fff','amazon'],
  ['Netflix','netflix.com','#111','netflix'],
  ['Maps','maps.google.com','#fff','maps']
 ];
 const favMark={
  google:'<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285f4" d="M43.6 24.5c0-1.4-.1-2.7-.4-4H24v7.6h11a9.4 9.4 0 0 1-4.1 6.2l6.3 4.9c3.8-3.5 6.4-8.6 6.4-14.7Z"/><path fill="#34a853" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.3-4.9c-1.8 1.2-4.2 2-7.2 2-5.5 0-10.1-3.7-11.8-8.7l-6.5 5A20 20 0 0 0 24 44Z"/><path fill="#fbbc05" d="M12.2 27.6a12 12 0 0 1 0-7.2l-6.5-5a20 20 0 0 0 0 17.2l6.5-5Z"/><path fill="#ea4335" d="M24 11.7c3.2 0 6 1.1 8.2 3.2l5.8-5.8C34.5 5.7 29.7 4 24 4A20 20 0 0 0 5.7 15.4l6.5 5C13.9 15.4 18.5 11.7 24 11.7Z"/></svg>',
  youtube:'<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="4" y="10" width="40" height="28" rx="9" fill="#ff0033"/><path d="M20 17.5 32 24l-12 6.5v-13Z" fill="#fff"/></svg>',
  wikipedia:'<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="20" fill="#f4f6f9"/><text x="24" y="34" text-anchor="middle" font-family="Georgia,serif" font-size="29" font-weight="700" fill="#303744">W</text></svg>',
  github:'<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#fff" d="M24 5a19 19 0 0 0-6 37c1 .2 1.3-.4 1.3-.9v-3.4c-5.4 1.2-6.6-2.3-6.6-2.3-.9-2.2-2.2-2.8-2.2-2.8-1.8-1.2.1-1.2.1-1.2 2 .1 3.1 2 3.1 2 1.8 3.1 4.7 2.2 5.8 1.7.2-1.3.7-2.2 1.3-2.7-4.3-.5-8.9-2.2-8.9-9.6 0-2.1.8-3.9 2-5.3-.2-.5-.9-2.5.2-5.2 0 0 1.6-.5 5.3 2a18.4 18.4 0 0 1 9.6 0c3.7-2.5 5.3-2 5.3-2 1.1 2.7.4 4.7.2 5.2 1.3 1.4 2 3.2 2 5.3 0 7.4-4.6 9.1-8.9 9.6.7.6 1.3 1.7 1.3 3.4v5c0 .5.3 1.1 1.3.9A19 19 0 0 0 24 5Z"/></svg>',
  reddit:'<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#fff" d="M24 12c-10 0-18 5.5-18 12.3 0 3.1 1.8 5.9 4.8 8-.4 1.4-1.3 3.2-3 4.3 3.4.2 5.6-.9 7-2.1 2.7 1.3 5.8 2 9.2 2 10 0 18-5.5 18-12.2S34 12 24 12Z"/><circle cx="18" cy="24" r="2" fill="#ff4500"/><circle cx="30" cy="24" r="2" fill="#ff4500"/><path d="M18 29c3.5 2.6 8.5 2.6 12 0" fill="none" stroke="#ff4500" stroke-width="1.8" stroke-linecap="round"/><circle cx="36.5" cy="12" r="4" fill="#fff"/><path d="m31 18 4-5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
  amazon:'<svg viewBox="0 0 48 48" aria-hidden="true"><text x="22" y="31" text-anchor="middle" font-family="Arial,sans-serif" font-size="30" font-weight="700" fill="#202c3a">a</text><path d="M9 34c9 7 22 7 31 0" fill="none" stroke="#ff9900" stroke-width="3" stroke-linecap="round"/><path d="m35 31 5 3-5 3" fill="none" stroke="#ff9900" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  netflix:'<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#e50914" d="M10 7h8l12 24V7h8v34l-8 1-12-24v23h-8V7Z"/><path fill="#a4060f" d="m18 7 8 1 12 32-8 1L18 7Z"/></svg>',
  maps:'<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#34a853" d="m24 7 11 4v24l-11 5-11-5V11l11-4Z"/><path fill="#4285f4" d="m13 11 11-4v33l-11-5V11Z"/><path fill="#fbbc04" d="m24 7 11 4-11 4-11-4 11-4Z"/><path fill="#ea4335" d="M35 11v24l-11 5V15l11-4Z"/><path fill="#fff" d="M24 13a8 8 0 0 0-8 8c0 5 8 13 8 13s8-8 8-13a8 8 0 0 0-8-8Zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"/></svg>'
 };
 const fv=(n,u,bg,mark)=>`<div class="fv" data-u="${esc(u)}"><div class="tile" style="background:${bg}">${favMark[mark]||uiIcon('globe')}</div><span>${esc(String(n).slice(0,14))}</span></div>`;
 function buildStart(){const bm=store.get('bm').slice(0,12);
  start.innerHTML=`<h4>Favorites</h4><div class="fav">${FAV.map(f=>fv(f[0],f[1],f[2],f[3])).join('')}</div>`+(bm.length?`<h4 class="h2">Bookmarks</h4><div class="fav">${bm.map(b=>fv(b.t,b.u,tc(b.u),'bookmark')).join('')}</div>`:'')+'<div class="imp"><button data-i="bm">Import Bookmarks…</button><button data-i="hist">Import History…</button></div>';
  start.querySelectorAll('.fv').forEach(n=>n.onclick=()=>go(cur,n.dataset.u));
  start.querySelectorAll('.imp button').forEach(b=>b.onclick=()=>importFile(b.dataset.i))}
 const stamp=(a,k)=>k==='hist'?a.map(x=>({...x,n:1,ts:Date.now()})):a;
 function parseAny(txt,kind){const out=[],t=txt.trim();
  if(t[0]==='{'||t[0]==='['){try{(function w(o){if(o&&typeof o==='object'){const u=o.url||o.uri;if(typeof u==='string'&&/^https?:/i.test(u))out.push({t:String(o.name||o.title||hostOf(u)).slice(0,80),u});Object.values(o).forEach(w)}})(JSON.parse(t));return stamp(out,kind)}catch(e){}}
  if(/<a\s/i.test(t)){new DOMParser().parseFromString(t,'text/html').querySelectorAll('a[href]').forEach(a=>{if(/^https?:/i.test(a.href))out.push({t:(a.textContent||'').trim().slice(0,80)||hostOf(a.href),u:a.href})});return stamp(out,kind)}
  (t.match(/https?:\/\/[^\s",<>\]\[]+/g)||[]).forEach(u=>out.push({t:hostOf(u),u}));return stamp(out,kind)}
 function merge(k,items){const have=store.get(k),seen=new Set(have.map(x=>x.u));let n=0;items.forEach(i=>{if(!seen.has(i.u)){seen.add(i.u);have.push(i);n++}});store.set(k,have.slice(0,k==='bm'?3000:5000));return n}
 function importFile(kind){const inp=document.createElement('input');inp.type='file';inp.accept=kind==='bm'?'.html,.htm,.json,.txt':'.csv,.txt,.json,.html,.htm';
  inp.onchange=()=>{const f=inp.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{const n=merge(kind,parseAny(String(r.result),kind));toast(n?'Imported '+n+(kind==='bm'?' bookmarks':' history items'):'Nothing new to import');buildStart();refresh()};r.readAsText(f)};inp.click()}
 function addBm(){if(!cur||!cur.url)return;if(merge('bm',[{t:cur.title&&cur.title!=='Start Page'?cur.title:hostOf(cur.url),u:cur.url}])){toast('Bookmark added');buildStart();refresh()}else toast('Already bookmarked')}
 function logHist(u,t){if(!/^https?:/i.test(u))return;const h=store.get('hist'),x=h.find(i=>i.u===u);if(x){if(t){x.t=t}else{x.n=(x.n||1)+1}x.ts=Date.now()}else h.unshift({t:t||hostOf(u),u,n:1,ts:Date.now()});store.set('hist',h.slice(0,5000))}
 buildStart();
 let list=[],cur=null;
 function applyWebCursor(t){clearTimeout(t.cursorCssTimer);t.cursorCssTimer=setTimeout(async()=>{if(!t.v)return;try{if(t.cursorCssKey)await t.v.removeInsertedCSS(t.cursorCssKey);t.cursorCssKey=await t.v.insertCSS(WEBCUR)}catch(error){console.error('Could not update the Browser cursor:',error)}},80)}
 const norm=v=>{v=v.trim();if(!v)return'https://www.google.com';if(/^https?:\/\//i.test(v))return v;if(!/\s/.test(v)&&/\.[a-z]{2,}/i.test(v))return'https://'+v;return searchURL(v)};
 function dom(t){const u=t&&t.url;if(!u){dm.innerHTML='<span class="ph">Search or enter website name</span>';return}let h;try{h=new URL(u).hostname.replace(/^www\./,'')}catch(e){h=u}dm.innerHTML=(u.startsWith('https')?I.lock:'')+'<span>'+esc(h)+'</span>'}
 function prog(on){if(on){bar.style.transition='none';bar.style.opacity=1;bar.style.width='0';void bar.offsetWidth;bar.style.transition='width 6s cubic-bezier(.1,.8,.2,1),opacity .3s';bar.style.width='85%'}else{bar.style.transition='width .25s,opacity .4s .25s';bar.style.width='100%';bar.style.opacity=0}}
 /* Safari greys the arrows that have nowhere to go and turns the reload control into a stop while a page loads. */
 const favOf=list=>(list||[]).find(icon=>/^https?:/i.test(icon))||'';
 function navState(){
  const v=cur&&cur.v;let b=false,f=false;
  if(v)try{b=v.canGoBack();f=v.canGoForward()}catch(error){}
  backB.disabled=!b;fwdB.disabled=!f;relB.disabled=!v;
  relB.innerHTML=cur&&cur.loading?I.x:I.rl;
  relB.title=cur&&cur.loading?'Stop loading':'Reload this page';
 }
 const failNote=(code,host)=>{const c=Math.abs(code);
  if(c===3)return'';
  if(c===5)return'That file is not on this computer.';
  if(c===7)return host+' took too long to answer, so nothing loaded.';
  if(c===101)return'The connection to '+host+' was reset while the page was loading.';
  if(c===102)return'Nothing is answering at '+host+'.';
  if(c===105)return'Could not find '+host+'. Check the spelling, or your network if the address is right.';
  if(c===106)return'This computer is not connected to the internet.';
  if(c===130)return'Could not reach '+host+' through the configured proxy.';
  if(c===300)return host+' kept redirecting, so the page never finished loading.';
  if(c>=200&&c<300)return'A secure connection to '+host+' could not be made.';
  return'SilkOS could not load '+host+'.'};
 const perr=document.createElement('div');
 perr.className='perr';
 perr.innerHTML=`<div><div class="pe-ic">${uiIcon('globe')}</div><h4>This page could not be loaded</h4><p></p><button type="button" data-f="retry">Try Again</button></div>`;
 pages.appendChild(perr);
 function showFail(){
  const f=cur&&cur.fail;
  perr.classList.toggle('on',!!f);
  if(!f)return;
  perr.querySelector('p').textContent=failNote(f.code,hostOf(f.url))||'SilkOS could not load this page.';
 }
 perr.onclick=e=>{
  if(!e.target.closest('[data-f="retry"]'))return;
  const t=cur;if(!t||!t.v)return;
  t.fail='';showFail();prog(1);
  try{t.v.reload()}catch(error){go(t,t.url)}};
 const fin=document.createElement('div');
 fin.className='fin';
 fin.innerHTML=`<input type="search" placeholder="Find in page" aria-label="Find in page" spellcheck="false" autocomplete="off"><span class="fc"></span><button class="fb" type="button" data-f="p" title="Previous match" aria-label="Previous match">${I.up}</button><button class="fb" type="button" data-f="n" title="Next match" aria-label="Next match">${I.down}</button><button class="fb" type="button" data-f="x" title="Close" aria-label="Close find bar">${I.x}</button>`;
 pages.appendChild(fin);
 const fq=fin.querySelector('input'),fcount=fin.querySelector('.fc');
 let ftimer=0;
 function findStep(next){
  const t=cur;
  if(!t||!t.v||!fq.value){fcount.textContent='';fin.classList.remove('miss');return}
  clearTimeout(ftimer);
  if(next===undefined){ftimer=setTimeout(()=>findStep(true),160);return}
  try{
   const found=t.v.findInPage(fq.value,{next:next!==false,matchCase:false});
   if(found&&found.then)found.then(r=>{
    if(cur!==t||!r)return;
    const total=r.matchesTotalCount|0,at=r.activeMatchOrdinal|0;
    fcount.textContent=total?at+' of '+total:'No matches';
    fin.classList.toggle('miss',!total);
   }).catch(()=>{});
  }catch(error){}
 }
 function hideFind(leaving){fin.classList.remove('on','miss');fcount.textContent='';clearTimeout(ftimer);const t=leaving||cur;try{t&&t.v&&t.v.stopFindInPage('clearSelection')}catch(error){}}
 function showFind(){if(!cur||!cur.v){url.focus();return}fin.classList.add('on');fcount.textContent='';fin.classList.remove('miss');fq.focus();fq.select()}
 fq.oninput=()=>findStep();
 fq.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();findStep(!e.shiftKey)}else if(e.key==='Escape'){e.preventDefault();hideFind()}};
 fin.onclick=e=>{const button=e.target.closest('[data-f]');if(!button)return;if(button.dataset.f==='x')hideFind();else findStep(button.dataset.f==='n')};
 /* The slot stays in the tab even before an icon arrives, so titles do not jump when a site reports one. */
 const tabIcon=t=>{const slot=t.tabEl&&t.tabEl.querySelector('.tf');if(!slot||slot.dataset.src===(t.icon||''))return;
  slot.dataset.src=t.icon||'';slot.innerHTML=t.icon?`<img src="${esc(t.icon)}" alt="" onerror="this.remove()">`:''};
 function refresh(){
  list.forEach(t=>{if(!t.tabEl)mkTab(t);t.tabEl.classList.toggle('on',t===cur);t.tabEl.querySelector('span').textContent=t.title;tabIcon(t)});
  stabs.classList.toggle('open',list.length>1);
  side.innerHTML='<h5>Tabs</h5>'+list.map((t,i)=>`<div class="si${t===cur?' on':''}" data-i="${i}">${esc(t.title)}</div>`).join('');
  const bm=store.get('bm');side.insertAdjacentHTML('beforeend','<h5 style="margin-top:14px">Bookmarks · '+bm.length+'</h5>'+bm.slice(0,80).map(b=>`<div class="bi" data-u="${esc(b.u)}">${esc(b.t)}</div>`).join(''));
  side.querySelectorAll('.si').forEach(n=>n.onclick=()=>sel(list[+n.dataset.i]));side.querySelectorAll('.bi').forEach(n=>n.onclick=()=>go(cur,n.dataset.u))}
 function mkTab(t){const n=document.createElement('div');n.className='stab';n.innerHTML='<b>✕</b><i class="tf"></i><span></span>';t.tabEl=n;
  n.onclick=()=>sel(t);n.querySelector('b').onclick=e=>{e.stopPropagation();close(list.indexOf(t))};
  n.onmousedown=e=>{if(e.button===1)e.preventDefault()};
  n.onauxclick=e=>{if(e.button===1){e.preventDefault();close(list.indexOf(t))}};
  stabs.appendChild(n);void n.offsetWidth;requestAnimationFrame(()=>requestAnimationFrame(()=>n.classList.add('in')))}
 function sel(t){if(t!==cur)hideFind(cur);cur=t;ov.classList.remove('open');navState();refresh();
  start.style.display=t.v?'none':'flex';if(!t.v){start.classList.remove('enter');void start.offsetWidth;start.classList.add('enter')}list.forEach(x=>x.v&&x.v.classList.toggle('on',x===t));
  url.value=t.url||'';dom(t);showFail();t.loading?prog(1):(bar.style.transition='none',bar.style.width='0',bar.style.opacity=0)}
 function go(t,u){u=norm(u);t.url=u;
  if(!t.v){const v=document.createElement('webview');v.setAttribute('allowpopups','');t.v=v;
   const nv=e=>{if(!e.url)return;
    if(hostOf(e.url)!==hostOf(t.url)){t.icon='';t.fail='';tabIcon(t)}
    t.url=e.url;logHist(e.url);
    if(cur===t){url.value=e.url;dom(t);navState();showFail()}};
   v.addEventListener('did-navigate',nv);v.addEventListener('did-navigate-in-page',nv);
   v.addEventListener('page-favicon-updated',e=>{const icon=favOf(e.favicons);if(icon){t.icon=icon;tabIcon(t)}});
   v.addEventListener('page-title-updated',e=>{t.title=e.title;logHist(t.url,e.title);refresh()});
   v.addEventListener('did-start-loading',()=>{t.loading=1;t.fail='';if(cur===t){prog(1);navState();showFail()}});
   /* A finished load drops the page highlight, so re-run the query rather than leave a stale match count showing. */
   v.addEventListener('did-stop-loading',()=>{t.loading=0;if(cur===t){prog(0);navState();if(fin.classList.contains('on'))findStep()}});
   v.addEventListener('did-fail-load',e=>{if(!e.isMainFrame)return;
    const note=failNote(e.errorCode,hostOf(e.validatedURL||t.url));
    if(!note)return;
    t.fail={code:e.errorCode,url:e.validatedURL||t.url};
    if(cur===t){prog(0);navState();showFail()}});
   v.addEventListener('dom-ready',()=>applyWebCursor(t));v.src=u;pages.appendChild(v)}
  else{try{t.v.loadURL(u)}catch(e){t.v.src=u}}
  sel(t)}
 function add(u){const t={v:null,url:'',title:'Start Page',isNew:true};list.push(t);if(u)go(t,u);else{sel(t);url.focus()}}
 function close(i){const t=list[i];list.splice(i,1);clearTimeout(t.cursorCssTimer);t.v&&t.v.remove();if(t.tabEl){t.tabEl.classList.remove('in');t.tabEl.style.pointerEvents='none';setTimeout(()=>t.tabEl.remove(),520)}
  if(!list.length){add('');return}
  if(cur===t)sel(list[Math.min(i,list.length-1)]);else refresh();
  if(ov.classList.contains('open'))buildOv()}
 function buildOv(){
  ov.innerHTML=list.map((t,i)=>`<div class="card" data-i="${i}"><div class="thumb">${t.v?'':'Start Page'}</div><div class="ct"><span>${esc(t.title)}</span><b>✕</b></div></div>`).join('');
  ov.querySelectorAll('.card').forEach(n=>{const i=+n.dataset.i,t=list[i];n.onclick=()=>sel(t);n.querySelector('b').onclick=e=>{e.stopPropagation();close(i)};
   if(t.v)try{t.v.capturePage().then(img=>{n.querySelector('.thumb').style.backgroundImage='url('+img.toDataURL()+')'}).catch(()=>{})}catch(e){}})}
 function toast(m){if(cfg.quietMode)return;const n=document.createElement('div');n.className='toast';n.textContent=m;q('.bwrap').appendChild(n);requestAnimationFrame(()=>n.classList.add('on'));setTimeout(()=>{n.classList.remove('on');setTimeout(()=>n.remove(),350)},1500)}
 const sug=document.createElement('div');sug.className='sug';document.body.appendChild(sug);
 let items=[],si=-1,typed='',rid=0,tm=0,del=false,remote=[];
 const looksUrl=v=>/^https?:\/\//i.test(v)||(!/\s/.test(v)&&/\.[a-z]{2,}(\/|$)/i.test(v));
 const gs=searchURL;
 const strip=u=>u.replace(/^https?:\/\/(www\.)?/,'').replace(/\/+$/,'');
 function sugHide(){sug.classList.remove('on');si=-1}
 function local(v){const ql=v.toLowerCase(),pool=new Map();
  const sc=(h,u,t)=>{const tl=t?t.toLowerCase():'';return h.startsWith(ql)?100:h.split('.')[0].startsWith(ql)?90:tl.split(/\s+/).some(w=>w.startsWith(ql))?55:h.includes(ql)?60:u.toLowerCase().includes(ql)?40:tl.includes(ql)?35:0};
  const add=(u,t,kind,w)=>{const h=hostOf(u);let s=sc(h,u,t);if(!s)return;s+=w;const k=u.replace(/\/+$/,''),o=pool.get(k);if(!o||o.s<s)pool.set(k,{u,t:t||h,kind,h,s})};
  store.get('bm').forEach(b=>add(b.u,b.t,'bm',25));store.get('hist').forEach(x=>add(x.u,x.t,'hist',Math.min(x.n||1,10)*2));SITES.forEach(d=>add('https://'+d,d,'site',0));
  return[...pool.values()].sort((a,b)=>b.s-a.s)}
 const mapL=(x,ql)=>({ico:x.kind==='bm'?'bookmark':x.kind==='hist'?'history':'globe',main:x.t,sub:strip(x.u),val:strip(x.u),nav:x.u,fill:x.h.startsWith(ql)&&!/[\s/]/.test(ql)?x.h:null});
 function build(v){const ql=v.toLowerCase(),L=local(v),top=L[0],out=[];let usedTop=false;
  if(looksUrl(v))out.push({ico:'globe',main:v,sub:'Go to website',val:v,nav:v});else if(top&&top.s>=90){out.push(mapL(top,ql));usedTop=true}
  out.push({ico:'search',main:v,sub:ENG[cfg.engine].n+' Search',val:v,nav:gs(v)});
  remote.filter(r=>r.toLowerCase().startsWith(ql)&&r.toLowerCase()!==ql).slice(0,5).forEach(r=>out.push({ico:'search',main:r,sub:'',val:r,nav:gs(r)}));
  const used=new Set(out.map(o=>o.nav));L.slice(usedTop?1:0).slice(0,4).forEach(x=>{const o=mapL(x,ql);if(!used.has(o.nav)){used.add(o.nav);out.push(o)}});
  return out.slice(0,9)}
 function paintSug(){if(!el.isConnected){sug.remove();return}if(!items.length){sugHide();return}
  sug.innerHTML=items.map((o,i)=>`<div class="sg${i===si?' on':''}" data-i="${i}"><i>${uiIcon(o.ico)}</i><span>${esc(o.main)}</span><em>${esc(o.sub)}</em></div>`).join('');
  const r=el.querySelector('.addr').getBoundingClientRect();sug.style.left=r.left+'px';sug.style.width=r.width+'px';sug.style.top=(r.bottom+8)+'px';sug.classList.add('on');
  sug.querySelectorAll('.sg').forEach(n=>{n.onpointerdown=e=>e.preventDefault();n.onclick=()=>{const o=items[+n.dataset.i];sugHide();url.blur();go(cur,o.nav)}})}
 function onType(e){typed=url.value;del=!!(e&&/^delete/.test(e.inputType||''));si=-1;const v=typed.trim();
  if(!v){sugHide();items=[];return}
  items=build(v);const o=items[0];
  if(!del&&o&&o.fill&&o.fill.length>v.length&&o.fill.toLowerCase().startsWith(v.toLowerCase())&&document.activeElement===url&&url.selectionStart===v.length){url.value=v+o.fill.slice(v.length);url.setSelectionRange(v.length,url.value.length);si=0}
  paintSug();clearTimeout(tm);const my=++rid;
  if(v.length>1&&!looksUrl(v)&&window.silk&&silk.suggest&&cfg.sugg)tm=setTimeout(()=>silk.suggest(v).then(r=>{if(my!==rid||document.activeElement!==url)return;remote=r||[];items=build(v);paintSug()}).catch(()=>{}),140)}
 url.onfocus=()=>setTimeout(()=>url.select());
 url.onblur=()=>{sugHide();if(cur)url.value=cur.url||''};
 url.oninput=onType;
 url.onkeydown=e=>{
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){if(!items.length||!sug.classList.contains('on'))return;e.preventDefault();si=e.key==='ArrowDown'?Math.min(si+1,items.length-1):Math.max(si-1,-1);url.value=si<0?typed:items[si].val;paintSug();return}
  if(e.key==='Enter'&&cur){const it=si>=0?items[si]:null;sugHide();go(cur,it?it.nav:url.value);url.blur();return}
  if(e.key==='Escape'){sugHide();url.value=cur?cur.url||'':'';url.blur()}};
 el.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>{const a=b.dataset.a;
  try{if(a==='n')add('');else if(a==='side')main.classList.toggle('sidebar');
  else if(a==='ov'){if(ov.classList.contains('open'))ov.classList.remove('open');else{buildOv();ov.classList.add('open')}}
  else if(a==='share'){if(cur&&cur.url){navigator.clipboard.writeText(cur.url);toast('Link copied')}}
  else if(a==='r'){if(cur&&cur.v){if(cur.loading)cur.v.stop();else cur.v.reload()}}
  else if(a==='f'){if(cur&&cur.v)cur.v.canGoForward()&&cur.v.goForward()}
  else if(cur&&cur.v&&a==='b')cur.v.canGoBack()&&cur.v.goBack()}catch(e){}});
 openTab=add;el._b={add,closeCur:()=>close(list.indexOf(cur)),reload:()=>{try{cur&&cur.v&&cur.v.reload()}catch(e){}},addr:()=>url.focus(),impBm:()=>importFile('bm'),impHist:()=>importFile('hist'),addBm,parse:parseAny,merge,rebuild:()=>{buildStart();refresh()},updateCursor:()=>list.forEach(applyWebCursor),ov:()=>q('[data-a=ov]').click(),side:()=>q('[data-a=side]').click(),find:showFind,findOff:()=>{if(fin.classList.contains('on'))hideFind()}};add('');url.blur()}
