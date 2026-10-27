const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile, spawn } = require('child_process');
const IS_LINUX = process.platform === 'linux';
const run = (cmd, args, ms = 4000) => new Promise(res => execFile(cmd, args, { timeout: ms }, (e, out) => res(e ? null : String(out))));
app.on('web-contents-created', (_, c) => {
  if (c.getType() === 'webview') {
    c.setWindowOpenHandler(({ url }) => { c.hostWebContents.send('open-tab', url); return { action: 'deny' }; });
    c.on('before-input-event', (e, i) => {
      if (i.type === 'keyDown' && i.key === 'F4') { e.preventDefault(); c.hostWebContents.send('shortcut', 'lp'); return; }
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
/* ---- Store: Flathub apps via flatpak, installed per-user so no root is needed ---- */
const fp = (args, ms) => new Promise(res => execFile('flatpak', args, { timeout: ms, maxBuffer: 32 << 20 }, (e, out, err) => res({ ok: !e, out: String(out || ''), err: String(err || (e && e.message) || '') })));
const fpRows = s => s.split('\n').map(l => l.split('\t')).filter(r => r.length > 1 && r[0]);
const okId = id => /^[\w.-]+$/.test(String(id));
let fpReady = null;
const fpSetup = () => fpReady || (fpReady = (async () => {
  if (!IS_LINUX) return 'The Store works when SilkOS runs on Linux.';
  const r = await fp(['remote-add', '--user', '--if-not-exists', 'flathub', 'https://dl.flathub.org/repo/flathub.flatpakrepo'], 60000);
  if (!r.ok) { fpReady = null; return /ENOENT/.test(r.err) ? 'flatpak is not installed.' : 'Could not reach Flathub. Check your internet connection.'; }
  await fp(['update', '--user', '--appstream', 'flathub'], 180000);
  return '';
})());
ipcMain.handle('store:installed', async () => {
  const e = await fpSetup(); if (e) return { error: e };
  const r = await fp(['list', '--user', '--app', '--columns=application,name'], 15000);
  return { apps: fpRows(r.out).map(([id, name]) => ({ id, name })) };
});
ipcMain.handle('store:search', async (_, q) => {
  const e = await fpSetup(); if (e) return { error: e };
  const r = await fp(['search', '--user', '--columns=name,description,application', String(q).slice(0, 80)], 30000);
  const seen = new Set();
  return { apps: fpRows(r.out).filter(x => okId(x[2]) && !seen.has(x[2]) && seen.add(x[2])).slice(0, 40).map(([name, desc, id]) => ({ id, name, desc })) };
});
ipcMain.handle('store:install', async (_, id) => {
  if (!okId(id) || await fpSetup()) return { ok: false };
  const r = await fp(['install', '--user', '-y', '--noninteractive', 'flathub', id], 30 * 60000);
  return { ok: r.ok, error: r.ok ? '' : r.err.trim().split('\n').pop() };
});
ipcMain.handle('store:run', (_, id) => {
  if (!IS_LINUX || !okId(id)) return false;
  spawn('flatpak', ['run', id], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  return true;
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
