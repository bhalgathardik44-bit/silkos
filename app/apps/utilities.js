function calcInit(el){let cur='0',acc=null,op=null,fresh=true;const s=el.querySelector('.scr');
 const ops={'+':(a,b)=>a+b,'−':(a,b)=>a-b,'×':(a,b)=>a*b,'÷':(a,b)=>a/b};
 el.querySelectorAll('button').forEach(b=>b.onclick=()=>{const k=b.textContent;
  if(/\d/.test(k)){cur=fresh?k:cur+k;fresh=false}
  else if(k==='.'){if(!cur.includes('.'))cur+='.';fresh=false}
  else if(k==='C'){cur='0';acc=op=null;fresh=true}
  else if(k==='±')cur=String(-cur);else if(k==='%')cur=String(cur/100);
  else{if(op&&!fresh)cur=String(ops[op](+acc,+cur));acc=cur;op=k==='='?null:k;fresh=true}
  s.textContent=String(+(+cur).toPrecision(10)===+cur?cur:(+cur).toPrecision(10)).slice(0,12)})}
function resourcesInit(el){
 const body=el.querySelector('.body'),R=window.silk&&silk.resources;
 body.innerHTML='<div class="resapp"><header class="reshead"><div class="residentity"><span class="resbadge" aria-hidden="true">'+uiIcon('display')+'</span><div><h2>System Monitor</h2><p>Live system activity</p></div></div><div class="rescontrols"><label class="ressearch"><input aria-label="Filter processes" placeholder="Filter processes" autocomplete="off"></label><select class="resselect" aria-label="Refresh interval"><option value="1000">1 sec</option><option value="2000" selected>2 sec</option><option value="5000">5 sec</option></select><button class="resaction respause" type="button" aria-pressed="false">Pause</button><button class="resaction resrefresh" type="button" title="Refresh now" aria-label="Refresh now">'+uiIcon('refresh')+'</button></div></header><nav class="restabs" role="tablist" aria-label="System Monitor views"><button class="restab active" type="button" role="tab" id="res-tab-overview" aria-selected="true" aria-controls="res-panel-overview" data-tab="overview">Overview</button><button class="restab" type="button" role="tab" id="res-tab-processes" aria-selected="false" aria-controls="res-panel-processes" data-tab="processes">Processes</button><button class="restab" type="button" role="tab" id="res-tab-performance" aria-selected="false" aria-controls="res-panel-performance" data-tab="performance">Performance</button></nav><main class="rescontent"><section class="respanel active" id="res-panel-overview" role="tabpanel" aria-labelledby="res-tab-overview" data-panel="overview"><div class="resmetrics"></div><div class="resoverview-grid"><article class="rescard"><div class="rescard-head"><h3>Highest CPU</h3><span>Current usage</span></div><div class="resrank resrank-cpu"></div></article><article class="rescard"><div class="rescard-head"><h3>Highest memory</h3><span>Working set</span></div><div class="resrank resrank-memory"></div></article></div></section><section class="respanel" id="res-panel-processes" role="tabpanel" aria-labelledby="res-tab-processes" data-panel="processes" hidden><div class="respanel-head"><div><h3>Processes</h3><p class="rescaption">Applications and background tasks</p></div><span class="rescount"></span></div><div class="restablewrap"><table class="restable"><thead><tr><th scope="col" data-sort="name" tabindex="0">Process</th><th scope="col" data-sort="pid" tabindex="0">PID</th><th scope="col" data-sort="cpu" tabindex="0">CPU</th><th scope="col" data-sort="memory" tabindex="0">Memory</th></tr></thead><tbody></tbody></table></div></section><section class="respanel" id="res-panel-performance" role="tabpanel" aria-labelledby="res-tab-performance" data-panel="performance" hidden><div class="respanel-head"><div><h3>Performance</h3><p>Resource use over time</p></div></div><div class="resperf"></div></section></main><footer class="resstatus" role="status" aria-live="polite">Starting monitor…</footer></div>';
 const search=body.querySelector('.ressearch input'),metrics=body.querySelector('.resmetrics'),rows=body.querySelector('tbody'),caption=body.querySelector('.rescaption'),count=body.querySelector('.rescount'),status=body.querySelector('.resstatus'),pause=body.querySelector('.respause'),refreshButton=body.querySelector('.resrefresh'),intervalSelect=body.querySelector('.resselect');
 const rankCpu=body.querySelector('.resrank-cpu'),rankMemory=body.querySelector('.resrank-memory'),performance=body.querySelector('.resperf');
 let data=null,query='',sort='cpu',descending=true,busy=false,paused=false,interval=2000,timer=null,activeTab='overview';
 const size=n=>{if(!Number.isFinite(n))return '—';const units=['B','KB','MB','GB','TB'];let i=0;while(n>=1024&&i<units.length-1){n/=1024;i++}return `${n.toFixed(i?1:0)} ${units[i]}`};
 const history={cpu:[],memory:[],disk:[]};
 const pct=value=>Number.isFinite(value)?Math.max(0,Math.min(100,value)):0;
 const spark=(values,color,height=34)=>{if(!values.length)return '';const points=values.map((v,i)=>`${values.length===1?50:i/(values.length-1)*100},${height-3-pct(v)*(height-6)/100}`).join(' ');return `<svg viewBox="0 0 100 ${height}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg>`};
 function setTab(tab){
  activeTab=tab;
  body.querySelectorAll('.restab').forEach(button=>{const selected=button.dataset.tab===tab;button.classList.toggle('active',selected);button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1});
  body.querySelectorAll('.respanel').forEach(panel=>{const selected=panel.dataset.panel===tab;panel.classList.toggle('active',selected);panel.hidden=!selected});
  search.disabled=tab!=='processes';
 }
 function ranking(target,items,key,format,color){
  if(!items.length){target.innerHTML='<div class="resmessage">No process data yet.</div>';return}
  const max=Math.max(1,...items.map(process=>Number(process[key])||0));
  target.innerHTML=items.map(process=>{const value=Number(process[key])||0,width=Math.max(value>0?2:0,value/max*100);return `<div class="resrank-row"><span title="${esc(process.name)}">${esc(process.name)}</span><strong>${format(value)}</strong><span class="resrank-track"><i style="width:${width.toFixed(1)}%;background:${color}"></i></span></div>`}).join('');
 }
 function render(){
  if(!data)return;
  if(data.error){const message=`<div class="resmessage">${esc(data.error)}</div>`;metrics.innerHTML=message;rankCpu.innerHTML=message;rankMemory.innerHTML=message;performance.innerHTML=message;rows.innerHTML='';caption.textContent='Could not load process data';count.textContent='';status.textContent=data.error;return}
  const processes=Array.isArray(data.processes)?data.processes:[],cpu=pct(data.cpu.percent),memory=data.memory.total?pct(data.memory.used/data.memory.total*100):0,disk=data.disk&&data.disk.total?pct((data.disk.total-data.disk.free)/data.disk.total*100):null;
  const freeMemory=Math.max(0,data.memory.total-data.memory.used);
  metrics.innerHTML=`<article class="resmetric"><small>PROCESSOR · ${data.cpu.cores} cores</small><strong>${cpu.toFixed(1)}%</strong>${spark(history.cpu,'#0a84ff',26)}</article><article class="resmetric"><small>MEMORY · ${memory.toFixed(1)}% used</small><strong>${size(data.memory.used)}</strong>${spark(history.memory,'#af52de',26)}</article><article class="resmetric"><small>STORAGE · ${disk===null?'Unavailable':`${disk.toFixed(1)}% used`}</small><strong>${data.disk?size(data.disk.total-data.disk.free):'Unavailable'}</strong>${spark(history.disk,'#34c759',26)}</article><article class="resmetric"><small>RUNNING PROCESSES</small><strong>${processes.length}</strong><span class="resperf-meta">Live process count</span></article>`;
  const sortedProcesses=[...processes].sort((a,b)=>{const x=a[sort],y=b[sort];return (typeof x==='string'?String(x).localeCompare(String(y)):(Number(x)||0)-(Number(y)||0))*(descending?-1:1)});
  const shown=sortedProcesses.filter(process=>`${process.name} ${process.pid}`.toLowerCase().includes(query));
  count.textContent=`${shown.length} ${shown.length===1?'process':'processes'}`;
  caption.textContent=query?`Matching “${search.value.trim()}”`:'Applications and background tasks';
  rows.innerHTML=shown.length?shown.map(process=>`<tr><td title="${esc(process.name)}">${esc(process.name)}</td><td>${Number(process.pid)||'—'}</td><td>${Number(process.cpu||0).toFixed(1)}%</td><td>${size(Number(process.memory)||0)}</td></tr>`).join(''):'<tr><td colspan="4" class="resmessage">No matching processes.</td></tr>';
  body.querySelectorAll('th[data-sort]').forEach(th=>{const key=th.dataset.sort,label=key==='name'?'Process':key.toUpperCase();th.textContent=`${label}${sort===key?(descending?' ↓':' ↑'):''}`;th.setAttribute('aria-sort',sort===key?(descending?'descending':'ascending'):'none')});
  ranking(rankCpu,[...processes].sort((a,b)=>(Number(b.cpu)||0)-(Number(a.cpu)||0)).slice(0,5),'cpu',value=>`${value.toFixed(1)}%`,'#0a84ff');
  ranking(rankMemory,[...processes].sort((a,b)=>(Number(b.memory)||0)-(Number(a.memory)||0)).slice(0,5),'memory',size,'#af52de');
  performance.innerHTML=`<article class="resperf-card"><div class="resperf-head"><span>Processor</span><small>${data.cpu.cores} logical cores</small></div><div class="resperf-value">${cpu.toFixed(1)}<small>%</small></div>${spark(history.cpu,'#0a84ff',76)}<div class="resperf-meta"><span>Current utilization</span><span>${history.cpu.length} samples</span></div></article><article class="resperf-card"><div class="resperf-head"><span>Memory</span><small>${size(data.memory.total)} total</small></div><div class="resperf-value">${memory.toFixed(1)}<small>%</small></div>${spark(history.memory,'#af52de',76)}<div class="resperf-meta"><span>${size(data.memory.used)} in use</span><span>${size(freeMemory)} available</span></div></article><article class="resperf-card"><div class="resperf-head"><span>Storage</span><small>${data.disk?'Home volume':'Unavailable'}</small></div><div class="resperf-value">${disk===null?'—':disk.toFixed(1)}<small>${disk===null?'':'%'}</small></div>${spark(history.disk,'#34c759',76)}<div class="resperf-meta"><span>${data.disk?size(data.disk.total-data.disk.free)+' used':'No volume data'}</span><span>${data.disk?size(data.disk.free)+' free':''}</span></div></article><article class="resperf-card"><div class="resperf-head"><span>Processes</span><small>System-wide</small></div><div class="resperf-value">${processes.length}</div><div class="resperf-meta"><span>Active process records</span><span>Sorted by ${esc(sort.toUpperCase())}</span></div></article>`;
  status.textContent=`Updated ${new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit',second:'2-digit'})} · ${paused?'Updates paused':`refreshes every ${interval/1000}s`}`;
 }
 body.querySelector('.restabs').onclick=e=>{const tab=e.target.closest('[data-tab]')?.dataset.tab;if(tab)setTab(tab)};
 body.querySelector('.restabs').onkeydown=e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const tabs=[...body.querySelectorAll('.restab')],index=tabs.findIndex(tab=>tab.dataset.tab===activeTab),next=tabs[(index+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];setTab(next.dataset.tab);next.focus()};
 search.oninput=()=>{query=search.value.trim().toLowerCase();render()};
 refreshButton.onclick=()=>refresh();
 pause.onclick=()=>{paused=!paused;pause.textContent=paused?'Resume':'Pause';pause.setAttribute('aria-pressed',String(paused));scheduleRefresh()};
 intervalSelect.onchange=()=>{interval=Number(intervalSelect.value);scheduleRefresh()};
 body.querySelector('thead').onclick=e=>{const key=e.target.closest('[data-sort]')?.dataset.sort;if(!key)return;if(sort===key)descending=!descending;else{sort=key;descending=key!=='name'}render()};
 body.querySelector('thead').onkeydown=e=>{if(e.key!=='Enter'&&e.key!==' ')return;const key=e.target.closest('[data-sort]')?.dataset.sort;if(!key)return;e.preventDefault();if(sort===key)descending=!descending;else{sort=key;descending=key!=='name'}render()};
 async function refresh(){
  if(!R){data={error:'System resource monitoring is available in the SilkOS desktop app.'};render();return}
  if(busy)return;
  busy=true;
  refreshButton.classList.add('busy');refreshButton.disabled=true;status.textContent='Refreshing system data…';
  try{
   const next=await R();if(!el.isConnected)return;data=next;
   if(!next.error){const disk=next.disk&&next.disk.total?((next.disk.total-next.disk.free)/next.disk.total*100):0;[[history.cpu,next.cpu.percent],[history.memory,next.memory.total?next.memory.used/next.memory.total*100:0],[history.disk,disk]].forEach(([list,value])=>{list.push(pct(value));if(list.length>48)list.shift()})}
   render()
  }
  catch(e){data={error:`Could not load system resources: ${e.message}`};render()}
  finally{busy=false;refreshButton.classList.remove('busy');refreshButton.disabled=false}
 }
 function scheduleRefresh(){clearTimeout(timer);if(!el.isConnected)return;if(paused){status.textContent='Updates paused · use Refresh now to update';return}timer=setTimeout(()=>{refresh().finally(scheduleRefresh)},interval)}
 setTab(activeTab);refresh().finally(scheduleRefresh);
}
function aboutInit(el){
 el.querySelector('#lite').onclick=e=>{e.target.classList.toggle('on');document.body.classList.toggle('lite')};
 let f=0,t=performance.now();const o=el.querySelector('#fps');
 (function l(n){f++;if(n-t>=1000){o.textContent=f+' fps';f=0;t=n}if(el.isConnected)requestAnimationFrame(l)})(t)}
