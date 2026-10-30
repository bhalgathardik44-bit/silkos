const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const main = read('main.js');
const preload = read('preload.js');
const shell = read('app/shell.js');
const finder = read('app/apps/finder.js');
const store = read('app/apps/store.js');
const settings = read('app/apps/settings.js');
const css = read('app/desktop.css');

test('preload exposes portal, audio, capture and Finder stat bridges', () => {
  for (const bridge of [
    "portal: () => ipcRenderer.invoke('sys:portal:check')",
    "devices: () => ipcRenderer.invoke('sys:audio:devices')",
    "select: (kind, name) => ipcRenderer.invoke('sys:audio:select', kind, name)",
    "stat: paths => ipcRenderer.invoke('fs:stat', paths)",
    "full: () => ipcRenderer.invoke('screenshot:full')",
    "region: () => ipcRenderer.invoke('screenshot:region')",
    "cancel: () => ipcRenderer.invoke('screenshot:cancel')",
    "complete: rect => ipcRenderer.invoke('screenshot:complete', rect)",
    "onInit: cb => subscribe('screenshot:init', cb)",
    "onSaved: cb => subscribe('screenshot:saved', cb)",
    "onError: cb => subscribe('screenshot:error', cb)",
    "connectWifi: (ssid, password, hidden) => ipcRenderer.invoke('sys:wifi:connect', ssid, password, hidden === true)"
  ]) {
    assert.ok(preload.includes(bridge), `preload is missing: ${bridge}`);
  }
});

test('main registers audio, portal, screenshot and Finder write handlers', () => {
  for (const channel of [
    'sys:audio:devices',
    'sys:audio:select',
    'sys:portal:check',
    'screenshot:full',
    'screenshot:region',
    'screenshot:cancel',
    'screenshot:complete',
    'fs:stat',
    'fs:mkdir',
    'fs:rename',
    'fs:trash',
    'fs:move'
  ]) {
    assert.ok(main.includes(`ipcMain.handle('${channel}'`), `main is missing ${channel}`);
  }
});

test('Finder writes are confined to the home folder and read the freedesktop Trash layout', () => {
  assert.ok(main.includes('const homeRoot = () => path.resolve(os.homedir());'));
  assert.ok(main.includes('return candidate === root || candidate.startsWith(root + path.sep);'));
  assert.ok(main.includes("'SilkOS can only change files in your home folder.'"));
  assert.ok(main.includes("path.join(root, '.local', 'share', 'Trash')"));
  assert.ok(main.includes('`[Trash Info]\\nPath=${encodeURI(from)}\\nDeletionDate=${trashStamp(new Date())}\\n`'));
  assert.ok(main.includes("'A folder cannot be moved inside itself.'"));
});

test('hidden Wi-Fi joins pass the SSID separately and flag the hidden probe', () => {
  assert.ok(main.includes("const args = ['device', 'wifi', 'connect', ssid];"));
  assert.ok(main.includes('if (hidden === true) args.push(\'hidden\', \'yes\');'));
  assert.ok(main.indexOf("args.push('hidden', 'yes')") < main.indexOf("await runDetailed('nmcli', args, 30000)"));
});

test('screenshots land in Pictures and are wired to Super+Shift shortcuts', () => {
  assert.ok(main.includes("path.join(os.homedir(), 'Pictures', 'Screenshots')"));
  assert.ok(main.includes("['Super+Shift+3', 'screenshot-full'], ['Super+Shift+4', 'screenshot-region']"));
  assert.ok(main.includes("if (shortcut === 'screenshot-full') { void captureFullScreen(); return; }"));
  assert.ok(main.includes("if (shortcut === 'screenshot-region') { void beginRegionCapture(); return; }"));
  assert.ok(main.includes('clipboard.writeImage(image)'));
  assert.ok(main.includes("win.webContents.send('screenshot:init'"));
  assert.ok(main.includes("mainWindow.webContents.send('screenshot:saved', result)"));
});

test('the renderer offers notifications, Do Not Disturb and a notification centre on the clock', () => {
  assert.ok(shell.includes('window.silkNotify=notify;'));
  assert.ok(shell.includes('function notify(input){'));
  assert.ok(shell.includes('function setQuietMode(on){'));
  assert.ok(shell.includes('setQuietMode(!cfg.quietMode)'));
  assert.ok(shell.includes("document.body.insertAdjacentHTML('beforeend','<div id=\"toasts\" role=\"region\" aria-label=\"Notifications\"></div>');"));
  assert.ok(shell.includes("if(ddKey==='clock')paintNoticeCenter(dd);"));
  assert.ok(shell.includes('function ncEl(){const el=document.createElement(\'div\');el.className=\'nc\';paintNoticeCenter(el);return el}'));
  assert.ok(shell.includes("else if(k==='clock'){el=ncEl();markNoticesRead()}"));
  assert.ok(shell.includes("toast.querySelector('.ntoast-app').textContent=notice.app;"));
});

test('notifications fire from polling: battery, Wi-Fi changes and captive portals', () => {
  assert.ok(shell.includes('noticeBattery(r)'));
  assert.ok(shell.includes('noticeWifi(r)'));
  assert.ok(shell.includes('statusPoll(60000,checkPortal)'));
  assert.ok(shell.includes('function checkPortal(){'));
  assert.ok(shell.includes('void checkPortal();'));
  assert.ok(shell.includes("notify({app:'Power',title:'Battery Critically Low'"));
  assert.ok(shell.includes("notify({app:'Wi-Fi',title:'Wi-Fi Connected'"));
  assert.ok(shell.includes("notify({app:'Wi-Fi',title:'Wi-Fi Disconnected'"));
  assert.ok(shell.includes("title:'Sign In to This Network'"));
});

test('the screenshot overlay captures a region, saves it and stays inside the shell', () => {
  assert.ok(shell.includes('function captureShot(region){'));
  assert.ok(shell.includes("'<section id=\"shot\" hidden aria-label=\"Take a screenshot\">"));
  assert.ok(shell.includes('data-shot-save'));
  assert.ok(shell.includes('data-shot-cancel'));
  assert.ok(shell.includes('function shotRectFrom(x0,y0,x1,y1){'));
  assert.ok(shell.includes('window.silk.capture.onInit(openShotOverlay)'));
  assert.ok(shell.includes("if(window.silk?.capture)window.silk.capture.onSaved(shotInfo=>{"));
  assert.ok(shell.includes("if(k==='screenshot-full')return void captureShot(false);"));
  assert.ok(shell.includes("if(k==='screenshot-region')return void captureShot(true);"));
  assert.ok(shell.includes("['Take Screenshot',()=>captureShot(false),'Shift+Super+3']"));
  assert.ok(shell.includes("['Take Screenshot of Area…',()=>captureShot(true),'Shift+Super+4']"));
  assert.ok(shell.includes("app:'Screenshots',title:'Screenshot Saved'"));
});

test('Control Center gains the portal banner, hidden join form and sound pane', () => {
  assert.ok(shell.includes('data-portal-open'));
  assert.ok(shell.includes('data-portal-label'));
  assert.ok(shell.includes("el.querySelector('[data-portal-open]').onclick=openPortal;"));
  assert.ok(shell.includes('name="hidden"'));
  assert.ok(shell.includes('data-wifi-other><span class="cc-net-mark">${I.plus}</span>'));
  assert.ok(!shell.includes('${IC.plus}'));
  assert.ok(shell.includes("wifiForm.removeAttribute('hidden')"));
  assert.ok(shell.includes("wifiForm.setAttribute('hidden','')"));
  assert.ok(!shell.includes('wifiForm.hidden'));
  assert.ok(shell.includes("openJoinForm('',false,true)"));
  assert.ok(shell.includes("wifiForm.classList.toggle('manual',manual);"));
  assert.ok(css.includes('.cc-join.manual{display:grid;'));
  assert.ok(css.includes('.cc-join.manual[hidden]{display:none}'));
  assert.ok(shell.includes('data-radio-pane="sound"'));
  assert.ok(shell.includes('data-audio-list="output"'));
  assert.ok(shell.includes('data-audio-list="input"'));
  assert.ok(shell.includes('silk.audio.select'));
  assert.ok(shell.includes('data-audio-refresh'));
});

test('the pane slide, the media tile and Super+D keep the desktop behaving', () => {
  const open = shell.slice(shell.indexOf('const openRadioPane=name=>{'));
  const openBody = open.slice(0, open.indexOf('\n };'));
  /* Measuring switches transitions off, so it has to finish before the class that starts the slide. */
  assert.ok(openBody.indexOf('paneHeight(name)') < openBody.indexOf("el.classList.add('detail-open')"));
  assert.ok(openBody.includes('void el.offsetHeight'));
  assert.ok(!openBody.includes('fitPaneHeight()'));
  assert.ok(shell.includes('if(!paneSettled){paneRefit=true;return}'));
  assert.ok(shell.includes('setTimeout(settlePane,CC_PANE_MS);'));
  /* The height probe used to flatten the pane's own transform, which then became the start value of the
     opening transition, so only the way back animated. */
  assert.ok(css.includes('.cc.measuring:not(.detail-open) .cc-detail{transform:translateX(100%)}'));

  assert.ok(shell.includes('window.silkNowPlaying='));
  assert.ok(shell.includes('mediaTiles.push({el,load:loadMedia})'));
  assert.ok(shell.includes('statusPoll(5000,()=>{if(mediaTiles.length)refreshMediaTiles()})'));
  assert.ok(shell.includes("item?.via==='browser'"));
  assert.ok(shell.includes('const local=window.silkNowPlaying.best();'));
  const browser = read('app/apps/browser.js');
  assert.ok(browser.includes("v.addEventListener('media-started-playing',()=>reportMedia(t));"));
  assert.ok(browser.includes("v.addEventListener('media-paused',()=>reportMedia(t));"));
  assert.ok(browser.includes('window.silkNowPlaying?.forget(t.mid)'));

  const session = read('distro/config/includes.chroot/usr/local/bin/silkos-xsession');
  assert.ok(session.includes('for SHOW_DESKTOP_KEY in W-d C-A-d; do'));
  assert.ok(session.includes('<keybind key=\\"$SHOW_DESKTOP_KEY\\"'));
  assert.ok(shell.includes("key==='d'){e.preventDefault();showDesktop()}"));
  assert.ok(shell.includes('function showDesktop(){'));
  /* Only the gesture path put the class on the body, so the shortcut flipped a flag nothing was watching. */
  const settle = shell.slice(shell.indexOf('function settleDesktopExpose(open,progress){'));
  assert.ok(settle.slice(0, settle.indexOf('\n}')).includes("if(open)document.body.classList.add('desk-expose');"));
});

test('every icon referenced by the shell markup is defined in its icon set', () => {
  const iconKeys = name => {
    const start = shell.indexOf(`const ${name}={`);
    const end = shell.indexOf('};', start);
    assert.ok(start >= 0 && end > start, `${name} icon set is missing`);
    return new Set([...shell.slice(start, end).matchAll(/^\s*([A-Za-z]+):/gm)].map(match => match[1]));
  };
  for (const name of ['I', 'IC']) {
    const defined = iconKeys(name);
    const used = [...shell.matchAll(new RegExp(`\\$\\{${name}\\.([A-Za-z]+)\\}`, 'g'))].map(match => match[1]);
    assert.ok(used.length, `${name} icons are never referenced`);
    used.forEach(key => assert.ok(defined.has(key), `${name}.${key} is used but not defined`));
  }
});

test('Finder is wired into menus and keyboard commands', () => {
  assert.ok(shell.includes("['New Folder',()=>w._newFolder?.(),'Shift+Ctrl+N']"));
  assert.ok(shell.includes("['Move to Trash',()=>w._trashSelected?.()]"));
  assert.ok(shell.includes("['Rename',()=>w._renameSelected?.()]"));
  assert.ok(shell.includes("['Find',()=>w._focusSearch?.(),'Ctrl+F']"));
  assert.ok(shell.includes("['Refresh',()=>w._refresh?.(),'Ctrl+R']"));
  assert.ok(shell.includes("()=>w._toggleHiddenFiles?.()"));
  assert.ok(shell.includes("const finder=curApp==='finder'&&wins.finder;"));
  assert.ok(shell.includes("if(finder&&k==='f')return void finder._focusSearch?.();"));
  assert.ok(shell.includes("if(finder&&k==='r')return void finder._refresh?.();"));
  assert.ok(shell.includes("if(finder&&k==='w')return closeWindow('finder');"));
});

test('Finder lists fast and hydrates sizes and dates afterwards', () => {
  assert.ok(finder.includes('F.stat(chunk.map(name=>join(cur,name)))'));
  assert.ok(finder.includes("if(typeof F.stat!=='function')return;"));
  assert.ok(finder.includes('F.mkdir(cur,name)'));
  assert.ok(finder.includes('F.rename(join(cur,name),next)'));
  assert.ok(finder.includes('F.trash(names.map(name=>join(cur,name)))'));
  assert.ok(finder.includes('F.move(moving.map(name=>join(cur,name)),destination)'));
  assert.ok(finder.includes("locations={home,desktop:join(home,'Desktop'),documents:join(home,'Documents'),downloads:join(home,'Downloads'),pictures:join(home,'Pictures')}"));
  assert.ok(finder.includes("el._refresh=()=>go(cur,{push:false});"));
  assert.ok(finder.includes('el._setFinderLocation=()=>go(configuredLocation());'));
  assert.ok(finder.includes('el._goFolder=dir=>go(dir);'));
  assert.ok(finder.includes('el._newFolder=()=>beginCreate();'));
  assert.ok(finder.includes('el._trashSelected=()=>trashSelection();'));
  assert.ok(finder.includes('el._renameSelected='));
  assert.ok(finder.includes('el._focusSearch='));
  assert.ok(finder.includes('el._toggleHiddenFiles=()=>toggleHidden();'));
  assert.ok(finder.includes("data-sort=\"name\""));
  assert.ok(finder.includes("data-sort=\"size\""));
  assert.ok(finder.includes("data-sort=\"date\""));
});

test('the Store announces finished downloads where the desktop can still see them', () => {
  assert.ok(store.includes('const bark=window.silkNotify;'));
  assert.ok(store.includes("if(failed)bark({app:'App Store',title:'Store Action Failed',body:ended,icon:'🛍️'});"));
  assert.ok(store.includes("bark({app:'App Store',title:`${nameOf(id)} Installed`,body:'It is ready in your dock.',icon:'🛍️'});"));
  assert.ok(store.includes("bark({app:'App Store',title:'Updates Installed',body:'Your apps are up to date.',icon:'🛍️'});"));
});

test('Finder sort settings cover folders, name, date and size', () => {
  assert.ok(settings.includes("sel('finderSort','Sort items by',[['folders','Folders first · A to Z'],['name','Name · A to Z'],['name-desc','Name · Z to A'],['date','Date modified · newest first'],['size','Size · largest first']])"));
});

test('new CSS stays after the pinned material section and animates the new surfaces', () => {
  const material = css.indexOf('\n:root{--material-window:');
  assert.ok(material > 0, 'material section marker is missing');
  for (const selector of [
    '#toasts{',
    '.ntoast{',
    '.clock-badge{',
    '.nc-head{',
    '.nc-item{',
    '#shot{',
    '.shot-box{',
    '.shot-bar{',
    '.cc-portal{',
    '.cc-join{flex-wrap:wrap}',
    '.cc-hidden{',
    '.cc-audio.busy{',
    '.fnd{display:flex;height:100%;container-type:inline-size;container-name:finder}',
    '.fnd .fhead{',
    '.fit{display:grid;grid-template-columns:20px minmax(0,1fr) 76px 132px',
    '@container finder-main (max-width:540px)',
    '@container finder (max-width:470px)'
  ]) {
    const at = css.indexOf(selector);
    assert.ok(at > material, `${selector} must live after the material section`);
  }
  assert.ok(css.includes('@keyframes toastIn'));
  assert.ok(css.includes('@keyframes frowIn'));
  assert.ok(css.includes('body.reduce-motion *'));
});

test('Notes is laid out and worded like the macOS app rather than a dashboard', () => {
  const notes = read('app/apps/notes.js');
  /* The tool strip runs over all three panes, so it takes a grid row instead of a column slot. */
  assert.match(css, /\.notes-app\{grid-template-columns:180px 268px minmax\(0,1fr\);grid-template-rows:auto minmax\(0,1fr\)\}/);
  assert.match(css, /\.notes-app>\.notes-toolbar\{grid-column:1\/-1;grid-row:1\}/);
  assert.match(css, /\.notes-app>\.notes-editor-pane\{grid-row:2\}/);
  /* macOS reverses the selected row onto the accent; a tinted card does not read as Notes. */
  assert.match(css, /\.notes-item\.active\{background:var\(--accent\);color:#fff/);
  assert.match(css, /\.notes-meta\{justify-content:center/);
  assert.match(css, /\.notes-doc\{width:100%;max-width:780px;margin:0 auto\}/);
  assert.match(css, /\.notes-style-menu \.notes-format-select\{position:absolute;inset:0/);
  assert.ok(css.includes('@media(max-width:560px){.notes-app{grid-template-columns:minmax(96px,26%) minmax(0,1fr)}.notes-app>.notes-editor-pane{grid-column:2}'), 'the narrow layout keeps the document in the last track');
  /* Every glyph is drawn art now — the Unicode stand-ins are what made the app look generated. */
  assert.doesNotMatch(notes, /▤|▱|⌫|★|☆|☑|☷|＋/);
  assert.match(notes, /<span class="notes-folder-icon">\$\{uiIcon\(folder\.icon\)\}<\/span>/);
  assert.ok(notes.includes('const lines=plainText(note.body).trim().split(') && notes.includes(').filter(Boolean),head=note.title.trim()||lines[0]'), 'the list must read the note body line by line');
  assert.ok(notes.includes("(note.title.trim()?lines:lines.slice(1)).join(' ')"), 'the preview must drop the line the row already used as its title');
  assert.ok(notes.includes("weekday:'long'"), 'recent notes are labelled by weekday the way Notes does');
  assert.ok(notes.includes('metaTime.textContent=note?docLabel(note.updatedAt):'));
  assert.ok(notes.includes("at ${date.toLocaleTimeString"), 'the document caption reads "Month D, YYYY at h:mm"');
  assert.ok(notes.includes("pinButton.setAttribute('aria-pressed',String(pinned))"));
  assert.ok(notes.includes("body.querySelector('.notes-folder-actions [data-action=new-folder]').onclick=newFolder;"));
  assert.ok(notes.includes("if(action==='new-note'){createNote();return}"));
  assert.ok(notes.includes('const fresh=notes.find('), 'a blank note is reused instead of stacking empties');
  /* The empty state is a caption only, so the old create button it carried must not be queried. */
  assert.ok(!notes.includes("emptyEditor.querySelector"), 'no create button survives in the empty editor state');
});

test('app markup only asks for icons the shell actually draws', () => {
  const start = shell.indexOf('const UI_ICON={');
  const defined = new Set([...shell.slice(start, shell.indexOf('\n};', start)).matchAll(/^\s*([A-Za-z]+):/gm)].map(match => match[1]));
  assert.ok(defined.size > 20, 'the UI icon set was not found');
  for (const app of ['notes', 'browser', 'store']) {
    const used = [...read(`app/apps/${app}.js`).matchAll(/uiIcon\('([A-Za-z]+)'\)/g)].map(match => match[1]);
    assert.ok(used.length, `${app} draws no icons`);
    used.forEach(name => assert.ok(defined.has(name), `${app} asks for the missing icon ${name}`));
  }
  /* Settings names its icons inside a table, so they are read from the rows rather than a call site. */
  const navIcons = [...read('app/apps/settings.js').matchAll(/^\s*\['[a-z]+','[^']*','([A-Za-z]+)'/gm)].map(match => match[1]);
  assert.ok(navIcons.length > 8, 'the settings navigation table was not found');
  navIcons.forEach(name => assert.ok(defined.has(name), `settings asks for the missing icon ${name}`));
});

test('Control Center state changes animate, and settings and Launchpad update in place', () => {
  /* The join form lifts in and fades out instead of snapping between states. */
  assert.match(css, /@keyframes cc-join-in\{from\{opacity:0;transform:translateY\(-5px\)\}/);
  assert.match(css, /\.cc-join:not\(\[hidden\]\)\{animation:cc-join-in var\(--t-space\) var\(--ease\)\}/);
  assert.match(css, /\.cc-join\.closing\{opacity:0;transform:translateY\(-4px\)\}/);
  assert.ok(!/animation:cc-join-in[^}]*\bboth\b/.test(css), 'a filled entry animation would outrank the closing class and the form could never fade out');
  assert.ok(shell.includes('function closeJoinForm()'), 'the form needs a way to animate closed before it is hidden');
  assert.ok(shell.includes('joinTimer=setTimeout(()=>{'), 'the form stays in the layout until its fade finishes');
  assert.ok(shell.includes("wifiForm.querySelector('[data-wifi-cancel]').onclick=closeJoinForm"), 'Cancel uses the animated close');
  assert.ok(!shell.includes("wifiForm.setAttribute('hidden','');wifiPassword.value='';wifiSsid.value=''"), 'nothing may hide the form in the same frame it was showing');

  /* Every list fans in by row index, and a chip spins while its scan runs. */
  assert.match(css, /\.cc-pane-list>\.cc-net,\.cc-pane-body>\.cc-net-other\{animation:cc-row-in \.26s var\(--ease\) both;animation-delay:calc\(var\(--cc-i,0\)\*18ms\)\}/);
  assert.match(css, /@keyframes cc-spin\{to\{transform:rotate\(1turn\)\}\}/);
  assert.match(css, /\.cc-chip\.busy::before\{/);
  assert.ok(shell.includes("item.style.setProperty('--cc-i',String(index))"), 'network rows carry their stagger index');
  assert.ok(shell.includes("el.querySelector('[data-wifi-other]').style.setProperty('--cc-i',String(others.length))"), 'the join row follows the list');
  assert.ok((shell.match(/scanChip\.classList\.add\('busy'\)/g) || []).length === 2, 'both radio scans show their chip busy');
  assert.ok(shell.includes("refreshChip.classList.add('busy')"), 'the audio refresh shows the same state');
  assert.ok(shell.includes("item.classList.add('busy');item.disabled=true;"), 'a row being connected shows a spinner');
  assert.ok(!css.includes('border:1px dashed'), 'the dashed Join Other Network outline read as a generated placeholder');

  /* Chromium painted the rounded popover's backdrop blur as a ghost strip beside it, so the blur moved to
     a clipped pseudo-element. */
  assert.match(css, /\.cc\{background:transparent;-webkit-backdrop-filter:none;backdrop-filter:none\}/);
  assert.match(css, /\.cc::before\{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;background:var\(--glass\)/);
  assert.match(css, /body\.lite \.cc::before,body\.high-contrast \.cc::before\{background:var\(--win\);-webkit-backdrop-filter:none;backdrop-filter:none\}/);

  /* A setting is painted on its own control; redrawing the pane replayed its arrival animation. */
  assert.ok(settings.includes('const paint=()=>{'), 'settings needs in-place painting');
  assert.ok(settings.includes("save();applyCfg();if(d.a==='reset')draw(cp);else paint();"), 'only a reset redraws the pane');
  assert.ok(!/pane\.onchange[^}]*draw\(cp\)/.test(settings), 'changing a select must not rebuild the pane');
  assert.ok(settings.includes('class="data-count" data-list="hist"'), 'the history count updates in place');

  /* Rebuilding the Launchpad grid re-created every tile and re-decoded its icon. */
  assert.ok(shell.includes('if(sig===lpg.dataset.sig)return;'), 'an unchanged Launchpad must reuse its tiles');
  assert.ok(shell.includes("const sig=(q?'q:':'a:')+ordered.map(k=>k+(apps[k].photo?'p':'')+(apps[k].svg?'s':'')).join('|');"), 'the signature has to include the artwork');
});
