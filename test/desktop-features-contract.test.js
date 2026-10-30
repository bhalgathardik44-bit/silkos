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
