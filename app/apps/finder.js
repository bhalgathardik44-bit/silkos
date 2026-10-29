function finderInit(el){const b=el.querySelector('.body'),F=window.silk&&silk.files;
 b.innerHTML='<div class="fnd"><div class="fsb"></div><div class="fmn"><div class="ftb"><button class="fup">‹</button><b class="fpt"></b></div><div class="fls"></div></div></div>';
 const sb=b.querySelector('.fsb'),ls=b.querySelector('.fls'),pt=b.querySelector('.fpt'),j=(d,n)=>(d.endsWith('/')?d:d+'/')+n;let cur='',locations={};
 if(!F){ls.innerHTML='<div class="stm">Finder works when SilkOS runs on Linux.</div>';return}
 async function go(d){const r=await F.list(d,!!cfg.showHiddenFiles);cur=d;pt.textContent=d;sb.querySelectorAll('div').forEach(x=>x.classList.toggle('on',x.dataset.p===d));
  if(r.error){ls.innerHTML='<div class="stm">'+esc(r.error)+'</div>';return}
  cfg.finderLastLocation=d;save();
  const items=[...r.items].sort((a,b)=>{if(cfg.finderSort==='folders'&&a.dir!==b.dir)return a.dir?-1:1;const order=a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'});return cfg.finderSort==='name-desc'?-order:order});
  ls.innerHTML=items.length?items.map(i=>{const shown=cfg.hideFileExtensions&&!i.dir&&!i.name.startsWith('.')?i.name.replace(/\.[^.]+$/,'')||i.name:i.name;return `<div class="fit" data-n="${esc(i.name)}" data-d="${i.dir?1:''}"><span>${i.dir?'📁':/\.exe$/i.test(i.name)?'🪟':'📄'}</span>${esc(shown)}</div>`}).join(''):'<div class="stm">This folder is empty.</div>'}
 const configuredLocation=()=>cfg.finderLocation==='last'?cfg.finderLastLocation||locations.home:locations[cfg.finderLocation]||locations.home;
 el._refresh=()=>go(cur);
 el._setFinderLocation=()=>go(configuredLocation());
 ls.onclick=e=>{ls.querySelectorAll('.fit.on').forEach(x=>x.classList.remove('on'));e.target.closest('.fit')?.classList.add('on')};
 ls.ondblclick=e=>{const x=e.target.closest('.fit');if(!x)return;const p=j(cur,x.dataset.n);x.dataset.d?go(p):F.open(p)};
 b.querySelector('.fup').onclick=()=>cur!=='/'&&go(cur.replace(/\/[^/]+\/?$/,'')||'/');
 F.home().then(h=>{locations={home:h,desktop:j(h,'Desktop'),documents:j(h,'Documents'),downloads:j(h,'Downloads')};sb.innerHTML=[['🏠','Home',h],['🖥️','Desktop',locations.desktop],['📄','Documents',locations.documents],['⬇️','Downloads',locations.downloads],['💽','Computer','/']].map(([i,n,p])=>`<div data-p="${esc(p)}">${i} ${n}</div>`).join('');
  sb.onclick=e=>{const x=e.target.closest('[data-p]');x&&go(x.dataset.p)};go(configuredLocation())})}
