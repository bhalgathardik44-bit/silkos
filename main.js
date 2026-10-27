const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const IS_LINUX = process.platform === 'linux';
const run = (cmd, args, ms = 4000) => new Promise(res => execFile(cmd, args, { timeout: ms }, (e, out) => res(e ? null : String(out))));
app.on('web-contents-created', (_, c) => {
  if (c.getType() === 'webview') {
    c.setWindowOpenHandler(({ url }) => { c.hostWebContents.send('open-tab', url); return { action: 'deny' }; });
    c.on('before-input-event', (e, i) => {
      const k = i.key.toLowerCase();
      if (i.type === 'keyDown' && (i.control || i.meta) && !i.shift && !i.alt && ['t', 'w', 'l', 'r', 'k', 'd', ' '].includes(k)) {
        e.preventDefault(); c.hostWebContents.send('shortcut', k);
      }
    });
  }
});
ipcMain.handle('suggest', async (_, q) => {
  try {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 2000);
    const r = await fetch('https://suggestqueries.google.com/complete/search?client=firefox&q=' + encodeURIComponent(String(q).slice(0, 100)), { signal: c.signal });
    clearTimeout(t); const j = await r.json();
    return Array.isArray(j[1]) ? j[1].slice(0, 8) : [];
  } catch (e) { return []; }
});

/* ---- Real Linux system hooks (no-ops elsewhere; every call fails soft) ---- */
ipcMain.handle('sys:power', async (_, k) => {
  if (!IS_LINUX) return false;
  const m = { off: ['poweroff'], restart: ['reboot'], sleep: ['suspend'] }[k];
  if (!m) return false;
  return (await run('systemctl', m)) !== null;
});
ipcMain.handle('sys:battery', async () => {
  if (!IS_LINUX) return null;
  try {
    const dir = '/sys/class/power_supply';
    const bat = fs.readdirSync(dir).find(n => n.startsWith('BAT'));
    if (!bat) return null;
    const rd = f => fs.readFileSync(path.join(dir, bat, f), 'utf8').trim();
    return { level: Math.min(100, +rd('capacity')), charging: /^(Charging|Full)$/.test(rd('status')) };
  } catch (e) { return null; }
});
ipcMain.handle('sys:wifi', async () => {
  if (!IS_LINUX) return null;
  const out = await run('nmcli', ['-t', '-f', 'TYPE,STATE,CONNECTION', 'device']);
  if (!out) return null;
  const rows = out.trim().split('\n').map(l => l.split(':'));
  const up = rows.find(r => r[1] === 'connected');
  return { connected: !!up, type: up ? up[0] : null, name: up ? up[2] : null };
});
ipcMain.handle('sys:volume', async (_, v) => {
  if (!IS_LINUX) return null;
  if (typeof v === 'number') {
    const n = Math.max(0, Math.min(100, Math.round(v)));
    return (await run('wpctl', ['set-volume', '@DEFAULT_AUDIO_SINK@', n + '%'])) ?? (await run('amixer', ['-q', 'sset', 'Master', n + '%']));
  }
  const out = await run('wpctl', ['get-volume', '@DEFAULT_AUDIO_SINK@']);
  const m = out && out.match(/([\d.]+)/);
  return m ? Math.round(parseFloat(m[1]) * 100) : null;
});
ipcMain.handle('sys:brightness', async (_, v) => {
  if (!IS_LINUX) return null;
  if (typeof v === 'number') return (await run('brightnessctl', ['set', Math.max(5, Math.min(100, Math.round(v))) + '%'])) !== null;
  const out = await run('brightnessctl', ['-m']);
  const m = out && out.match(/(\d+)%/);
  return m ? +m[1] : null;
});
if (IS_LINUX) {
  app.commandLine.appendSwitch('enable-features', 'OverlayScrollbar');
  if (process.env.SILKOS_SOFTWARE === '1') { app.disableHardwareAcceleration(); app.commandLine.appendSwitch('disable-gpu'); }
}
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 1280, height: 800, show: false, backgroundColor: '#3b3b8f', autoHideMenuBar: true,
    webPreferences: { webviewTag: true, contextIsolation: true, preload: path.join(__dirname, 'preload.js') }
  });
  win.maximize();
  if (IS_LINUX && process.env.SILKOS_KIOSK === '1') win.setFullScreen(true);
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type === 'keyDown' && i.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
});
app.on('window-all-closed', () => app.quit());
