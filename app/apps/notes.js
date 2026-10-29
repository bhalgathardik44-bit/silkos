function notesInit(el){
 const STORE='silk.notes.v2',LEGACY='silk.notes',SAFE_TAGS=new Set(['P','DIV','BR','H1','H2','H3','BLOCKQUOTE','UL','OL','LI','B','STRONG','I','EM','U','S','A','INPUT']);
 const folders=[{id:'notes',name:'Notes',builtin:true}],notes=[],now=()=>Date.now(),makeId=()=>`${now().toString(36)}-${Math.random().toString(36).slice(2,9)}`;
 let currentFolder='all',currentNote='',query='',saveTimer,statusTimer;
 const body=el.querySelector('.body');
 body.innerHTML=`<div class="notes-app"><aside class="notes-folders"><div class="notes-brand"><span class="notes-brand-mark">N</span><span>Notes</span></div><div class="notes-section-label">Library</div><nav class="notes-folder-scroll" aria-label="Note folders"></nav><div class="notes-folder-actions"><button class="notes-quiet-button" data-action="new-folder">＋ New folder</button></div></aside><section class="notes-list"><header class="notes-list-head"><h2 class="notes-list-title">All Notes</h2><button class="notes-new" type="button" data-action="new-note" title="New note" aria-label="New note">+</button></header><label class="notes-search">${uiIcon('search')}<input type="search" placeholder="Search notes" aria-label="Search notes"></label><div class="notes-items"></div></section><section class="notes-editor-pane"><div class="notes-toolbar"><div class="notes-toolbar-group"><select class="notes-format-select" aria-label="Text style"><option value="P">Body</option><option value="H1">Title</option><option value="H2">Heading</option><option value="H3">Subheading</option><option value="BLOCKQUOTE">Quote</option></select><button class="notes-tool" type="button" data-format="bold" title="Bold" aria-label="Bold"><b>B</b></button><button class="notes-tool" type="button" data-format="italic" title="Italic" aria-label="Italic"><i>I</i></button><button class="notes-tool" type="button" data-format="underline" title="Underline" aria-label="Underline"><u>U</u></button></div><span class="notes-toolbar-divider"></span><div class="notes-toolbar-group"><button class="notes-tool" type="button" data-format="insertUnorderedList" title="Bulleted list" aria-label="Bulleted list">☷</button><button class="notes-tool" type="button" data-action="checklist" title="Checklist" aria-label="Checklist">☑</button><button class="notes-tool" type="button" data-action="link" title="Add link" aria-label="Add link">↗</button></div><span class="notes-toolbar-divider"></span><div class="notes-toolbar-group"><button class="notes-tool" type="button" data-action="pin" title="Pin note" aria-label="Pin note">☆</button><button class="notes-tool" type="button" data-action="export" title="Export note" aria-label="Export note">↓</button><button class="notes-tool" type="button" data-action="delete" title="Move to Trash" aria-label="Move to Trash">⌫</button></div></div><div class="notes-trash-banner" hidden></div><div class="notes-editor-scroll"><div class="notes-editor-empty" hidden><span class="notes-empty-mark">N</span><h2>Your ideas, in one place</h2><p>Select a note to keep writing, or start with a fresh page.</p><button type="button" data-action="new-note">Create a note</button></div><input class="notes-title" type="text" placeholder="New note" aria-label="Note title" maxlength="160"><div class="notes-meta"><span class="notes-meta-folder"></span><span class="notes-meta-dot"></span><time></time></div><article class="notes-editor" contenteditable="true" role="textbox" aria-label="Note content" aria-multiline="true" data-placeholder="Start writing…"></article></div><footer class="notes-footer" role="status" aria-live="polite">Saved on this device</footer></section></div>`;
 const folderNav=body.querySelector('.notes-folder-scroll'),list=body.querySelector('.notes-items'),listTitle=body.querySelector('.notes-list-title'),search=body.querySelector('.notes-search input'),title=body.querySelector('.notes-title'),editor=body.querySelector('.notes-editor'),metaFolder=body.querySelector('.notes-meta-folder'),metaTime=body.querySelector('.notes-meta time'),footer=body.querySelector('.notes-footer'),trashBanner=body.querySelector('.notes-trash-banner'),editorPane=body.querySelector('.notes-editor-pane'),emptyEditor=body.querySelector('.notes-editor-empty'),pinButton=body.querySelector('[data-action=pin]'),formatSelect=body.querySelector('.notes-format-select');
 const escapeHtml=value=>esc(String(value??''));
 function sanitizeHtml(input){
  const parsed=new DOMParser().parseFromString(`<body>${String(input||'')}</body>`,'text/html'),output=document.createDocumentFragment();
  function copy(node,parent){
   if(node.nodeType===Node.TEXT_NODE){parent.appendChild(document.createTextNode(node.nodeValue));return}
   if(node.nodeType!==Node.ELEMENT_NODE)return;
   const tag=node.tagName;
   if(['SCRIPT','STYLE','IFRAME','OBJECT','SVG','MATH'].includes(tag))return;
   if(!SAFE_TAGS.has(tag)){node.childNodes.forEach(child=>copy(child,parent));return}
   const clean=document.createElement(tag.toLowerCase());
   if(tag==='INPUT'&&node.getAttribute('type')==='checkbox'){clean.type='checkbox';clean.checked=node.hasAttribute('checked');clean.contentEditable='false';clean.setAttribute('aria-label','Checklist item')}
   if(tag==='A'){try{const url=new URL(node.getAttribute('href')||'');if(['http:','https:','mailto:'].includes(url.protocol)){clean.href=url.href;clean.target='_blank';clean.rel='noopener noreferrer'}}catch{}}
   node.childNodes.forEach(child=>copy(child,clean));parent.appendChild(clean);
  }
  parsed.body.childNodes.forEach(node=>copy(node,output));return output;
 }
 function plainText(html){const temp=document.createElement('div');temp.appendChild(sanitizeHtml(html));return temp.innerText||temp.textContent||''}
 function persist(){
  try{localStorage.setItem(STORE,JSON.stringify({version:1,folders,notes}));footer.textContent='Saved on this device';return true}
  catch(error){console.error('Could not save Notes:',error);footer.textContent='Could not save — device storage may be full';return false}
 }
 try{
  const saved=JSON.parse(localStorage.getItem(STORE)||'null');
  if(saved?.version===1&&Array.isArray(saved.folders)&&Array.isArray(saved.notes)){
   for(const folder of saved.folders)if(folder&&typeof folder.id==='string'&&typeof folder.name==='string'&&folder.id!=='notes'&&!folders.some(item=>item.id===folder.id))folders.push({id:folder.id,name:folder.name.slice(0,40)});
   const validFolders=new Set(folders.map(folder=>folder.id));
   for(const note of saved.notes)if(note&&typeof note.id==='string'&&typeof note.title==='string'&&typeof note.body==='string'){
    notes.push({id:note.id,folderId:validFolders.has(note.folderId)?note.folderId:'notes',title:note.title.slice(0,160),body:note.body,createdAt:Number(note.createdAt)||now(),updatedAt:Number(note.updatedAt)||now(),pinned:note.pinned===true,deletedAt:Number(note.deletedAt)||0,font:['system','serif','mono'].includes(note.font)?note.font:'system'});
   }
  }else if(typeof localStorage.getItem(LEGACY)==='string'&&localStorage.getItem(LEGACY)){
   const text=localStorage.getItem(LEGACY),note={id:makeId(),folderId:'notes',title:'',body:text.split(/\r?\n/).map(line=>`<p>${escapeHtml(line)||'<br>'}</p>`).join(''),createdAt:now(),updatedAt:now(),pinned:false,deletedAt:0,font:'system'};
   notes.push(note);persist();
  }
 }catch(error){console.error('Could not read saved Notes:',error);footer.textContent='Could not read saved notes'}
 function activeNote(){return notes.find(note=>note.id===currentNote)||null}
 function visibleNotes(){
  const needle=query.toLocaleLowerCase();
  return notes.filter(note=>{
   if(currentFolder==='trash'?!note.deletedAt:!!note.deletedAt)return false;
   if(currentFolder==='pinned'&&!note.pinned)return false;
   if(currentFolder!=='all'&&currentFolder!=='pinned'&&currentFolder!=='trash'&&note.folderId!==currentFolder)return false;
   return !needle||`${note.title} ${plainText(note.body)}`.toLocaleLowerCase().includes(needle);
  }).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.updatedAt-a.updatedAt);
 }
 function dateLabel(time){
  const date=new Date(time),today=new Date();
  if(date.toDateString()===today.toDateString())return date.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
  const yesterday=new Date(today);yesterday.setDate(yesterday.getDate()-1);
  return date.toDateString()===yesterday.toDateString()?'Yesterday':date.toLocaleDateString([],{month:'short',day:'numeric'});
 }
 function folderName(id){return folders.find(folder=>folder.id===id)?.name||'Notes'}
 function renderFolders(){
  const rows=[
   {id:'all',name:'All Notes',icon:'▤',count:notes.filter(note=>!note.deletedAt).length},
   {id:'pinned',name:'Pinned',icon:'☆',count:notes.filter(note=>note.pinned&&!note.deletedAt).length},
   ...folders.map(folder=>({id:folder.id,name:folder.name,icon:'▱',count:notes.filter(note=>note.folderId===folder.id&&!note.deletedAt).length})),
   {id:'trash',name:'Recently Deleted',icon:'⌫',count:notes.filter(note=>note.deletedAt).length}
  ];
  folderNav.innerHTML=rows.map(folder=>`<div class="notes-folder-row"><button type="button" class="notes-folder${currentFolder===folder.id?' active':''}" data-folder="${escapeHtml(folder.id)}" aria-current="${currentFolder===folder.id?'page':'false'}"><span class="notes-folder-icon">${folder.icon}</span><span class="notes-folder-name">${escapeHtml(folder.name)}</span><span class="notes-folder-count">${folder.count||''}</span></button>${folder.id!=='notes'&&folder.id!=='all'&&folder.id!=='pinned'&&folder.id!=='trash'?`<button class="notes-folder-delete" type="button" data-delete-folder="${escapeHtml(folder.id)}" aria-label="Delete ${escapeHtml(folder.name)} folder" title="Delete folder">×</button>`:''}</div>`).join('');
  listTitle.textContent=rows.find(folder=>folder.id===currentFolder)?.name||folderName(currentFolder);
 }
 function renderList(updateEditor=true){
  renderFolders();const scroll=list.scrollTop,items=visibleNotes();
  if(currentNote&&!items.some(note=>note.id===currentNote))currentNote=items[0]?.id||'';
  const selected=activeNote();list.innerHTML=items.map(note=>{const text=plainText(note.body).trim().replace(/\s+/g,' ');return `<article class="notes-item${note.id===currentNote?' active':''}" data-note="${escapeHtml(note.id)}" tabindex="0" aria-label="${escapeHtml(note.title||text.slice(0,50)||'Untitled note')}"><div class="notes-item-top"><time>${dateLabel(note.updatedAt)}</time>${note.pinned?'<span class="notes-pin" aria-label="Pinned">★</span>':''}</div><h3>${escapeHtml(note.title||text.split('\n')[0]||'New Note')}</h3><p>${escapeHtml(text||'No additional text')}</p></article>`}).join('');
  if(!items.length)list.innerHTML=`<div class="notes-empty"><b>${currentFolder==='trash'?'Trash is empty':query?'No matches':'No notes yet'}</b><span>${query?'Try a different search.':currentFolder==='trash'?'Deleted notes will appear here.':'Create a note to capture an idea.'}</span></div>`;
  list.scrollTop=scroll;if(updateEditor)renderEditor(selected);
 }
 function renderEditor(note){
  const deleted=!!note?.deletedAt;editorPane.classList.toggle('is-trash',deleted);editorPane.classList.toggle('no-note',!note);emptyEditor.hidden=!!note;
  title.value=note?.title||'';title.disabled=!note||deleted;
  editor.innerHTML='';if(note)editor.appendChild(sanitizeHtml(note.body));editor.contentEditable=String(!!note&&!deleted);
  editor.dataset.placeholder=note?'Start writing…':'Select a note or create a new one.';
  metaFolder.textContent=note?(deleted?'Recently Deleted':folderName(note.folderId)):'';
  metaTime.textContent=note?`Edited ${dateLabel(note.updatedAt)}`:'';
  pinButton.textContent=note?.pinned?'★':'☆';pinButton.classList.toggle('active',!!note?.pinned);pinButton.disabled=!note||deleted;
  body.querySelectorAll('.notes-toolbar [data-format],.notes-toolbar [data-action]').forEach(button=>{if(!['new-note','new-folder','restore','permanent'].includes(button.dataset.action))button.disabled=!note||deleted});
  formatSelect.disabled=!note||deleted;
  trashBanner.hidden=!deleted;
  trashBanner.innerHTML=deleted?`This note is in Recently Deleted. <button class="notes-quiet-button" data-action="restore">Restore</button> <button class="notes-quiet-button" data-action="permanent">Delete permanently</button>`:'';
  if(!note)footer.textContent='Notes are stored on this device';
  else if(deleted)footer.textContent='Deleted note';
  else footer.textContent='Saved on this device';
  const fonts={system:'ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',serif:'Georgia,"Times New Roman",serif',mono:'ui-monospace,SFMono-Regular,Consolas,monospace'};
  editor.style.fontFamily=fonts[note?.font]||fonts.system;
 }
 function saveCurrent(){
  const note=activeNote();if(!note||note.deletedAt)return;
  const cleaned=document.createElement('div');cleaned.appendChild(sanitizeHtml(editor.innerHTML));
  note.title=title.value.trimStart().slice(0,160);note.body=cleaned.innerHTML;note.updatedAt=now();persist();renderList(false);
 }
 function scheduleSave(){footer.textContent='Saving…';clearTimeout(saveTimer);saveTimer=setTimeout(saveCurrent,320)}
 function createNote(){
  const folderId=folders.some(folder=>folder.id===currentFolder)?currentFolder:(folders[0]?.id||'notes');
  const note={id:makeId(),folderId,title:'',body:'',createdAt:now(),updatedAt:now(),pinned:false,deletedAt:0,font:'system'};
  notes.push(note);currentFolder=folderId;query='';search.value='';currentNote=note.id;persist();renderList();title.focus();
 }
 function selectFolder(id){
  currentFolder=id;query='';search.value='';const items=visibleNotes();currentNote=items[0]?.id||'';renderList();
 }
 function newFolder(){
  const name=prompt('Name this folder:');if(!name||!name.trim())return;
  if(folders.some(folder=>folder.name.toLocaleLowerCase()===name.trim().toLocaleLowerCase())){alert('A folder with that name already exists.');return}
  const folder={id:makeId(),name:name.trim().slice(0,40)};folders.push(folder);currentFolder=folder.id;currentNote='';persist();renderList();
 }
 function deleteFolder(id){
  const folder=folders.find(item=>item.id===id);if(!folder||folder.builtin)return;
  if(!confirm(`Delete the “${folder.name}” folder? Notes in it will move to Notes.`))return;
  notes.filter(note=>note.folderId===id).forEach(note=>{note.folderId='notes';note.updatedAt=now()});
  folders.splice(folders.indexOf(folder),1);currentFolder='notes';currentNote='';persist();renderList();
 }
 function runFormat(command,value){
  const note=activeNote();if(!note||note.deletedAt)return;
  editor.focus();document.execCommand(command,false,value||null);scheduleSave();
 }
 function exportNote(){
  const note=activeNote();if(!note)return;
  const text=`${note.title||'Untitled note'}\n\n${plainText(note.body)}`.trimEnd(),blob=new Blob([text],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=`${(note.title||'Untitled note').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').slice(0,100)}.txt`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);footer.textContent='Note exported';
 }
 folderNav.onclick=event=>{const del=event.target.closest('[data-delete-folder]');if(del){deleteFolder(del.dataset.deleteFolder);return}const button=event.target.closest('[data-folder]');if(button)selectFolder(button.dataset.folder)};
 list.onclick=event=>{const item=event.target.closest('[data-note]');if(!item)return;clearTimeout(saveTimer);saveCurrent();currentNote=item.dataset.note;renderList()};
 list.onkeydown=event=>{if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-note]')){event.preventDefault();event.target.click()}};
 search.oninput=()=>{clearTimeout(saveTimer);saveCurrent();query=search.value.trim();renderList()};
 title.oninput=scheduleSave;editor.oninput=scheduleSave;
 editor.onclick=event=>{if(event.target.matches('input[type=checkbox]')){event.preventDefault();event.target.checked=!event.target.checked;event.target.toggleAttribute('checked',event.target.checked);scheduleSave()}};
 body.querySelector('[data-action=new-note]').onclick=createNote;
 body.querySelector('[data-action=new-folder]').onclick=newFolder;
 emptyEditor.querySelector('[data-action=new-note]').onclick=createNote;
 body.querySelector('.notes-toolbar').onmousedown=event=>{if(event.target.closest('button'))event.preventDefault()};
 body.querySelector('.notes-toolbar').onclick=event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  const format=button.dataset.format;if(format){runFormat(format);return}
  const action=button.dataset.action,note=activeNote();if(!note)return;
  if(action==='pin'){note.pinned=!note.pinned;note.updatedAt=now();persist();renderList()}
  else if(action==='delete'){note.deletedAt=now();note.updatedAt=now();currentNote='';persist();renderList()}
  else if(action==='checklist'){runFormat('insertHTML','<ul><li><input type="checkbox" aria-label="Checklist item"> <span></span></li></ul><p><br></p>')}
  else if(action==='link'){const value=prompt('Enter a web address:');if(value){let url;try{url=new URL(value)}catch{try{url=new URL(`https://${value}`)}catch{url=null}}if(!url||!['https:','http:','mailto:'].includes(url.protocol)){alert('Enter a valid web address.');return}runFormat('createLink',url.href)}}
  else if(action==='export')exportNote();
  else if(action==='restore'){note.deletedAt=0;note.updatedAt=now();currentFolder=note.folderId;persist();renderList()}
  else if(action==='permanent'&&confirm('Permanently delete this note? This cannot be undone.')){notes.splice(notes.indexOf(note),1);currentNote='';persist();renderList()}
 };
 trashBanner.onclick=event=>{
  const button=event.target.closest('[data-action]'),note=activeNote();if(!button||!note?.deletedAt)return;
  if(button.dataset.action==='restore'){note.deletedAt=0;note.updatedAt=now();currentFolder=note.folderId;persist();renderList()}
  else if(button.dataset.action==='permanent'&&confirm('Permanently delete this note? This cannot be undone.')){notes.splice(notes.indexOf(note),1);currentNote='';persist();renderList()}
 };
 formatSelect.onchange=()=>runFormat('formatBlock',`<${formatSelect.value}>`);
 renderList();
}
