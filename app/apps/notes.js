function notesInit(el){
 const STORE='silk.notes.v2',LEGACY='silk.notes',SAFE_TAGS=new Set(['P','DIV','BR','H1','H2','H3','BLOCKQUOTE','UL','OL','LI','B','STRONG','I','EM','U','S','A','INPUT']);
 const folders=[{id:'notes',name:'Notes',builtin:true}],notes=[],now=()=>Date.now(),makeId=()=>`${now().toString(36)}-${Math.random().toString(36).slice(2,9)}`;
 let currentFolder='all',currentNote='',shownNote='',query='',saveTimer,statusTimer;
 const body=el.querySelector('.body');
 body.innerHTML=`<div class="notes-app"><header class="notes-toolbar"><div class="notes-bar-group"><button class="notes-tool" type="button" data-action="new-folder" title="New Folder" aria-label="New Folder">${uiIcon('folderPlus')}</button><button class="notes-tool" type="button" data-action="new-note" title="New Note" aria-label="New Note">${uiIcon('compose')}</button><button class="notes-tool" type="button" data-action="delete" title="Move to Trash" aria-label="Move to Trash">${uiIcon('trash')}</button></div><span class="notes-bar-sep"></span><div class="notes-bar-group"><span class="notes-style-menu"><span class="notes-style-mark" aria-hidden="true">Aa</span>${uiIcon('chevron')}<select class="notes-format-select" aria-label="Text Style" title="Text Style"><option value="P">Body</option><option value="H1">Title</option><option value="H2">Heading</option><option value="H3">Subheading</option><option value="BLOCKQUOTE">Quote</option></select></span><button class="notes-tool notes-tool-text" type="button" data-format="bold" title="Bold" aria-label="Bold"><b>B</b></button><button class="notes-tool notes-tool-text" type="button" data-format="italic" title="Italic" aria-label="Italic"><i>I</i></button><button class="notes-tool notes-tool-text" type="button" data-format="underline" title="Underline" aria-label="Underline"><u>U</u></button><button class="notes-tool" type="button" data-format="insertUnorderedList" title="Bulleted List" aria-label="Bulleted List">${uiIcon('list')}</button><button class="notes-tool" type="button" data-action="checklist" title="Checklist" aria-label="Checklist">${uiIcon('checklist')}</button><button class="notes-tool" type="button" data-action="link" title="Add Link" aria-label="Add Link">${uiIcon('link')}</button></div><span class="notes-bar-sep"></span><div class="notes-bar-group"><button class="notes-tool" type="button" data-action="pin" title="Pin Note" aria-label="Pin Note">${uiIcon('pin')}</button><button class="notes-tool" type="button" data-action="export" title="Export Note" aria-label="Export Note">${uiIcon('share')}</button></div><label class="notes-search">${uiIcon('search')}<input type="search" placeholder="Search" aria-label="Search Notes" autocomplete="off"></label></header><aside class="notes-folders"><nav class="notes-folder-scroll" aria-label="Note Folders"></nav><div class="notes-folder-actions"><button class="notes-quiet-button" type="button" data-action="new-folder">${uiIcon('folderPlus')}New Folder</button></div></aside><section class="notes-list"><header class="notes-list-head"><h2 class="notes-list-title">All Notes</h2></header><div class="notes-items"></div></section><section class="notes-editor-pane"><div class="notes-trash-banner" hidden></div><div class="notes-editor-scroll"><div class="notes-editor-empty" hidden><h2>No Note</h2></div><div class="notes-doc"><input class="notes-title" type="text" placeholder="New Note" aria-label="Note Title" maxlength="160"><div class="notes-meta"><time></time><span class="notes-meta-dot"></span><span class="notes-meta-folder"></span></div><article class="notes-editor" contenteditable="true" role="textbox" aria-label="Note content" aria-multiline="true" data-placeholder="Start writing…"></article></div></div><footer class="notes-footer" role="status" aria-live="polite">Saved on this device</footer></section></div>`;
 const folderNav=body.querySelector('.notes-folder-scroll'),list=body.querySelector('.notes-items'),listTitle=body.querySelector('.notes-list-title'),search=body.querySelector('.notes-search input'),title=body.querySelector('.notes-title'),editor=body.querySelector('.notes-editor'),metaFolder=body.querySelector('.notes-meta-folder'),metaDot=body.querySelector('.notes-meta-dot'),metaTime=body.querySelector('.notes-meta time'),footer=body.querySelector('.notes-footer'),trashBanner=body.querySelector('.notes-trash-banner'),editorPane=body.querySelector('.notes-editor-pane'),emptyEditor=body.querySelector('.notes-editor-empty'),pinButton=body.querySelector('[data-action=pin]'),formatSelect=body.querySelector('.notes-format-select'),docWrap=body.querySelector('.notes-doc');
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
 function plainText(html){
  const temp=document.createElement('div');temp.appendChild(sanitizeHtml(html));
  /* innerText needs layout and a detached node never gets any, so the block breaks are inserted by hand —
     without them the list cannot tell the first line of a note from the rest of it. */
  temp.querySelectorAll('p,div,h1,h2,h3,blockquote,li,br').forEach(node=>node.after('\n'));
  return temp.textContent.replace(/[ \t\r]+\n/g,'\n').replace(/\n{2,}/g,'\n').trim();
 }
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
  if(date.toDateString()===yesterday.toDateString())return 'Yesterday';
  /* Notes names the weekday for anything inside the past week and only falls back to a date after that. */
  if(today-date<6*864e5&&date.getFullYear()===today.getFullYear())return date.toLocaleDateString([],{weekday:'long'});
  return date.toLocaleDateString([],date.getFullYear()===today.getFullYear()?{month:'short',day:'numeric'}:{month:'short',day:'numeric',year:'numeric'});
 }
 function docLabel(time){const date=new Date(time);return `${date.toLocaleDateString([],{month:'long',day:'numeric',year:'numeric'})} at ${date.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`}
 function folderName(id){return folders.find(folder=>folder.id===id)?.name||'Notes'}
 function renderFolders(){
  const rows=[
   {id:'all',name:'All Notes',icon:'notes',count:notes.filter(note=>!note.deletedAt).length},
   {id:'pinned',name:'Pinned Notes',icon:'pin',count:notes.filter(note=>note.pinned&&!note.deletedAt).length},
   ...folders.map(folder=>({id:folder.id,name:folder.name,icon:'folder',count:notes.filter(note=>note.folderId===folder.id&&!note.deletedAt).length})),
   {id:'trash',name:'Recently Deleted',icon:'trash',count:notes.filter(note=>note.deletedAt).length}
  ];
  folderNav.innerHTML=rows.map(folder=>`<div class="notes-folder-row"><button type="button" class="notes-folder${currentFolder===folder.id?' active':''}" data-folder="${escapeHtml(folder.id)}" aria-current="${currentFolder===folder.id?'page':'false'}"><span class="notes-folder-icon">${uiIcon(folder.icon)}</span><span class="notes-folder-name">${escapeHtml(folder.name)}</span><span class="notes-folder-count">${folder.count||''}</span></button>${folder.id!=='notes'&&folder.id!=='all'&&folder.id!=='pinned'&&folder.id!=='trash'?`<button class="notes-folder-delete" type="button" data-delete-folder="${escapeHtml(folder.id)}" aria-label="Delete ${escapeHtml(folder.name)} folder" title="Delete folder">×</button>`:''}</div>`).join('');
  listTitle.textContent=rows.find(folder=>folder.id===currentFolder)?.name||folderName(currentFolder);
 }
 function renderList(updateEditor=true){
  renderFolders();const scroll=list.scrollTop,items=visibleNotes();
  if(!currentNote||!items.some(note=>note.id===currentNote))currentNote=items[0]?.id||'';
  const selected=activeNote();list.innerHTML=items.map(note=>{const lines=plainText(note.body).trim().split(/\s*\n\s*/).filter(Boolean),head=note.title.trim()||lines[0]||'',snippet=(note.title.trim()?lines:lines.slice(1)).join(' ');return `<article class="notes-item${note.id===currentNote?' active':''}" data-note="${escapeHtml(note.id)}" tabindex="0" aria-label="${escapeHtml(head||snippet.slice(0,50)||'Untitled note')}"><div class="notes-item-top"><time>${dateLabel(note.updatedAt)}</time>${note.pinned?'<span class="notes-pin" role="img" aria-label="Pinned">'+uiIcon('pin')+'</span>':''}</div><h3>${escapeHtml(head||'New Note')}</h3><p>${escapeHtml(snippet||'No additional text')}</p></article>`}).join('');
  if(!items.length)list.innerHTML=`<div class="notes-empty"><b>${currentFolder==='trash'?'Trash is empty':query?'No matches':'No notes yet'}</b><span>${query?'Try a different search.':currentFolder==='trash'?'Deleted notes will appear here.':'Create a note to capture an idea.'}</span></div>`;
  list.scrollTop=scroll;if(updateEditor)renderEditor(selected);
 }
 function renderEditor(note){
  /* Re-selecting the note that is already open must not blink, so the swap only plays on a real change. */
  const noteId=note?.id||'';
  if(noteId!==shownNote){shownNote=noteId;docWrap.classList.remove('note-swap');void docWrap.offsetWidth;docWrap.classList.add('note-swap')}
  const deleted=!!note?.deletedAt;editorPane.classList.toggle('is-trash',deleted);editorPane.classList.toggle('no-note',!note);emptyEditor.hidden=!!note;
  title.value=note?.title||'';title.disabled=!note||deleted;
  editor.innerHTML='';if(note)editor.appendChild(sanitizeHtml(note.body));editor.contentEditable=String(!!note&&!deleted);
  editor.dataset.placeholder=note?'Start writing…':'Select a note or create a new one.';
  /* Notes only names the folder when the note is not already in the default one, so the caption does not repeat itself. */
  metaFolder.textContent=note?(deleted?'Recently Deleted':note.folderId==='notes'?'':folderName(note.folderId)):'';
  metaFolder.hidden=!metaFolder.textContent;metaDot.hidden=!metaFolder.textContent;
  metaTime.textContent=note?docLabel(note.updatedAt):'';
  const pinned=!!note?.pinned;pinButton.classList.toggle('active',pinned);pinButton.setAttribute('aria-pressed',String(pinned));pinButton.title=pinned?'Unpin Note':'Pin Note';pinButton.disabled=!note||deleted;
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
  const heading=title.value.trimStart().slice(0,160),body=cleaned.innerHTML;
  /* Touching another row flushes the editor, and re-saving unchanged text would bump the date and
     shuffle the list the note was picked from — macOS only moves a note when it really was edited. */
  if(note.title===heading&&note.body===body)return;
  note.title=heading;note.body=body;note.updatedAt=now();persist();renderList(false);
 }
 function scheduleSave(){footer.textContent='Saving…';clearTimeout(saveTimer);saveTimer=setTimeout(()=>{saveTimer=0;saveCurrent()},320)}
 el._dispose=()=>{if(saveTimer){clearTimeout(saveTimer);saveTimer=0;saveCurrent()}};
 function createNote(){
  clearTimeout(saveTimer);saveCurrent();
  const folderId=folders.some(folder=>folder.id===currentFolder)?currentFolder:(folders[0]?.id||'notes');
  /* Notes does not stack blank pages: an untouched note in the folder is reused and simply focused. */
  const fresh=notes.find(note=>note.id===currentNote&&note.folderId===folderId&&!note.deletedAt&&!note.title.trim()&&!plainText(note.body).trim());
  if(fresh){query='';search.value='';currentNote=fresh.id;renderList();title.focus();return}
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
 body.querySelector('.notes-folder-actions [data-action=new-folder]').onclick=newFolder;
 body.querySelector('.notes-toolbar').onmousedown=event=>{if(event.target.closest('button'))event.preventDefault()};
 body.querySelector('.notes-toolbar').onclick=event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  const format=button.dataset.format;if(format){runFormat(format);return}
  const action=button.dataset.action;
  if(action==='new-note'){createNote();return}
  if(action==='new-folder'){newFolder();return}
  const note=activeNote();if(!note)return;
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
