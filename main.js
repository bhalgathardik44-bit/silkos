const { app, BrowserWindow, Menu, ipcMain, shell, globalShortcut } = require('electron');
const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { promisify } = require('util');
const { execFile, spawn } = require('child_process');
const IS_LINUX = process.platform === 'linux';
const scrypt = promisify(crypto.scrypt);
const run = (cmd, args, ms = 4000) => new Promise(res => execFile(cmd, args, { timeout: ms }, (e, out) => res(e ? null : String(out))));
let mainWindow = null;
let screenLocked = false;
let lockFailures = 0;
let lockRetryAt = 0;
const globalWindowShortcuts = new Set();
const lockFile = () => path.join(app.getPath('userData'), 'screen-lock.json');
const readLock = async () => {
  try {
    const data = JSON.parse(await fs.promises.readFile(lockFile(), 'utf8'));
    if (data.version !== 1 || typeof data.salt !== 'string' || typeof data.hash !== 'string') throw new Error('Invalid screen lock data.');
    const salt = Buffer.from(data.salt, 'base64'), hash = Buffer.from(data.hash, 'base64');
    if (salt.length !== 16 || hash.length !== 64) throw new Error('Invalid screen lock data.');
    return { salt, hash };
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
};
const checkPassword = async (data, password) => {
  const expected = data.hash;
  const actual = await scrypt(password, data.salt, expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};
let previousCpuTotal = null;
let previousProcessCpu = new Map();
const cpuTimes = () => os.cpus().reduce((sum, cpu) => {
  const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
  return { total: sum.total + total, idle: sum.idle + cpu.times.idle };
}, { total: 0, idle: 0 });
const readLinuxCpuTimes = async () => {
  const line = (await fs.promises.readFile('/proc/stat', 'utf8')).split('\n', 1)[0];
  const times = line.trim().split(/\s+/).slice(1).map(Number);
  return {
    total: times.slice(0, 8).reduce((sum, time) => sum + time, 0),
    idle: (times[3] || 0) + (times[4] || 0)
  };
};
const readLinuxProcesses = async () => {
  const ids = (await fs.promises.readdir('/proc')).filter(id => /^\d+$/.test(id));
  const rows = await Promise.all(ids.map(async pid => {
    try {
      const [stat, status, comm] = await Promise.all([
        fs.promises.readFile(`/proc/${pid}/stat`, 'utf8'),
        fs.promises.readFile(`/proc/${pid}/status`, 'utf8'),
        fs.promises.readFile(`/proc/${pid}/comm`, 'utf8')
      ]);
      const fields = stat.slice(stat.lastIndexOf(')') + 1).trim().split(/\s+/);
      const rss = status.match(/^VmRSS:\s+(\d+)\s+kB$/m);
      return {
        pid: Number(pid),
        name: comm.trim() || pid,
        cpuTime: (Number(fields[11]) || 0) + (Number(fields[12]) || 0),
        memory: rss ? Number(rss[1]) * 1024 : 0
      };
    } catch {
      return null;
    }
  }));
  return rows.filter(Boolean);
};
const readWindowsProcesses = () => new Promise((resolve, reject) => {
  const script = "Get-Process | Select-Object @{Name='pid';Expression={$_.Id}},@{Name='name';Expression={$_.ProcessName}},@{Name='cpuTime';Expression={if ($null -eq $_.CPU) { 0 } else { $_.CPU * 1000 }}},@{Name='memory';Expression={$_.WorkingSet64}} | ConvertTo-Json -Compress";
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 10000, maxBuffer: 16 << 20 }, (error, stdout, stderr) => {
    if (error) return reject(new Error(String(stderr || error.message).trim()));
    try {
      const parsed = JSON.parse(stdout || '[]');
      resolve((Array.isArray(parsed) ? parsed : [parsed]).map(p => ({
        pid: Number(p.pid), name: String(p.name), cpuTime: Number(p.cpuTime) || 0, memory: Number(p.memory) || 0
      })));
    } catch (e) {
      reject(new Error(`Could not parse the process list: ${e.message}`));
    }
  });
});
const readMacProcesses = async () => {
  const out = await new Promise((resolve, reject) => execFile('ps', ['-axo', 'pid=,comm=,%cpu=,rss='], { timeout: 10000, maxBuffer: 16 << 20 }, (e, stdout, stderr) => {
    if (e) return reject(new Error(String(stderr || e.message).trim()));
    resolve(String(stdout));
  }));
  return out.split('\n').flatMap(line => {
    const m = line.match(/^\s*(\d+)\s+(.+?)\s+([\d.]+)\s+(\d+)\s*$/);
    return m ? [{ pid: Number(m[1]), name: m[2], cpu: Number(m[3]) || 0, memory: Number(m[4]) * 1024 }] : [];
  });
};
app.on('web-contents-created', (_, c) => {
  if (c.getType() === 'webview') {
    c.setWindowOpenHandler(({ url }) => { c.hostWebContents.send('open-tab', url); return { action: 'deny' }; });
    c.on('before-input-event', (e, i) => {
      if (screenLocked && ((i.type === 'keyDown' && i.alt && i.key === 'Tab') || (i.type === 'keyUp' && /^Alt/.test(i.key)))) { e.preventDefault(); return; }
      const accelerator = i.shift ? 'Alt+Shift+Tab' : 'Alt+Tab';
      if (i.type === 'keyDown' && i.alt && i.key === 'Tab' && !globalWindowShortcuts.has(accelerator)) { e.preventDefault(); c._silkWindowSwitchPending = true; c.hostWebContents.send('shortcut', i.shift ? 'alt-tab-reverse' : 'alt-tab'); return; }
      if (i.type === 'keyUp' && /^Alt/.test(i.key) && c._silkWindowSwitchPending) { c._silkWindowSwitchPending = false; c.hostWebContents.send('shortcut', 'alt-release'); return; }
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
ipcMain.handle('lock:status', async () => {
  try { return { ok: true, configured: !!(await readLock()) }; }
  catch (e) { return { ok: false, error: `Could not read the screen lock settings: ${e.message}` }; }
});
ipcMain.handle('lock:set-password', async (_, password, currentPassword) => {
  if (typeof password !== 'string' || !password.length || Buffer.byteLength(password, 'utf8') > 4096) {
    return { ok: false, error: 'Use a non-empty password of at most 4096 bytes.' };
  }
  try {
    const existing = await readLock();
    if (existing && (typeof currentPassword !== 'string' || !(await checkPassword(existing, currentPassword)))) {
      return { ok: false, error: 'The current screen-lock password is incorrect.' };
    }
    const salt = crypto.randomBytes(16);
    const hash = await scrypt(password, salt, 64);
    const file = lockFile(), temp = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    await fs.promises.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    try {
      await fs.promises.writeFile(temp, JSON.stringify({ version: 1, salt: salt.toString('base64'), hash: hash.toString('base64') }), { mode: 0o600 });
      await fs.promises.rename(temp, file);
    } finally {
      await fs.promises.unlink(temp).catch(e => { if (e.code !== 'ENOENT') throw e; });
    }
    return { ok: true };
  } catch (e) { return { ok: false, error: `Could not save the screen-lock password: ${e.message}` }; }
});
ipcMain.handle('lock:verify', async (_, password) => {
  const now = Date.now();
  if (now < lockRetryAt) return { ok: false, error: `Try again in ${Math.ceil((lockRetryAt - now) / 1000)} seconds.` };
  if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 4096) return { ok: true, valid: false };
  try {
    const data = await readLock();
    if (!data) return { ok: false, error: 'No screen-lock password has been set.' };
    const valid = await checkPassword(data, password);
    if (valid) { lockFailures = 0; lockRetryAt = 0; }
    else if (++lockFailures >= 5) { lockFailures = 0; lockRetryAt = Date.now() + 30000; }
    return { ok: true, valid };
  } catch (e) { return { ok: false, error: `Could not verify the screen-lock password: ${e.message}` }; }
});
ipcMain.handle('lock:window', (_, locked) => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  screenLocked = Boolean(locked);
  mainWindow.setAlwaysOnTop(screenLocked);
  return true;
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
ipcMain.handle('sys:wifi', async (_, enabled) => {
  if (!IS_LINUX) return null;
  if (typeof enabled === 'boolean' && await run('nmcli', ['radio', 'wifi', enabled ? 'on' : 'off']) === null) return null;
  const out = await run('nmcli', ['-t', '-f', 'TYPE,STATE,CONNECTION', 'device']);
  if (!out) return null;
  const rows = out.trim().split('\n').map(l => l.split(':'));
  const up = rows.find(r => r[1] === 'connected');
  const radio = await run('nmcli', ['radio', 'wifi']);
  return { available: radio !== null, enabled: radio ? radio.trim() === 'enabled' : false, connected: !!up, type: up ? up[0] : null, name: up ? up[2] : null };
});
ipcMain.handle('sys:bluetooth', async (_, enabled) => {
  if (!IS_LINUX) return null;
  if (typeof enabled === 'boolean' && await run('bluetoothctl', ['power', enabled ? 'on' : 'off']) === null) return null;
  const out = await run('bluetoothctl', ['show']);
  if (!out || !/Controller\s+[0-9A-F:]+/i.test(out)) return { available: false, powered: false };
  return { available: true, powered: /^\s*Powered:\s*yes/im.test(out) };
});
ipcMain.handle('sys:keyboard-brightness', async (_, value) => {
  if (!IS_LINUX) return null;
  const dir = '/sys/class/leds';
  let device;
  try {
    device = fs.readdirSync(dir).find(name => /kbd|keyboard/i.test(name) && fs.existsSync(path.join(dir, name, 'max_brightness')));
  } catch { return null; }
  if (!device) return null;
  if (typeof value === 'number') {
    const percent = Math.max(0, Math.min(100, Math.round(value)));
    if (await run('brightnessctl', ['--device', device, 'set', `${percent}%`]) === null) return null;
  }
  try {
    const base = path.join(dir, device);
    const max = Number(fs.readFileSync(path.join(base, 'max_brightness'), 'utf8').trim());
    const current = Number(fs.readFileSync(path.join(base, 'brightness'), 'utf8').trim());
    return max > 0 && Number.isFinite(current) ? { available: true, value: Math.round(current / max * 100) } : null;
  } catch { return null; }
});
ipcMain.handle('sys:media', async (_, action) => {
  if (!IS_LINUX || !['play-pause', 'previous', 'next'].includes(action)) return null;
  if (action && await run('playerctl', [action]) === null) return null;
  const [status, metadata] = await Promise.all([
    run('playerctl', ['status']),
    run('playerctl', ['metadata', '--format', '{{title}}\t{{artist}}'])
  ]);
  if (!status || !metadata) return { available: false };
  const [title, artist] = metadata.trim().split('\t');
  return { available: true, playing: status.trim() === 'Playing', title: title || 'Unknown track', artist: artist || '' };
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
ipcMain.handle('sys:resources', async () => {
  let cpus;
  try {
    cpus = process.platform === 'linux' ? await readLinuxCpuTimes() : cpuTimes();
  } catch (e) {
    return { error: `Could not read CPU usage: ${e.message}` };
  }
  const deltaTotal = previousCpuTotal === null ? 0 : Math.max(0, cpus.total - previousCpuTotal.total);
  const deltaIdle = previousCpuTotal === null ? 0 : Math.max(0, cpus.idle - previousCpuTotal.idle);
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  let processes;
  try {
    if (process.platform === 'linux') processes = await readLinuxProcesses();
    else if (process.platform === 'win32') processes = await readWindowsProcesses();
    else processes = await readMacProcesses();
  } catch (e) {
    return { error: `Could not read running processes: ${e.message}` };
  }
  previousCpuTotal = cpus;
  const currentProcessCpu = new Map();
  processes = processes.map(p => {
    let cpu = p.cpu || 0;
    if (Number.isFinite(p.cpuTime)) {
      const key = `${p.pid}:${p.name}`;
      const previous = previousProcessCpu.get(key);
      currentProcessCpu.set(key, p.cpuTime);
      cpu = previous !== undefined && deltaTotal > 0
        ? Math.max(0, (p.cpuTime - previous) / deltaTotal * 100)
        : 0;
    }
    return { pid: p.pid, name: p.name, cpu: Math.min(100, cpu), memory: p.memory };
  });
  previousProcessCpu = currentProcessCpu;
  let disk = null;
  try {
    const stats = fs.statfsSync(os.homedir());
    disk = { total: stats.blocks * stats.bsize, free: stats.bavail * stats.bsize };
  } catch {}
  return {
    cpu: { percent: deltaTotal ? Math.max(0, Math.min(100, (deltaTotal - deltaIdle) / deltaTotal * 100)) : 0, cores: os.cpus().length },
    memory: { total: totalMemory, free: freeMemory, used: totalMemory - freeMemory },
    disk,
    processes
  };
});
/* ---- Store: Flathub apps via flatpak, installed per-user so no root is needed ---- */
const fp = (args, ms) => new Promise(res => execFile('flatpak', args, { timeout: ms, maxBuffer: 32 << 20 }, (e, out, err) => res({ ok: !e, out: String(out || ''), err: String(err || (e && e.message) || '') })));
const fpRows = s => s.split('\n').map(l => l.split('\t')).filter(r => r.length > 1 && r[0]);
const okId = id => /^[\w.-]+$/.test(String(id));
const fpDetails = result => result.err.trim().split('\n').slice(-3).join('\n').slice(-600);
const fpFailure = (result, action) => {
  if (/ENOENT/.test(result.err)) return 'Flatpak is not installed.';
  const details = fpDetails(result);
  return `${action}${details ? `: ${details}` : '.'}`;
};
let fpReady = null;
const fpSetup = () => fpReady || (fpReady = (async () => {
  if (!IS_LINUX) return 'The Store works when SilkOS runs on Linux.';
  const r = await fp(['remote-add', '--user', '--if-not-exists', 'flathub', 'https://dl.flathub.org/repo/flathub.flatpakrepo'], 60000);
  if (!r.ok) { fpReady = null; return /ENOENT/.test(r.err) ? 'Flatpak is not installed.' : `Could not connect to Flathub: ${fpDetails(r) || 'check your internet connection.'}`; }
  const catalog = await fp(['update', '--user', '--appstream', 'flathub'], 180000);
  if (!catalog.ok) { fpReady = null; return `Could not load the Flathub app catalog: ${fpDetails(catalog) || 'check your internet connection.'}`; }
  return '';
})());
const fpIcon = id => {
  const b = path.join(os.homedir(), '.local/share/flatpak/exports/share/icons/hicolor');
  return ['128x128/apps/' + id + '.png', 'scalable/apps/' + id + '.svg', '64x64/apps/' + id + '.png'].map(f => path.join(b, f)).find(f => fs.existsSync(f)) || '';
};
ipcMain.handle('store:installed', async () => {
  if (!IS_LINUX) return { error: 'The Store works when SilkOS runs on Linux.' };
  const r = await fp(['list', '--user', '--app', '--columns=application,name'], 15000);
  if (!r.ok) return { error: fpFailure(r, 'Could not list installed apps') };
  return { apps: fpRows(r.out).map(([id, name]) => ({ id, name, icon: fpIcon(id) })) };
});
/* ---- Persistence: an empty disk becomes a live-boot "persistence" partition ---- */
ipcMain.handle('persist:status', async () => {
  if (!IS_LINUX) return {};
  let on = false; try { on = fs.readdirSync('/run/live/persistence').length > 0; } catch {}
  const r = await run('lsblk', ['-J', '-b', '-o', 'NAME,TYPE,SIZE,FSTYPE,LABEL,PTTYPE,RO']);
  if (r === null) return { error: 'Could not inspect storage devices.' };
  let devs;
  try { devs = JSON.parse(r).blockdevices; } catch (e) { return { error: `Could not read storage devices: ${e.message}` }; }
  if (!Array.isArray(devs)) return { error: 'Could not read storage devices.' };
  const all = devs.flatMap(d => [d, ...(d.children || [])]);
  const has = (all.find(d => d.label === 'persistence') || {}).name || '';
  const e = devs.find(d => d.type === 'disk' && !d.ro && !d.children && !d.fstype && !d.pttype && +d.size >= 8e9);
  return { on, has, disk: e ? { name: e.name, size: Math.round(e.size / 1e9) + ' GB' } : null };
});
ipcMain.handle('persist:setup', async (_, name) => {
  if (!IS_LINUX || !/^[a-z0-9]+$/.test(String(name))) return { ok: false, error: 'Invalid disk' };
  const r = await new Promise(res => execFile('sudo', ['-n', '/usr/local/bin/silkos-persist-setup', name], { timeout: 300000 }, (e, out, err) => res({ ok: !e, error: String(err || out || (e && e.message) || '').trim() })));
  return r;
});
ipcMain.handle('store:search', async (_, q) => {
  const e = await fpSetup(); if (e) return { error: e };
  const r = await fp(['search', '--user', '--columns=name,description,application', String(q).slice(0, 80)], 30000);
  if (!r.ok) return { error: fpFailure(r, 'Could not search Flathub') };
  const seen = new Set();
  return { apps: fpRows(r.out).filter(x => okId(x[2]) && !seen.has(x[2]) && seen.add(x[2])).slice(0, 40).map(([name, desc, id]) => ({ id, name, desc })) };
});
ipcMain.handle('store:install', async (_, id) => {
  if (!okId(id)) return { ok: false, error: 'Invalid app ID.' };
  const setupError = await fpSetup();
  if (setupError) return { ok: false, error: setupError };
  const r = await fp(['install', '--user', '-y', '--noninteractive', 'flathub', id], 30 * 60000);
  return { ok: r.ok, error: r.ok ? '' : fpFailure(r, 'Could not install app') };
});
ipcMain.handle('store:run', (_, id) => IS_LINUX && okId(id) ? launchExt('flatpak', ['run', '--env=GTK_CSD=0', id], os.homedir()) : { ok: false, error: 'Not available here' });
/* ---- Finder + Terminal ---- */
const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
ipcMain.handle('fs:home', () => {
  const h = os.homedir();
  for (const d of ['Desktop', 'Documents', 'Downloads']) try { fs.mkdirSync(path.join(h, d), { recursive: true }); } catch {}
  return h;
});
ipcMain.handle('fs:list', async (_, d, showHidden = false) => {
  try {
    const ents = await fs.promises.readdir(String(d), { withFileTypes: true });
    return { items: ents.filter(e => showHidden === true || !e.name.startsWith('.')).map(e => ({ name: e.name, dir: e.isDirectory() || (e.isSymbolicLink() && isDir(path.join(d, e.name))) })).sort((a, b) => b.dir - a.dir || a.name.localeCompare(b.name)) };
  } catch (e) { return { error: e.code === 'EACCES' ? 'You don\'t have permission to open this folder.' : 'Folder not found.' }; }
});
/* Launch a native app, log its output, and bring its window in front of SilkOS (which is fullscreen). */
const xWins = async () => new Set(((await run('wmctrl', ['-l'])) || '').split('\n').map(l => l.split(' ')[0]).filter(Boolean));
const cycleNativeWindows = async reverse => {
  const output = await run('wmctrl', ['-l']);
  const windows = (output || '').split('\n').map(line => line.match(/^(0x[\da-f]+)/i)?.[1]?.toLowerCase()).filter(Boolean);
  if (!windows.length) return;
  const activeOutput = await run('xprop', ['-root', '_NET_ACTIVE_WINDOW']);
  const active = activeOutput && activeOutput.match(/window id # (0x[\da-f]+)/i)?.[1].toLowerCase();
  const index = windows.indexOf(active);
  const next = windows[(index + (reverse ? -1 : 1) + windows.length) % windows.length];
  await run('wmctrl', ['-i', '-a', next]);
};
const launchExt = async (cmd, args, cwd) => {
  const before = await xWins(), log = path.join(os.homedir(), '.cache', 'silkos-apps.log');
  let fd = 'ignore'; try { fs.mkdirSync(path.dirname(log), { recursive: true }); fd = fs.openSync(log, 'a'); } catch {}
  let exited = null; const t0 = Date.now();
  const p = spawn(cmd, args, { detached: true, stdio: ['ignore', fd, fd], cwd });
  p.on('error', e => { exited = e.message; }).on('exit', c => { exited = exited || (c ? 'exit code ' + c : ''); });
  p.unref(); if (typeof fd === 'number') fs.closeSync(fd);
  while (Date.now() - t0 < 45000) {
    await new Promise(r => setTimeout(r, 700));
    const nw = [...await xWins()].filter(w => !before.has(w));
    if (nw.length) { run('wmctrl', ['-i', '-a', nw[nw.length - 1]]); return { ok: true }; }
    if (exited) { let t = ''; try { t = fs.readFileSync(log, 'utf8').trim().split('\n').slice(-4).join('\n'); } catch {} return { ok: false, error: (t || exited).slice(-600) }; }
    if (exited === '') return { ok: true };
  }
  return { ok: true };
};
const detach = (cmd, args, cwd) => { launchExt(cmd, args, cwd); };
ipcMain.handle('fs:open', (_, p) => {
  p = String(p);
  if (IS_LINUX && /\.exe$/i.test(p)) { detach('wine', [p], path.dirname(p)); return ''; }
  return shell.openPath(p);
});
ipcMain.handle('sys:terminal', () => {
  if (IS_LINUX) detach('xterm', ['-fa', 'DejaVu Sans Mono', '-fs', '11', '-bg', '#1e1e1e', '-fg', '#e6e6e6', '-geometry', '100x30', '-T', 'Terminal'], os.homedir());
});
const getLinuxWorkspaces = async () => {
  if (!IS_LINUX) return { available: false, workspaces: [], current: 0 };
  const output = await run('wmctrl', ['-d']);
  if (output === null) return { available: false, workspaces: [], current: 0, error: 'Could not read desktop workspaces.' };
  const workspaces = output.split('\n').map(line => {
    const match = line.match(/^\s*(\d+)\s+([*-])\s+/);
    if (!match) return null;
    const index = Number(match[1]);
    const named = line.match(/\bN\/A\s+(.+)$/);
    return { index, name: named?.[1]?.trim() || `Desktop ${index + 1}`, active: match[2] === '*' };
  }).filter(Boolean);
  return { available: workspaces.length > 0, workspaces, current: workspaces.find(workspace => workspace.active)?.index ?? 0 };
};
ipcMain.handle('sys:workspaces', getLinuxWorkspaces);
ipcMain.handle('sys:workspace:set', async (_, index) => {
  if (!IS_LINUX || !Number.isInteger(index) || index < 0 || index > 3) return { ok: false, error: 'Invalid desktop workspace.' };
  const result = await run('wmctrl', ['-s', String(index)]);
  return result === null ? { ok: false, error: 'Could not switch desktop workspace.' } : { ok: true, index };
});
if (IS_LINUX) {
  app.commandLine.appendSwitch('enable-features', 'OverlayScrollbar');
  if (process.env.SILKOS_SOFTWARE === '1') { app.disableHardwareAcceleration(); app.commandLine.appendSwitch('disable-gpu'); }
}
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const win = mainWindow = new BrowserWindow({
    width: 1280, height: 800, show: false, backgroundColor: '#3b3b8f', autoHideMenuBar: true,
    webPreferences: { webviewTag: true, contextIsolation: true, preload: path.join(__dirname, 'preload.js') }
  });
  win.setTitle('SilkOS');
  win.maximize();
  if (IS_LINUX && process.env.SILKOS_KIOSK === '1') win.setFullScreen(true);
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.once('ready-to-show', () => {
    win.show();
    if (IS_LINUX) {
      const keepShellVisible = async (attempt = 0) => {
        const result = await run('wmctrl', ['-r', 'SilkOS', '-b', 'add,sticky']);
        if (result === null && attempt < 8 && !win.isDestroyed()) setTimeout(() => keepShellVisible(attempt + 1), 250);
      };
      void keepShellVisible();
    }
  });
  let localWindowSwitchPending = false;
  let windowSwitchTimer = null;
  if (IS_LINUX && globalShortcut) {
    for (const [accelerator, shortcut] of [['Alt+Tab', 'alt-tab'], ['Alt+Shift+Tab', 'alt-tab-reverse'], ['Ctrl+Alt+Left', 'space-left'], ['Ctrl+Alt+Right', 'space-right'], ['F4', 'lp']]) {
      try {
        if (globalShortcut.register(accelerator, async () => {
          if (screenLocked) return;
          if (shortcut === 'lp') {
            win.restore();
            win.show();
            win.focus();
            win.webContents.send('shortcut', shortcut);
            return;
          }
          if (shortcut === 'space-left' || shortcut === 'space-right') {
            if (win.isFocused()) win.webContents.send('shortcut', shortcut);
            else {
              const spaces = await getLinuxWorkspaces();
              if (!spaces.available) return;
              const delta = shortcut === 'space-right' ? 1 : -1;
              const next = (spaces.current + delta + spaces.workspaces.length) % spaces.workspaces.length;
              await run('wmctrl', ['-s', String(next)]);
            }
            return;
          }
          if (win.isFocused()) {
            win.webContents.send('shortcut', shortcut);
            clearTimeout(windowSwitchTimer);
            windowSwitchTimer = setTimeout(() => {
              windowSwitchTimer = null;
              if (!screenLocked && win.isFocused()) win.webContents.send('shortcut', 'alt-release');
            }, 700);
          } else {
            void cycleNativeWindows(shortcut === 'alt-tab-reverse');
          }
        })) globalWindowShortcuts.add(accelerator);
        else console.error(`Could not register the ${accelerator} window-switching shortcut.`);
      } catch (error) {
        console.error(`Could not register the ${accelerator} window-switching shortcut:`, error);
      }
    }
    win.on('blur', () => {
      if (!windowSwitchTimer) return;
      clearTimeout(windowSwitchTimer);
      windowSwitchTimer = null;
      if (!screenLocked) win.webContents.send('shortcut', 'alt-release');
    });
  }
  win.webContents.on('before-input-event', (e, i) => {
    const accelerator = i.shift ? 'Alt+Shift+Tab' : 'Alt+Tab';
    if (i.type === 'keyDown' && i.alt && i.key === 'Tab' && !globalWindowShortcuts.has(accelerator)) {
      e.preventDefault();
      if (!screenLocked) { localWindowSwitchPending = true; win.webContents.send('shortcut', i.shift ? 'alt-tab-reverse' : 'alt-tab'); }
      return;
    }
    if (i.type === 'keyUp' && /^Alt/.test(i.key) && localWindowSwitchPending) {
      localWindowSwitchPending = false;
      if (!screenLocked) win.webContents.send('shortcut', 'alt-release');
      return;
    }
    if (screenLocked && i.type === 'keyDown' && (
      (i.alt && i.key === 'F4') ||
      ((i.control || i.meta) && ['q', 'w', 'r'].includes(i.key.toLowerCase())) ||
      (i.control && i.shift && i.key.toLowerCase() === 'i') ||
      i.key === 'F11'
    )) { e.preventDefault(); return; }
    if (i.type === 'keyDown' && i.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
});
app.on('window-all-closed', () => app.quit());
