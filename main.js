const { app, BrowserWindow, Menu, ipcMain, shell, globalShortcut, dialog } = require('electron');
const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { promisify } = require('util');
const { execFile, spawn } = require('child_process');
const { pathToFileURL } = require('url');
const { createToucheggGestureParser } = require('./touchpad-gestures');
const IS_LINUX = process.platform === 'linux';
const scrypt = promisify(crypto.scrypt);
const run = (cmd, args, ms = 4000) => new Promise(res => execFile(cmd, args, { timeout: ms }, (e, out) => res(e ? null : String(out))));
const runDetailed = (cmd, args, ms = 4000) => new Promise(resolve => execFile(cmd, args, { timeout: ms }, (error, out, stderr) => resolve({
  ok: !error,
  out: String(out || ''),
  stderr: String(stderr || '')
})));
const splitNmcliRow = line => {
  const fields = [];
  let value = '', escaped = false;
  for (const char of line) {
    if (escaped) { value += char; escaped = false; }
    else if (char === '\\') escaped = true;
    else if (char === ':') { fields.push(value); value = ''; }
    else value += char;
  }
  if (escaped) value += '\\';
  fields.push(value);
  return fields;
};
/* bluetoothctl exits 0 on failure, so outcomes must be read from its output, which always anchors errors at line start. */
const btFailure = out => String(out || '').split(/\r?\n/).map(line => line.trim())
  .find(line => /^(?:Failed\b|Error\b|No default controller\b)/i.test(line)) || '';
/* A loose hex class would match "No default controller available" via the "a" in "available". */
const btController = out => /Controller\s+(?:[0-9A-F]{2}:){5}[0-9A-F]{2}\b/i.test(String(out || ''));
const invokeWifiStatus = async () => {
  const out = await run('nmcli', ['-t', '--escape', 'yes', '-f', 'TYPE,STATE,CONNECTION', 'device', 'status']);
  if (out === null) return { available: false, error: 'NetworkManager is unavailable.' };
  const wifiDevices = out.trim().split(/\r?\n/).filter(Boolean).map(splitNmcliRow).filter(row => row[0] === 'wifi');
  const radio = await run('nmcli', ['radio', 'wifi']);
  if (radio === null) return { available: false, error: 'Could not read Wi-Fi radio state.' };
  const radioState = radio.trim().toLowerCase();
  if (radioState !== 'enabled' && radioState !== 'disabled') return { available: false, error: 'Could not read Wi-Fi radio state.' };
  const enabled = radioState === 'enabled';
  if (!wifiDevices.length) return { available: false, enabled, connected: false, error: 'No Wi-Fi adapter was detected.' };
  const connected = wifiDevices.find(row => /^connected(?:\s|$)/i.test(row[1] || ''));
  return { available: true, enabled, connected: !!connected, name: connected?.[2] || null };
};
let mainWindow = null;
let screenLocked = false;
let isQuitting = false;
let lockFailures = 0;
let lockRetryAt = 0;
const globalWindowShortcuts = new Set();
let touchpadGestureMonitor = null;
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
      if (i.type === 'keyDown' && (i.control || i.meta) && !i.shift && !i.alt && ['t', 'w', 'l', 'r', 'f', 'k', 'd', ' '].includes(k)) {
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
  if (screenLocked) {
    mainWindow.show();
    mainWindow.focus();
  }
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
  if (typeof enabled === 'boolean' && await run('nmcli', ['radio', 'wifi', enabled ? 'on' : 'off']) === null) {
    return { available: false, error: 'NetworkManager could not change Wi-Fi radio state.' };
  }
  return invokeWifiStatus();
});
ipcMain.handle('sys:wifi:networks', async () => {
  if (!IS_LINUX) return { available: false, error: 'Wi-Fi scanning is only available on Linux.' };
  const status = await invokeWifiStatus();
  if (!status.available) return status;
  if (!status.enabled) return { available: true, enabled: false, networks: [] };
  const result = await runDetailed('nmcli', ['-t', '--escape', 'yes', '-f', 'IN-USE,SSID,SIGNAL,SECURITY', 'device', 'wifi', 'list', '--rescan', 'yes'], 18000);
  if (!result.ok) return { available: false, error: result.stderr.trim().slice(-600) || 'Could not scan for Wi-Fi networks.' };
  const found = new Map();
  for (const line of result.out.trim().split(/\r?\n/).filter(Boolean)) {
    const fields = splitNmcliRow(line);
    if (fields.length < 4) continue;
    const [active, ssid, signal, security] = fields;
    if (!ssid) continue;
    const network = { ssid, signal: Number(signal) || 0, security: security && security !== '--' ? security : '', active: active.trim() === '*' };
    const existing = found.get(ssid);
    if (!existing || network.signal > existing.signal) found.set(ssid, network);
  }
  return { available: true, enabled: true, networks: [...found.values()].sort((a, b) => Number(b.active) - Number(a.active) || b.signal - a.signal).slice(0, 40) };
});
ipcMain.handle('sys:wifi:connect', async (_, ssid, password = '') => {
  if (!IS_LINUX) return { ok: false, error: 'Wi-Fi connections are only available on Linux.' };
  if (typeof ssid !== 'string' || typeof password !== 'string' || !ssid.trim() ||
    Buffer.byteLength(ssid, 'utf8') > 32 || Buffer.byteLength(password, 'utf8') > 128 ||
    ssid.includes('\0') || password.includes('\0')) {
    return { ok: false, error: 'Invalid Wi-Fi network or password.' };
  }
  const args = ['device', 'wifi', 'connect', ssid];
  if (password) args.push('password', password);
  const result = await runDetailed('nmcli', args, 30000);
  if (result.ok) return { ok: true };
  // execFile's fallback message echoes the command line, which contains the password.
  const detail = result.stderr.trim().slice(-600);
  return { ok: false, error: detail ? `Could not connect to the Wi-Fi network: ${detail}` : 'Could not connect to the Wi-Fi network. Check the password and try again.' };
});
ipcMain.handle('sys:bluetooth', async (_, enabled) => {
  if (!IS_LINUX) return null;
  if (typeof enabled === 'boolean') {
    const power = await runDetailed('bluetoothctl', ['power', enabled ? 'on' : 'off'], 8000);
    if (!power.ok || btFailure(power.out)) return { available: false, error: 'BlueZ could not change Bluetooth power state.' };
  }
  const out = await run('bluetoothctl', ['show']);
  if (!out || !btController(out)) return { available: false, powered: false, error: 'No Bluetooth controller was detected.' };
  return { available: true, powered: /^\s*Powered:\s*yes/im.test(out) };
});
ipcMain.handle('sys:bluetooth:devices', async () => {
  if (!IS_LINUX) return { available: false, error: 'Bluetooth is only available on Linux.' };
  const status = await run('bluetoothctl', ['show']);
  if (!status || !btController(status)) return { available: false, error: 'No Bluetooth controller was detected.' };
  if (!/^\s*Powered:\s*yes/im.test(status)) return { available: false, error: 'Turn Bluetooth on to scan for devices.' };
  const scan = await runDetailed('bluetoothctl', ['--timeout', '8', 'scan', 'on'], 12000);
  const scanIssue = scan.ok ? btFailure(scan.out) : (scan.stderr.trim() || 'Could not scan for Bluetooth devices.');
  if (scanIssue) return { available: false, error: scanIssue };
  const devices = await run('bluetoothctl', ['devices']);
  if (devices === null || btFailure(devices)) return { available: false, error: 'Could not list Bluetooth devices.' };
  const result = devices.split(/\r?\n/).map(line => {
    const match = line.match(/^Device\s+([0-9A-F:]{17})\s+(.+)$/i);
    return match ? { address: match[1], name: match[2] } : null;
  }).filter(Boolean);
  return { available: true, devices: result.slice(0, 40) };
});
ipcMain.handle('sys:bluetooth:connect', async (_, address) => {
  if (!IS_LINUX || typeof address !== 'string' || !/^[0-9A-F]{2}(?::[0-9A-F]{2}){5}$/i.test(address)) {
    return { ok: false, error: 'Invalid Bluetooth device.' };
  }
  const details = await run('bluetoothctl', ['info', address]);
  if (!details || btFailure(details) || /^Device\s+\S+\s+not available$/im.test(details) ||
    !details.toLowerCase().includes(address.toLowerCase())) {
    return { ok: false, error: 'Could not read Bluetooth device information.' };
  }
  if (!/^\s*Paired:\s*yes/im.test(details)) {
    const paired = await runDetailed('bluetoothctl', ['pair', address], 20000);
    const failure = paired.ok ? btFailure(paired.out) : (paired.stderr.trim() || 'Pairing failed. Check the device and try again.');
    if (failure) return { ok: false, error: failure };
  }
  const trusted = await runDetailed('bluetoothctl', ['trust', address], 10000);
  const trustFailure = trusted.ok ? btFailure(trusted.out) : (trusted.stderr.trim() || 'Could not trust the Bluetooth device.');
  if (trustFailure) return { ok: false, error: trustFailure };
  const connected = await runDetailed('bluetoothctl', ['connect', address], 20000);
  const connectFailure = connected.ok ? btFailure(connected.out) : (connected.stderr.trim() || 'Could not connect to the Bluetooth device.');
  return connectFailure ? { ok: false, error: connectFailure } : { ok: true };
});
ipcMain.handle('wallpaper:select', async () => {
  const options = {
    title: 'Choose a wallpaper',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }]
  };
  const result = mainWindow && !mainWindow.isDestroyed()
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths.length) return { cancelled: true };
  const source = result.filePaths[0];
  const extension = path.extname(source).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].includes(extension)) return { ok: false, error: 'Choose a supported image file.' };
  try {
    const stat = await fs.promises.stat(source);
    if (!stat.isFile() || stat.size > 50 * 1024 * 1024) return { ok: false, error: 'Wallpaper images must be files smaller than 50 MB.' };
    const directory = path.join(app.getPath('userData'), 'wallpapers');
    await fs.promises.mkdir(directory, { recursive: true });
    const destination = path.join(directory, `${crypto.randomUUID()}${extension}`);
    await fs.promises.copyFile(source, destination);
    return { ok: true, url: pathToFileURL(destination).href };
  } catch (error) {
    return { ok: false, error: `Could not save the selected wallpaper: ${error.message}` };
  }
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
/* flatpak paints its progress with \r-separated updates; read them as one line at a time. */
const fpProgressLine = line => {
  const text = line.replace(/\s+$/, '');
  const bar = text.match(/\[([^\]]*)\]/);
  const numeric = text.match(/(\d+(?:[.,]\d+)?)\s*%/);
  let percent = numeric ? parseFloat(numeric[1].replace(',', '.')) : null;
  if (percent === null && bar && bar[1].length >= 6) percent = bar[1].replace(/ /g, '').length / bar[1].length * 100;
  const label = text.replace(/\[[^\]]*\].*$/, '').replace(/[:\s|-]+$/, '').trim().slice(0, 70);
  if (!label && percent === null) return null;
  return { label, percent: percent === null ? null : Math.max(0, Math.min(100, Math.round(percent))) };
};
/* Run flatpak while streaming its progress to the Store window, so long downloads show a real bar. */
const fpStream = (sender, id, args, ms) => new Promise(resolve => {
  let child;
  try { child = spawn('flatpak', args, { stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { resolve({ ok: false, out: '', err: String((e && e.message) || e) }); return; }
  let out = '', err = '', tail = '', lastLabel = '', lastPercent = null, sentAt = 0, timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, ms);
  const report = line => {
    const step = fpProgressLine(line);
    if (!step) return;
    const changed = step.label !== lastLabel || step.percent !== lastPercent;
    /* Smooth out percentage ticks only; a new stage must always reach the UI. */
    if (!changed || (step.label === lastLabel && Date.now() - sentAt < 120)) return;
    lastLabel = step.label; lastPercent = step.percent; sentAt = Date.now();
    try { if (sender) sender.send('store:progress', { id, label: step.label, percent: step.percent }); } catch {}
  };
  const feed = (chunk, isError) => {
    const text = String(chunk);
    if (isError) err += text; else out += text;
    const lines = text.split(/[\r\n]/);
    lines[0] = tail + lines[0];
    tail = lines.pop() || '';
    lines.forEach(report);
  };
  child.stdout.on('data', chunk => feed(chunk, false));
  child.stderr.on('data', chunk => feed(chunk, true));
  child.on('error', e => { clearTimeout(timer); resolve({ ok: false, out, err: `${err}${(e && e.message) || e}` }); });
  child.on('close', code => {
    clearTimeout(timer);
    if (tail) report(tail);
    resolve({ ok: code === 0 && !timedOut, out, err: timedOut ? `${err}The operation timed out.` : err });
  });
});
const mapLimit = async (items, limit, fn) => {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i]);
  }));
  return out;
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
  const r = await fp(['list', '--user', '--app', '--columns=application,name,version'], 15000);
  if (!r.ok) return { error: fpFailure(r, 'Could not list installed apps') };
  return { apps: fpRows(r.out).filter(row => okId(row[0])).map(([id, name, version]) => ({ id, name, version, icon: fpIcon(id) })) };
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
/* Flathub's appstream endpoint answers for any app ID and carries the real icons, screenshots and
   release data. It is plain JSON over HTTPS, so it also works outside Linux for browsing. */
const FH_APPSTREAM = 'https://flathub.org/api/v2/appstream/';
const fhCache = new Map();
const FH_KEEP = 600000, FH_KEEP_ERROR = 15000;
ipcMain.handle('store:detail', async (_, id) => {
  if (!okId(id)) return { error: 'Invalid app ID.' };
  const hit = fhCache.get(id);
  if (hit && Date.now() - hit.at < (hit.data ? FH_KEEP : FH_KEEP_ERROR)) return hit.data ? { data: hit.data } : { error: hit.error };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const reply = await fetch(FH_APPSTREAM + encodeURIComponent(id), { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!reply.ok) throw new Error(`HTTP ${reply.status}`);
    const data = await reply.json();
    fhCache.set(id, { at: Date.now(), data });
    return { data };
  } catch {
    const error = 'Could not load the Flathub details for this app.';
    fhCache.set(id, { at: Date.now(), error });
    return { error };
  } finally {
    clearTimeout(timer);
  }
});
ipcMain.handle('store:install', async (event, id) => {
  if (!okId(id)) return { ok: false, error: 'Invalid app ID.' };
  const setupError = await fpSetup();
  if (setupError) return { ok: false, error: setupError };
  const r = await fpStream(event.sender, id, ['install', '--user', '-y', '--noninteractive', 'flathub', id], 30 * 60000);
  return { ok: r.ok, error: r.ok ? '' : fpFailure(r, 'Could not install app') };
});
ipcMain.handle('store:uninstall', async (event, id) => {
  if (!okId(id)) return { ok: false, error: 'Invalid app ID.' };
  const setupError = await fpSetup();
  if (setupError) return { ok: false, error: setupError };
  const r = await fpStream(event.sender, id, ['uninstall', '--user', '-y', '--noninteractive', id], 10 * 60000);
  return { ok: r.ok, error: r.ok ? '' : fpFailure(r, 'Could not uninstall app') };
});
/* Compare each installed app against the Flathub appstream catalog that is already on disk. */
ipcMain.handle('store:updates', async () => {
  const setupError = await fpSetup();
  if (setupError) return { error: setupError };
  const r = await fp(['list', '--user', '--app', '--columns=application,name,version'], 15000);
  if (!r.ok) return { error: fpFailure(r, 'Could not check for updates') };
  const apps = fpRows(r.out).filter(row => okId(row[0]));
  if (!apps.length) return { updates: [] };
  let failures = 0;
  const results = await mapLimit(apps, 4, async ([id, name, version]) => {
    const info = await fp(['remote-info', '--user', '--columns=version', 'flathub', id], 20000);
    if (!info.ok) { failures++; return null; }
    const to = (info.out || '').split('\n')[0].trim();
    if (!to || to === 'unknown' || to === version) return null;
    return { id, name, from: version || '', to };
  });
  if (failures === apps.length) return { error: 'Could not compare with the Flathub catalog.' };
  return { updates: results.filter(Boolean) };
});
ipcMain.handle('store:update-all', async (event, id) => {
  if (id !== undefined && id !== null && !okId(id)) return { ok: false, error: 'Invalid app ID.' };
  const setupError = await fpSetup();
  if (setupError) return { ok: false, error: setupError };
  const r = await fpStream(event.sender, id || '', ['update', '--user', '--noninteractive', '-y', ...(id ? [id] : [])], 30 * 60000);
  return { ok: r.ok, error: r.ok ? '' : fpFailure(r, id ? 'Could not update app' : 'Could not update apps') };
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
const startTouchpadGestureMonitor = win => {
  if (!IS_LINUX) return;
  const parser = createToucheggGestureParser(gesture => {
    if (!win.isDestroyed()) win.webContents.send('touchpad-gesture', gesture);
  });
  let child;
  try {
    child = spawn('dbus-monitor', [
      '--address', 'unix:abstract=touchegg',
      "type='signal',interface='io.github.joseexposito.Touchegg'"
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    console.error('Could not start Touchégg gesture monitoring:', error);
    return;
  }
  let diagnostic = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', data => parser.write(data));
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', data => { diagnostic = (diagnostic + data).slice(-2000); });
  child.once('error', error => console.error('Could not monitor Touchégg gestures:', error));
  child.once('close', (code, signal) => {
    touchpadGestureMonitor = null;
    if (code !== 0 && !isQuitting) {
      console.error(`Touchégg gesture monitor stopped (${signal || `exit ${code}`}): ${diagnostic.trim() || 'no diagnostic output'}`);
    }
  });
  touchpadGestureMonitor = child;
};
app.on('will-quit', () => {
  isQuitting = true;
  if (touchpadGestureMonitor && !touchpadGestureMonitor.killed) touchpadGestureMonitor.kill();
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
      startTouchpadGestureMonitor(win);
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
