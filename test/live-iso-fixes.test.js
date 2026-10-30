const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('natural scrolling and interface scaling stay behind the preload bridge', () => {
 const main = read('main.js'), preload = read('preload.js'), shell = read('app/shell.js'), settings = read('app/apps/settings.js');
 assert.match(main, /const setTrackpadProperty = async \(property, enabled, missing\) => \{/);
 assert.match(main, /ipcMain\.handle\('sys:trackpad:natural-scroll', \(_, enabled\) => setTrackpadProperty\('libinput Natural Scrolling Enabled', enabled,/);
 assert.match(main, /const DISPLAY_SCALES = \[1, 1\.25, 1\.5, 2\]/);
 assert.match(main, /const autoDisplayScale = ppi => ppi >= 200 \? 2 : ppi >= 170 \? 1\.5 : ppi >= 125 \? 1\.25 : 1/);
 assert.match(main, /mainWindow\.webContents\.setZoomFactor\(scale\)/);
 // The page is already zoomed, so Chromium must not scale it a second time from Xft.dpi.
 assert.match(main, /app\.commandLine\.appendSwitch\('force-device-scale-factor', '1'\)/);
 assert.match(preload, /display: \{ setScale: mode => ipcRenderer\.invoke\('sys:display:scale', mode\) \}/);
 assert.match(preload, /setNaturalScroll: enabled => ipcRenderer\.invoke\('sys:trackpad:natural-scroll', enabled\)/);
 assert.match(shell, /tapToClick:false,naturalScroll:true,displayScale:'auto'/);
 assert.match(shell, /const natural=!!cfg\.naturalScroll/);
 assert.match(shell, /silk\.trackpad\.setNaturalScroll\(natural\)/);
 assert.match(shell, /function applyDisplayScaleSetting\(mode\)/);
 assert.match(settings, /tg\('naturalScroll','Natural scrolling'\)/);
 assert.match(settings, /sel\('displayScale','Interface scale'/);
 assert.match(settings, /key==='displayScale'/);
});

test('the display scale helper keeps native windows and the menu bar in step', () => {
 const helper = read('distro/config/includes.chroot/usr/local/bin/silkos-display-scale');
 assert.match(helper, /Xft\.dpi/);
 assert.match(helper, /openbox --reconfigure/);
 assert.match(helper, /28 \* s/);
 const session = read('distro/config/includes.chroot/usr/local/bin/silkos-xsession');
 assert.match(session, /display-scale\.mode/);
 assert.match(session, /silkos-display-scale/);
 assert.match(read('distro/config/hooks/normal/0100-silkos.hook.chroot'), /silkos-display-scale/);
});

test('gesture input is filtered while commit and speed still read the raw travel', () => {
 const shell = read('app/shell.js');
 assert.match(shell, /const GESTURE_SMOOTH_MS=60/);
 assert.match(shell, /frame\.value\+=\(target-frame\.value\)\*\(1-Math\.exp\(-delta\/GESTURE_SMOOTH_MS\)\)/);
 assert.match(shell, /if\(Math\.abs\(target-frame\.value\)<\.0015\)frame\.value=target/);
 assert.match(shell, /if\(cfg\.reduceMotion\)\{cancelGestureSmoothing\(state\);render\(Math\.max\(0,Math\.min\(1,state\.progress\|\|0\)\)\);return\}/);
 assert.match(shell, /trackGestureSpeed\(state,progress\);/);
 assert.match(shell, /const completed=commit&&shouldCommit\(state\)/);
 // The settle transition starts from the last painted frame instead of restarting the filter.
 assert.match(shell, /cancelGestureSmoothing\(state\);[\s\S]{0,80}paintSpaceGesture\(state,completed\?1:0\)/);
 assert.match(shell, /smoothGesture\(launchpadGesture,paintLaunchpadGesture\)/);
 assert.match(shell, /cancelGestureSmoothing\(launchpadGesture\)/);
});

test('a desktop swipe moves each window and its wallpaper glass as one layer', () => {
 const css = read('app/desktop.css'), shell = read('app/shell.js');
 assert.match(css, /\.win\.space-swipe\{transform:translate3d\(var\(--space-swipe-x\),0,0\);transition:none!important;pointer-events:none;will-change:transform;background-attachment:scroll!important;background-size:var\(--vibe-w,120vw\) var\(--vibe-h,120vh\)!important;background-position:var\(--vibe-x,0px\) var\(--vibe-y,0px\)!important;backface-visibility:hidden\}/);
 assert.match(shell, /function prepareSwipeVibrancy\(win\)/);
 assert.match(shell, /const cover=Math\.max\(viewWidth\/wallpaperPhoto\.w,viewHeight\/wallpaperPhoto\.h\)/);
 assert.match(shell, /win\.style\.setProperty\('--vibe-x',`\$\{\(viewWidth-width\)\/2-win\.offsetLeft\}px`\)/);
 assert.match(shell, /\['--vibe-w','--vibe-h','--vibe-x','--vibe-y'\]\.forEach\(property=>win\.style\.removeProperty\(property\)\)/);
 assert.match(shell, /probeWallpaper\(cfg\.wallpaperImage\)/);
 assert.match(shell, /win\.classList\.add\('space-swipe'\);prepareSwipeVibrancy\(win\)/);
});

test('right-click opens a menu on every shell and app surface', () => {
 const shell = read('app/shell.js'), finder = read('app/apps/finder.js'), browser = read('app/apps/browser.js'), css = read('app/desktop.css');
 assert.match(shell, /function showContextMenu\(items,x,y,alignRight=false\)\{/);
 assert.match(shell, /ddKey='ctx'/);
 assert.match(shell, /document\.addEventListener\('contextmenu',e=>\{/);
 assert.match(shell, /if\(icon\)\{showContextMenu\(dockIconMenu\(icon\),x,y\);return\}/);
 assert.match(shell, /if\(e\.target\.closest\('#dockwrap'\)\)\{showContextMenu\(dockMenu\(\),x,y\);return\}/);
 assert.match(shell, /if\(e\.target\.closest\('#lp'\)\)\{showContextMenu\(launchpadMenu/);
 assert.match(shell, /if\(win\)\{showContextMenu\(windowMenu\(win\),x,y\);return\}/);
 assert.match(shell, /'Move to '\+name/);
 assert.match(shell, /'Position: Bottom','bottom'/);
 // A right-click must not start a drag or a resize; the menu is the whole action.
 assert.match(shell, /if\(e\.button!==0\|\|e\.target\.closest\('\.dot,button,input'\)\|\|el\.dataset\.max\|\|el\.dataset\.fullscreen\)return/);
 assert.match(shell, /h\.onpointerdown=ev=>\{if\(ev\.button!==0\|\|el\.dataset\.max\|\|el\.dataset\.fullscreen\)return/);
 assert.match(finder, /ls\.addEventListener\('contextmenu',e=>\{/);
 assert.match(finder, /sb\.addEventListener\('contextmenu',e=>\{/);
 assert.match(browser, /stabs\.addEventListener\('contextmenu',e=>\{/);
 assert.match(browser, /q\('\.addr'\)\.addEventListener\('contextmenu'/);
 assert.match(browser, /ov\.addEventListener\('contextmenu'/);
 assert.match(browser, /v\.addEventListener\('context-menu',e=>\{/);
 assert.match(browser, /showContextMenu\(items,rect\.left\+\(p\.x\|\|0\),rect\.top\+\(p\.y\|\|0\)\)/);
 assert.match(css, /\.dd\{position:fixed;z-index:9800/);
});

test('the tab overview paints cached previews and a title instead of blank space', () => {
 const browser = read('app/apps/browser.js'), css = read('app/desktop.css');
 assert.match(browser, /function cacheThumb\(t\)\{/);
 assert.match(browser, /t\.thumb=url;return url/);
 assert.match(browser, /if\(cur===t\)\{prog\(0\);navState\(\);if\(fin\.classList\.contains\('on'\)\)findStep\(\);cacheThumb\(t\)\}/);
 assert.match(browser, /if\(t\.v\)requestAnimationFrame\(\(\)=>\{if\(cur===t&&!t\.loading\)cacheThumb\(t\)\}\)/);
 assert.match(browser, /class="ov-fallback"/);
 assert.match(browser, /cacheThumb\(active\)\.then\(url=>\{/);
 assert.match(css, /\.thumb img\{width:100%;height:100%;object-fit:cover;object-position:top center;display:block\}/);
 assert.match(css, /\.thumb \.ov-fallback\{[^}]*text-overflow:ellipsis/);
});

test('a Store action names its stage and leaves a failure on screen', () => {
 const store = read('app/apps/store.js');
 assert.match(store, /const say=\(text,\{sticky=false,bad=false\}=\{\}\)=>\{/);
 assert.match(store, /const starting=act==='install'\?'Preparing':act==='uninstall'\?'Removing':act==='run'\?'Opening':'Updating'/);
 assert.match(store, /say\(`\$\{starting\} \$\{nameOf\(id\)\}…`,\{sticky:true\}\)/);
 assert.match(store, /failed=true;ended=error\.message/);
 assert.match(store, /if\(!failed\)say\(ended\)/);
 assert.match(read('app/desktop.css'), /\.store-status\.bad\{color:#ff453a;opacity:1;font-weight:600\}/);
});

test('the live image lists firmware and microcode for real hardware', () => {
 const packages = read('distro/config/package-lists/silkos.list.chroot');
 for (const name of ['firmware-linux', 'firmware-iwlwifi', 'firmware-realtek', 'firmware-atheros', 'firmware-brcm80211', 'firmware-mediatek', 'firmware-intel-graphics', 'firmware-sof-signed', 'intel-microcode', 'amd64-microcode']) {
  assert.match(packages, new RegExp(`^${name}$`, 'm'), name);
 }
 // The archive area that carries them is already enabled; --apt-recommends is off, so the list above is the only source.
 assert.match(read('distro/auto/config'), /--archive-areas "main contrib non-free-firmware"/);
});
