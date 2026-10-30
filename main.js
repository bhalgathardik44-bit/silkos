const { app, BrowserWindow, Menu, ipcMain, shell, globalShortcut, dialog, desktopCapturer, screen, clipboard } = require('electron');
const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { promisify } = require('util');
const { execFile, spawn } = require('child_process');
const { pathToFileURL } = require('url');
const { createLibinputGestureParser, LIBINPUT_COMMANDS } = require('./touchpad-gestures');
const { createAppMenuStream, menuBar, mergeSubmenu } = require('./native-menu');
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
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 2000);
  try {
    const r = await fetch('https://suggestqueries.google.com/complete/search?client=firefox&q=' + encodeURIComponent(String(q).slice(0, 100)), { signal: c.signal });
    clearTimeout(t); const j = await r.json();
    return Array.isArray(j[1]) ? j[1].slice(0, 8) : [];
  } catch (e) { return []; }
  finally { clearTimeout(t); }
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
ipcMain.handle('sys:wifi:connect', async (_, ssid, password = '', hidden = false) => {
  if (!IS_LINUX) return { ok: false, error: 'Wi-Fi connections are only available on Linux.' };
  if (typeof ssid !== 'string' || typeof password !== 'string' || !ssid.trim() ||
    Buffer.byteLength(ssid, 'utf8') > 32 || Buffer.byteLength(password, 'utf8') > 128 ||
    ssid.includes('\0') || password.includes('\0')) {
    return { ok: false, error: 'Invalid Wi-Fi network or password.' };
  }
  const args = ['device', 'wifi', 'connect', ssid];
  if (password) args.push('password', password);
  /* A hidden network has no scan entry to join by name, so nmcli has to join it from the probe request. */
  if (hidden === true) args.push('hidden', 'yes');
  const result = await runDetailed('nmcli', args, 30000);
  if (result.ok) return { ok: true };
  // execFile's fallback message echoes the command line, which contains the password.
  const detail = result.stderr.trim().slice(-600);
  return { ok: false, error: detail ? `Could not connect to the Wi-Fi network: ${detail}` : 'Could not connect to the Wi-Fi network. Check the password and try again.' };
});
/* NetworkManager runs its own captive-portal probe, so the shell only has to read the verdict and hand
   back the gateway that serves the sign-in page. */
ipcMain.handle('sys:portal:check', async () => {
  if (!IS_LINUX) return { available: false };
  const current = await run('nmcli', ['-t', '-f', 'CONNECTIVITY', 'general']);
  if (current === null) return { available: false, error: 'NetworkManager is unavailable.' };
  let state = current.trim().toLowerCase();
  if (state !== 'full' && state !== 'portal') {
    const checked = await run('nmcli', ['networking', 'connectivity', 'check'], 15000);
    if (checked) state = checked.trim().toLowerCase();
  }
  if (state !== 'portal') return { available: true, portal: false, state };
  const route = await run('ip', ['-4', 'route', 'show', 'default']);
  const gateway = route && route.match(/default via (\S+)/)?.[1];
  return { available: true, portal: true, state, url: gateway ? `http://${gateway}/` : '' };
});
ipcMain.handle('sys:bluetooth', async (_, enabled) => {
  if (!IS_LINUX) return null;
  if (typeof enabled === 'boolean') {
    // A soft-blocked radio (common after boot) refuses to power on; unblocking is harmless if it is not blocked.
    if (enabled) await run('rfkill', ['unblock', 'bluetooth']);
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
/* ---- Audio routing ---- */
/* pactl speaks for both PipeWire's PulseAudio server and plain PulseAudio, and its JSON output keeps
   descriptions with commas and brackets intact where `list short` would split them. */
const pactlJson = async args => {
  const result = await runDetailed('pactl', ['-f', 'json', ...args], 6000);
  if (!result.ok) return null;
  try {
    const parsed = JSON.parse(result.out || '[]');
    return Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
};
const pactlVolume = item => {
  const levels = Object.values(item?.volume || {}).map(channel => parseFloat(channel?.value_percent) || 0);
  return levels.length ? Math.round(levels.reduce((sum, level) => sum + level, 0) / levels.length) : 0;
};
const audioDevice = (item, active) => ({
  name: String(item.name || ''),
  description: String(item.description || item.name || ''),
  volume: pactlVolume(item),
  muted: item.mute === true,
  active
});
const audioEndpoints = async kind => {
  const isOutput = kind === 'output';
  const [devices, info] = await Promise.all([
    pactlJson(['list', isOutput ? 'sinks' : 'sources']),
    run('pactl', ['info'])
  ]);
  if (!devices || info === null) return null;
  const defaults = info.match(new RegExp(`^Default ${isOutput ? 'Sink' : 'Source'}:\\s*(.+)$`, 'm'))?.[1]?.trim() || '';
  const usable = devices.filter(item => item?.name && !String(item.name).includes('.monitor'));
  return {
    devices: usable.map(item => audioDevice(item, item.name === defaults)),
    defaultName: defaults,
    names: usable.map(item => item.name)
  };
};
ipcMain.handle('sys:audio:devices', async () => {
  if (!IS_LINUX) return { available: false };
  const [outputs, inputs] = await Promise.all([audioEndpoints('output'), audioEndpoints('input')]);
  if (!outputs || !inputs) return { available: false, error: 'Audio routing requires PipeWire or PulseAudio.' };
  return {
    available: true,
    outputs: outputs.devices,
    inputs: inputs.devices,
    defaultOutput: outputs.defaultName,
    defaultInput: inputs.defaultName
  };
});
ipcMain.handle('sys:audio:select', async (_, kind, name) => {
  const isOutput = kind === 'output';
  if (!IS_LINUX || (kind !== 'output' && kind !== 'input') || typeof name !== 'string' ||
    !name || name.length > 256 || /[\0\r\n]/.test(name)) {
    return { ok: false, error: 'Invalid audio device.' };
  }
  const endpoints = await audioEndpoints(kind);
  if (!endpoints || !endpoints.names.includes(name)) return { ok: false, error: 'That audio device is no longer available.' };
  const previous = endpoints.defaultName;
  const changed = await runDetailed('pactl', [isOutput ? 'set-default-sink' : 'set-default-source', name], 6000);
  if (!changed.ok) return { ok: false, error: isOutput ? 'Could not switch the audio output.' : 'Could not switch the audio input.' };
  /* PulseAudio leaves every existing stream on the device it started on, so after the default moves the
     streams that were on the old default follow it, while a stream pinned elsewhere stays there. */
  if (previous && previous !== name) {
    const table = await pactlJson(['list', isOutput ? 'sinks' : 'sources']);
    const oldIndex = table?.find(item => item?.name === previous)?.index;
    if (oldIndex !== undefined) {
      const streams = (await run('pactl', ['list', 'short', isOutput ? 'sink-inputs' : 'source-outputs'])) || '';
      for (const line of streams.split('\n')) {
        const columns = line.split('\t');
        if (columns.length > 2 && Number(columns[1]) === Number(oldIndex)) {
          await run('pactl', [isOutput ? 'move-sink-input' : 'move-source-output', columns[0], name], 6000);
        }
      }
    }
  }
  return { ok: true, defaultName: name };
});
/* Screens with no controllable backlight (external monitors, many VMs) are dimmed through the display's
   gamma ramp. Unlike an overlay inside the window, the ramp is applied to everything on screen, pointer included. */
let gammaBrightness = null;
const setGammaBrightness = async percent => {
  const query = await run('xrandr', ['--query']);
  const outputs = query ? [...query.matchAll(/^(\S+) connected/gm)].map(match => match[1]) : [];
  if (!outputs.length) return false;
  const level = Math.max(0.15, 1 - (100 - percent) / 100 * 0.85).toFixed(2);
  let applied = false;
  for (const output of outputs) {
    if (await run('xrandr', ['--output', output, '--brightness', level]) !== null) applied = true;
  }
  if (applied) gammaBrightness = percent;
  return applied;
};
ipcMain.handle('sys:brightness', async (_, v) => {
  if (!IS_LINUX) return null;
  if (typeof v === 'number') {
    const percent = Math.max(5, Math.min(100, Math.round(v)));
    if (await run('brightnessctl', ['-c', 'backlight', 'set', percent + '%']) !== null) {
      // The backlight now carries the dimming, so clear any gamma left from an earlier fallback.
      if (gammaBrightness !== null && gammaBrightness < 100) await setGammaBrightness(100);
      gammaBrightness = null;
      return true;
    }
    return setGammaBrightness(percent);
  }
  const out = await run('brightnessctl', ['-c', 'backlight', '-m']);
  const m = out && out.match(/(\d+)%/);
  return m ? +m[1] : gammaBrightness;
});
/* libinput exposes both settings as device properties, so one xinput write per device that advertises it
   reaches external trackpads and built-in ones alike. */
const setTrackpadProperty = async (property, enabled, missing) => {
  if (!IS_LINUX || typeof enabled !== 'boolean') return { available: false, error: 'Trackpad settings are only available on Linux.' };
  const listing = await run('xinput', ['list', '--id-only']);
  if (listing === null) return { available: false, error: 'xinput is not available.' };
  let touchpads = 0;
  for (const id of listing.split(/\s+/).filter(value => /^\d+$/.test(value))) {
    const props = await run('xinput', ['list-props', id]);
    if (!props || !new RegExp(`${property} \\(\\d+\\)`).test(props)) continue;
    if (await run('xinput', ['set-prop', id, property, enabled ? '1' : '0']) !== null) touchpads += 1;
  }
  return touchpads ? { available: true, enabled } : { available: false, error: missing };
};
ipcMain.handle('sys:trackpad:tap-to-click', (_, enabled) => setTrackpadProperty('libinput Tapping Enabled', enabled, 'No touchpad that supports tapping was found.'));
ipcMain.handle('sys:trackpad:natural-scroll', (_, enabled) => setTrackpadProperty('libinput Natural Scrolling Enabled', enabled, 'No touchpad that supports natural scrolling was found.'));
/* ---- Display scale ----
   The shell is one page, so a CSS zoom resizes all of it. Native toolkits read Xft.dpi instead, which
   silkos-display-scale updates together with the Openbox margin that keeps windows below the menu bar. */
const DISPLAY_SCALES = [1, 1.25, 1.5, 2];
const displayConf = () => path.join(os.homedir(), '.config', 'silkos');
const displayModeFile = () => path.join(displayConf(), 'display-scale.mode');
/* A 13" 2K panel is about 226 PPI, so automatic lands on 200% there and stays at 100% on a normal monitor. */
const autoDisplayScale = ppi => ppi >= 200 ? 2 : ppi >= 170 ? 1.5 : ppi >= 125 ? 1.25 : 1;
const panelPpi = async () => {
  const out = await run('xrandr', ['--query']);
  if (!out) return 0;
  for (const line of out.split(/\r?\n/)) {
    if (!/ connected /.test(line)) continue;
    const size = line.match(/(\d+)x(\d+)\+(-?\d+)\+(-?\d+)/);
    const mm = line.match(/(\d+)mm\s+x\s+(\d+)mm/);
    if (size && mm) return Number(size[1]) * 25.4 / Number(mm[1]);
  }
  return 0;
};
const resolveDisplayScale = async mode => {
  if (mode !== 'auto') return DISPLAY_SCALES.includes(Number(mode)) ? Number(mode) : 1;
  const ppi = await panelPpi();
  return ppi ? autoDisplayScale(ppi) : 1;
};
const applyDisplayScale = async mode => {
  const scale = await resolveDisplayScale(mode);
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.setZoomFactor(scale);
  try {
    await fs.promises.mkdir(displayConf(), { recursive: true });
    await fs.promises.writeFile(path.join(displayConf(), 'display-scale'), String(scale));
    await fs.promises.writeFile(displayModeFile(), mode === 'auto' ? 'auto' : String(scale));
  } catch (error) { console.error('Could not save the display scale:', error); }
  if (IS_LINUX) void run('silkos-display-scale', [String(scale)], 8000);
  return { ok: true, mode, scale };
};
ipcMain.handle('sys:display:scale', async (_, requested) => {
  if (!IS_LINUX) return { available: false, error: 'Display scaling is available when SilkOS runs on Linux.' };
  const mode = requested === 'auto' ? 'auto' : Number(requested);
  if (mode !== 'auto' && !DISPLAY_SCALES.includes(mode)) return { available: true, ok: false, error: 'That interface scale is not supported.' };
  return { available: true, ...(await applyDisplayScale(mode)) };
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
let fpRemoteReady = null;
/* Adding the flathub remote is a local config check, so it is what every Store action may wait for.
   The appstream catalog below is a multi-megabyte download, and flatpak install fetches the pieces it
   needs by itself while streaming progress, so nothing may block on it before the download starts. */
const fpRemote = () => fpRemoteReady || (fpRemoteReady = (async () => {
  if (!IS_LINUX) return 'The Store works when SilkOS runs on Linux.';
  const r = await fp(['remote-add', '--user', '--if-not-exists', 'flathub', 'https://dl.flathub.org/repo/flathub.flatpakrepo'], 60000);
  if (!r.ok) { fpRemoteReady = null; return /ENOENT/.test(r.err) ? 'Flatpak is not installed.' : `Could not connect to Flathub: ${fpDetails(r) || 'check your internet connection.'}`; }
  return '';
})());
let fpCatalogReady = null;
/* Only flatpak search and remote-info read the catalog from disk, so only they wait for this. */
const fpCatalog = () => fpCatalogReady || (fpCatalogReady = (async () => {
  const remoteError = await fpRemote();
  if (remoteError) return remoteError;
  const catalog = await fp(['update', '--user', '--appstream', 'flathub'], 180000);
  if (!catalog.ok) { fpCatalogReady = null; return `Could not load the Flathub app catalog: ${fpDetails(catalog) || 'check your internet connection.'}`; }
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
/* Flathub's search endpoint answers in one request with the name, summary and real icon for every
   hit, so the Store can paint a full result list without flatpak and without a detail call per app. */
const FH_SEARCH = 'https://flathub.org/api/v2/search';
const fhSearch = async query => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const reply = await fetch(FH_SEARCH, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ query, page: 1, per_page: 40 })
    });
    if (!reply.ok) throw new Error(`HTTP ${reply.status}`);
    const json = await reply.json();
    const seen = new Set();
    const hits = Array.isArray(json.hits) ? json.hits : [];
    return hits.filter(hit => hit && okId(hit.app_id) && !seen.has(hit.app_id) && seen.add(hit.app_id))
      .slice(0, 40)
      .map(hit => ({
        id: hit.app_id,
        name: hit.name || hit.app_id,
        desc: hit.summary || '',
        summary: hit.summary || '',
        icon: hit.icon || '',
        developer: hit.developer_name || '',
        verified: hit.verification_verified === true
      }));
  } finally {
    clearTimeout(timer);
  }
};
ipcMain.handle('store:search', async (_, q) => {
  const query = String(q).slice(0, 80).trim();
  if (!query) return { apps: [] };
  let offline = false;
  try {
    return { apps: await fhSearch(query) };
  } catch {
    offline = true;
  }
  /* No Flathub over HTTPS: fall back to the catalog flatpak already has on disk. */
  const setupError = await fpCatalog();
  if (setupError) return { error: offline ? 'Could not reach Flathub. ' + setupError : setupError };
  const r = await fp(['search', '--user', '--columns=name,description,application', query], 30000);
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
  const setupError = await fpRemote();
  if (setupError) return { ok: false, error: setupError };
  const r = await fpStream(event.sender, id, ['install', '--user', '-y', '--noninteractive', 'flathub', id], 30 * 60000);
  return { ok: r.ok, error: r.ok ? '' : fpFailure(r, 'Could not install app') };
});
ipcMain.handle('store:uninstall', async (event, id) => {
  if (!okId(id)) return { ok: false, error: 'Invalid app ID.' };
  const setupError = await fpRemote();
  if (setupError) return { ok: false, error: setupError };
  const r = await fpStream(event.sender, id, ['uninstall', '--user', '-y', '--noninteractive', id], 10 * 60000);
  return { ok: r.ok, error: r.ok ? '' : fpFailure(r, 'Could not uninstall app') };
});
/* Compare each installed app against the Flathub appstream catalog that is already on disk. */
ipcMain.handle('store:updates', async () => {
  const r = await fp(['list', '--user', '--app', '--columns=application,name,version'], 15000);
  if (!r.ok) return { error: fpFailure(r, 'Could not check for updates') };
  const apps = fpRows(r.out).filter(row => okId(row[0]));
  /* With nothing from the Store installed there is nothing to compare, so the catalog never loads. */
  if (!apps.length) return { updates: [] };
  const setupError = await fpCatalog();
  if (setupError) return { error: setupError };
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
  const setupError = await fpRemote();
  if (setupError) return { ok: false, error: setupError };
  const r = await fpStream(event.sender, id || '', ['update', '--user', '--noninteractive', '-y', ...(id ? [id] : [])], 30 * 60000);
  return { ok: r.ok, error: r.ok ? '' : fpFailure(r, id ? 'Could not update app' : 'Could not update apps') };
});
ipcMain.handle('store:run', (_, id) => IS_LINUX && okId(id) ? launchExt('flatpak', ['run', '--env=GTK_CSD=0', id], os.homedir()) : { ok: false, error: 'Not available here' });
/* ---- Finder + Terminal ---- */
const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
ipcMain.handle('fs:home', () => {
  const h = os.homedir();
  /* Screenshots land in Pictures, so every account keeps the folder even before the first capture. */
  for (const d of ['Desktop', 'Documents', 'Downloads', 'Pictures']) try { fs.mkdirSync(path.join(h, d), { recursive: true }); } catch {}
  return h;
});
ipcMain.handle('fs:list', async (_, d, showHidden = false) => {
  try {
    const ents = await fs.promises.readdir(String(d), { withFileTypes: true });
    return { items: ents.filter(e => showHidden === true || !e.name.startsWith('.')).map(e => ({ name: e.name, dir: e.isDirectory() || (e.isSymbolicLink() && isDir(path.join(d, e.name))) })).sort((a, b) => b.dir - a.dir || a.name.localeCompare(b.name)) };
  } catch (e) { return { error: e.code === 'EACCES' ? 'You don\'t have permission to open this folder.' : 'Folder not found.' }; }
});
/* Sizes and dates are read in one batch after the rows are already on screen, so a folder with hundreds
   of entries paints at listing speed instead of waiting on a stat per file. */
ipcMain.handle('fs:stat', async (_, targets) => {
  if (!Array.isArray(targets) || !targets.length || targets.length > 500) return { ok: false, error: 'Could not read item details.' };
  const items = await Promise.all(targets.map(async target => {
    if (typeof target !== 'string' || target.length > 4096) return null;
    try {
      const info = await fs.promises.stat(target);
      return { path: target, size: info.size, mtime: info.mtimeMs, dir: info.isDirectory() };
    } catch { return null; }
  }));
  return { ok: true, items: items.filter(Boolean) };
});
/* Finder writes stay inside the home folder: that is the only tree the desktop session owns without a
   privilege prompt, and reads elsewhere (including "Computer") remain open. */
const homeRoot = () => path.resolve(os.homedir());
const inHome = candidate => {
  const root = homeRoot();
  return candidate === root || candidate.startsWith(root + path.sep);
};
const validFileName = name => typeof name === 'string' && name.length > 0 && name.length <= 255 &&
  name === name.trim() && name !== '.' && name !== '..' && !/[/\0]/.test(name);
const writeError = error => {
  if (error.code === 'EACCES' || error.code === 'EPERM') return 'You don\'t have permission to change this item.';
  if (error.code === 'EEXIST' || error.code === 'ENOTEMPTY') return 'An item with that name already exists.';
  if (error.code === 'ENOENT') return 'That item no longer exists.';
  if (error.code === 'ENOSPC') return 'There is not enough space on this drive.';
  return 'Could not change this item.';
};
ipcMain.handle('fs:mkdir', async (_, dir, name) => {
  if (!validFileName(name)) return { ok: false, error: 'Enter a valid folder name.' };
  const base = path.resolve(String(dir));
  if (!inHome(base)) return { ok: false, error: 'SilkOS can only change files in your home folder.' };
  const target = path.join(base, name);
  try {
    await fs.promises.mkdir(target);
    return { ok: true, path: target };
  } catch (error) { return { ok: false, error: writeError(error) }; }
});
ipcMain.handle('fs:rename', async (_, source, name) => {
  if (!validFileName(name)) return { ok: false, error: 'Enter a valid name.' };
  const from = path.resolve(String(source));
  if (!inHome(from) || from === homeRoot()) return { ok: false, error: 'SilkOS can only change files in your home folder.' };
  const to = path.join(path.dirname(from), name);
  if (to === from) return { ok: true, path: to };
  try {
    await fs.promises.access(to);
    return { ok: false, error: 'An item with that name already exists.' };
  } catch (error) { if (error.code !== 'ENOENT') return { ok: false, error: writeError(error) }; }
  try {
    await fs.promises.rename(from, to);
    return { ok: true, path: to };
  } catch (error) { return { ok: false, error: writeError(error) }; }
});
const trashStamp = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
ipcMain.handle('fs:trash', async (_, sources) => {
  if (!Array.isArray(sources) || !sources.length || sources.length > 200) return { ok: false, error: 'Select files to move to the Trash.' };
  const root = homeRoot();
  const trash = path.join(root, '.local', 'share', 'Trash');
  const files = path.join(trash, 'files'), info = path.join(trash, 'info');
  try {
    await fs.promises.mkdir(files, { recursive: true });
    await fs.promises.mkdir(info, { recursive: true });
  } catch { return { ok: false, error: 'Could not open the Trash.' }; }
  let trashed = 0;
  for (const source of sources) {
    const from = path.resolve(String(source));
    if (!inHome(from) || from === root) return { ok: false, error: 'SilkOS can only change files in your home folder.' };
    const base = path.basename(from);
    let name = base, suffix = 1;
    while (fs.existsSync(path.join(files, name)) || fs.existsSync(path.join(info, `${name}.trashinfo`))) {
      name = `${base}.${suffix++}`;
      if (suffix > 999) return { ok: false, error: 'The Trash is full.' };
    }
    try {
      await fs.promises.rename(from, path.join(files, name));
    } catch (error) {
      if (error.code !== 'EXDEV') return { ok: false, error: writeError(error) };
      try {
        await fs.promises.cp(from, path.join(files, name), { recursive: true });
        await fs.promises.rm(from, { recursive: true, force: true });
      } catch { return { ok: false, error: 'Could not move the item to the Trash.' }; }
    }
    const entry = `[Trash Info]\nPath=${encodeURI(from)}\nDeletionDate=${trashStamp(new Date())}\n`;
    try { await fs.promises.writeFile(path.join(info, `${name}.trashinfo`), entry); } catch {}
    trashed += 1;
  }
  return { ok: true, trashed };
});
ipcMain.handle('fs:move', async (_, sources, destination) => {
  if (!Array.isArray(sources) || !sources.length || sources.length > 200) return { ok: false, error: 'Select files to move.' };
  const dest = path.resolve(String(destination));
  if (!inHome(dest)) return { ok: false, error: 'SilkOS can only change files in your home folder.' };
  if (!isDir(dest)) return { ok: false, error: 'The destination folder no longer exists.' };
  let moved = 0;
  for (const source of sources) {
    const from = path.resolve(String(source));
    if (!inHome(from) || from === homeRoot()) return { ok: false, error: 'SilkOS can only change files in your home folder.' };
    /* Moving a folder into its own subtree would detach it from the tree while copying. */
    if (dest === from || dest.startsWith(from + path.sep)) return { ok: false, error: 'A folder cannot be moved inside itself.' };
    const target = path.join(dest, path.basename(from));
    if (target === from) continue;
    try {
      await fs.promises.access(target);
      return { ok: false, error: `“${path.basename(from)}” already exists in that folder.` };
    } catch (error) { if (error.code !== 'ENOENT') return { ok: false, error: writeError(error) }; }
    try {
      await fs.promises.rename(from, target);
    } catch (error) {
      if (error.code !== 'EXDEV') return { ok: false, error: writeError(error) };
      try {
        await fs.promises.cp(from, target, { recursive: true });
        await fs.promises.rm(from, { recursive: true, force: true });
      } catch { return { ok: false, error: 'Could not move this item.' }; }
    }
    moved += 1;
  }
  return { ok: true, moved };
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
/* ---- Screenshots ----
 * A capture is frozen before the shell raises itself, so the selection overlay never photographs the
 * open menu that started it. The overlay lives inside the shell, which keeps it above every SilkOS
 * surface without fighting Openbox's fullscreen layer for a second window. */
const SCREENSHOT_DELAY_MS = 180;
let captureInFlight = false;
let regionPending = null;
const screenshotDir = async () => {
  const dir = path.join(os.homedir(), 'Pictures', 'Screenshots');
  await fs.promises.mkdir(dir, { recursive: true });
  return dir;
};
const screenshotTarget = async () => {
  const dir = await screenshotDir();
  const now = new Date(), pad = value => String(value).padStart(2, '0');
  const base = `Screenshot ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} at ${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}`;
  let name = `${base}.png`, suffix = 1;
  while (fs.existsSync(path.join(dir, name))) name = `${base} (${++suffix}).png`;
  return path.join(dir, name);
};
const saveScreenshot = async image => {
  const target = await screenshotTarget();
  await fs.promises.writeFile(target, image.toPNG());
  try { clipboard.writeImage(image); } catch (error) { console.error('Could not copy the screenshot to the clipboard:', error); }
  const size = image.getSize();
  return { path: target, url: pathToFileURL(target).href, width: size.width, height: size.height };
};
const announceScreenshot = result => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('screenshot:saved', result);
};
const announceScreenshotError = message => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('screenshot:error', message);
};
const grabDisplay = async followWindow => {
  const display = followWindow && mainWindow && !mainWindow.isDestroyed()
    ? screen.getDisplayMatching(mainWindow.getBounds())
    : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const scale = display.scaleFactor || 1;
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.max(1, Math.round(display.size.width * scale)),
      height: Math.max(1, Math.round(display.size.height * scale))
    }
  });
  const source = sources.find(item => String(item.display_id) === String(display.id)) || sources[0];
  const image = source && source.thumbnail;
  if (!image || image.isEmpty()) throw new Error('The screen could not be captured.');
  return { image, display };
};
const captureFullScreen = async () => {
  if (!IS_LINUX) return { ok: false, error: 'Screenshots are only available on Linux.' };
  if (captureInFlight) return { ok: false, error: 'A screenshot is already in progress.' };
  captureInFlight = true;
  try {
    /* The click that opened the menu is still fading its dropdown, so every capture waits it out. */
    await new Promise(resolve => setTimeout(resolve, SCREENSHOT_DELAY_MS));
    const { image } = await grabDisplay(mainWindow && mainWindow.isFocused());
    const saved = await saveScreenshot(image);
    announceScreenshot(saved);
    return { ok: true, ...saved };
  } catch (error) {
    const message = error.message || 'Could not take the screenshot.';
    console.error('Screenshot failed:', error);
    announceScreenshotError(message);
    return { ok: false, error: message };
  } finally { captureInFlight = false; }
};
const beginRegionCapture = async () => {
  if (!IS_LINUX) return { ok: false, error: 'Screenshots are only available on Linux.' };
  if (captureInFlight) return { ok: false, error: 'A screenshot is already in progress.' };
  captureInFlight = true;
  try {
    await new Promise(resolve => setTimeout(resolve, SCREENSHOT_DELAY_MS));
    const win = mainWindow;
    if (!win || win.isDestroyed()) throw new Error('The desktop window is not available.');
    const { image, display } = await grabDisplay(true);
    /* The shell can be maximized inside an Openbox margin, so the frozen copy is cropped to the window
       it will be shown in rather than to the whole display. */
    const content = win.getContentBounds();
    const scale = display.scaleFactor || 1;
    const size = image.getSize();
    const crop = {
      x: Math.max(0, Math.round((content.x - display.bounds.x) * scale)),
      y: Math.max(0, Math.round((content.y - display.bounds.y) * scale))
    };
    crop.width = Math.max(1, Math.min(Math.round(content.width * scale), size.width - crop.x));
    crop.height = Math.max(1, Math.min(Math.round(content.height * scale), size.height - crop.y));
    const frozen = image.crop(crop);
    regionPending = frozen;
    if (!win.isFocused()) { win.show(); win.focus(); }
    win.webContents.send('screenshot:init', { dataUrl: frozen.toDataURL(), width: frozen.getSize().width, height: frozen.getSize().height });
    return { ok: true };
  } catch (error) {
    const message = error.message || 'Could not start the screenshot.';
    console.error('Screenshot failed:', error);
    announceScreenshotError(message);
    return { ok: false, error: message };
  } finally { captureInFlight = false; }
};
ipcMain.handle('screenshot:full', captureFullScreen);
ipcMain.handle('screenshot:region', beginRegionCapture);
ipcMain.handle('screenshot:cancel', () => { regionPending = null; return true; });
ipcMain.handle('screenshot:complete', async (_, rect) => {
  const image = regionPending;
  regionPending = null;
  if (!image) return { ok: false, error: 'No screenshot is in progress.' };
  const clamp = (value, max) => Math.max(0, Math.min(max, Number(value) || 0));
  const x = clamp(rect?.x, 1), y = clamp(rect?.y, 1), width = clamp(rect?.width, 1), height = clamp(rect?.height, 1);
  if (width < 0.004 || height < 0.004 || x + width > 1.001 || y + height > 1.001) {
    return { ok: false, error: 'The selected area was too small.' };
  }
  const size = image.getSize();
  const crop = {
    x: Math.min(size.width - 1, Math.round(x * size.width)),
    y: Math.min(size.height - 1, Math.round(y * size.height)),
    width: Math.max(1, Math.round(width * size.width)),
    height: Math.max(1, Math.round(height * size.height))
  };
  crop.width = Math.min(crop.width, size.width - crop.x);
  crop.height = Math.min(crop.height, size.height - crop.y);
  try {
    const saved = await saveScreenshot(image.crop(crop));
    announceScreenshot(saved);
    return { ok: true, ...saved };
  } catch (error) {
    console.error('Could not save the screenshot:', error);
    return { ok: false, error: 'Could not save the screenshot.' };
  }
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
/* ---- Native app menus ----
 * GTK windows draw their menus over the desktop bus rather than on screen, so the tree is read from
 * `silkos-appmenu` and converted here, where node:test can cover it. The renderer only paints what
 * this section hands it. */
const APPMENU_RETRY_MS = 2000;
const APPMENU_HEALTHY_MS = 5000;
const APPMENU_GIVE_UP = 5;
let appMenuChild = null;
let appMenuBar = [];
let appMenuApp = '';
let appMenuFailures = 0;
let appMenuUnusable = false;

const sendAppMenuFrame = win => frame => {
  if (win.isDestroyed()) return;
  if (frame.type === 'menu') {
    appMenuBar = menuBar(frame.menus);
    appMenuApp = frame.app || '';
    win.webContents.send('native-menu', { type: 'bar', app: appMenuApp, entries: appMenuBar });
  } else if (frame.type === 'submenu') {
    /* The app name travels with the window, not with the item, so the bar keeps its title. */
    if (mergeSubmenu(appMenuBar, frame)) win.webContents.send('native-menu', { type: 'bar', app: appMenuApp, entries: appMenuBar });
  } else if (frame.type === 'clear') {
    appMenuBar = [];
    appMenuApp = '';
    win.webContents.send('native-menu', { type: 'clear', reason: frame.reason || '' });
  } else if (frame.type === 'error') {
    console.error('Native menu helper:', frame.message);
  }
};

const appMenuCommand = payload => {
  if (!appMenuChild || appMenuChild.killed) return false;
  try {
    appMenuChild.stdin.write(`${JSON.stringify(payload)}\n`);
    return true;
  } catch (error) {
    console.error('Could not reach the native menu helper:', error);
    return false;
  }
};

const startAppMenu = win => {
  if (!IS_LINUX || appMenuUnusable || appMenuChild || isQuitting || win.isDestroyed()) return;
  let child;
  try {
    child = spawn('silkos-appmenu', [], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONUNBUFFERED: '1' } });
  } catch (error) {
    console.error('Could not start the native menu helper:', error);
    appMenuUnusable = true;
    return;
  }
  const startedAt = Date.now();
  const stream = createAppMenuStream(sendAppMenuFrame(win));
  let diagnostic = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', data => stream.write(data));
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', data => { diagnostic = (diagnostic + data).slice(-2000); });
  child.once('error', error => {
    /* No helper means a SilkOS build outside the live image, which is not worth retrying. */
    if (error.code === 'ENOENT') {
      appMenuUnusable = true;
      console.error('silkos-appmenu is not installed; native app menus are unavailable.');
    }
  });
  child.once('close', (code, signal) => {
    stream.reset();
    appMenuChild = null;
    appMenuBar = [];
    appMenuApp = '';
    if (isQuitting || win.isDestroyed() || appMenuUnusable) return;
    if (!win.isDestroyed()) win.webContents.send('native-menu', { type: 'clear', reason: 'helper-exited' });
    appMenuFailures = Date.now() - startedAt >= APPMENU_HEALTHY_MS ? 0 : appMenuFailures + 1;
    if (appMenuFailures >= APPMENU_GIVE_UP) {
      appMenuUnusable = true;
      console.error(`Native app menus are unavailable (${signal || `exit ${code}`}): ${diagnostic.trim() || 'the helper printed no diagnostic output'}`);
      return;
    }
    setTimeout(() => startAppMenu(win), APPMENU_RETRY_MS);
  });
  appMenuChild = child;
  /* The helper follows the active window from the start, so tell it when SilkOS already owns it. */
  if (win.isFocused()) appMenuCommand({ cmd: 'hold' });
};

ipcMain.handle('native-menu:open', (_, id) => Number.isInteger(id) && appMenuCommand({ cmd: 'open', id }));
ipcMain.handle('native-menu:activate', (_, id) => Number.isInteger(id) && appMenuCommand({ cmd: 'activate', id }));

const GESTURE_MONITOR_RETRY_MS = 2000;const GESTURE_MONITOR_HEALTHY_MS = 10000;
const GESTURE_MONITOR_GIVE_UP = 8;
const startTouchpadGestureMonitor = win => {
  if (!IS_LINUX) return;
  let strategyIndex = 0;
  let failures = 0;
  const startMonitor = () => {
    if (isQuitting || win.isDestroyed()) return;
    const strategy = LIBINPUT_COMMANDS[strategyIndex];
    /* libinput's line format has silently changed before, and a parser that stops matching looks
       exactly like a broken touchpad. One line in the log settles which of the two it is. */
    let sawGesture = false;
    // A fresh parser per attempt, so a half-read line from a dead process cannot blend into
    // the next process's output and invent a gesture.
    const parser = createLibinputGestureParser(gesture => {
      if (!sawGesture) { sawGesture = true; console.log('Touchpad gestures: libinput is delivering recognised gestures to SilkOS'); }
      if (!win.isDestroyed()) win.webContents.send('touchpad-gesture', gesture);
    });
    let child;
    try {
      child = spawn(strategy.command, strategy.args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, LC_ALL: 'C', LANG: 'C' }
      });
    } catch (error) {
      console.error(`Could not start touchpad gesture monitoring (${strategy.name}):`, error);
      return;
    }
    const startedAt = Date.now();
    let sawDevices = false;
    let diagnostic = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', data => {
      if (!sawDevices && /DEVICE_ADDED/.test(data)) sawDevices = true;
      parser.write(data);
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', data => { diagnostic = (diagnostic + data).slice(-2000); });
    child.once('error', error => { diagnostic += String(error.message || error); });
    child.once('close', (code, signal) => {
      parser.reset();
      touchpadGestureMonitor = null;
      if (isQuitting) return;
      // libinput that listed input devices is working: restart it with the same command. One that
      // died without ever seeing a device usually cannot read /dev/input, so try the next command.
      if (sawDevices || Date.now() - startedAt >= GESTURE_MONITOR_HEALTHY_MS) {
        failures = 0;
      } else {
        failures += 1;
        strategyIndex = (strategyIndex + 1) % LIBINPUT_COMMANDS.length;
        if (failures === GESTURE_MONITOR_GIVE_UP) {
          console.error(`Touchpad gestures are unavailable (${signal || `exit ${code}`}): ${diagnostic.trim() || 'libinput printed no diagnostic output'}`);
        }
        if (failures >= GESTURE_MONITOR_GIVE_UP * 3) return;
      }
      setTimeout(startMonitor, GESTURE_MONITOR_RETRY_MS);
    });
    touchpadGestureMonitor = child;
  };
  startMonitor();
};
app.on('will-quit', () => {
  isQuitting = true;
  if (touchpadGestureMonitor && !touchpadGestureMonitor.killed) touchpadGestureMonitor.kill();
  if (appMenuChild && !appMenuChild.killed) appMenuChild.kill();
});
if (IS_LINUX) {
  app.commandLine.appendSwitch('enable-features', 'OverlayScrollbar');
  /* The page is zoomed to the chosen scale, so Chromium must not also scale it from Xft.dpi. */
  app.commandLine.appendSwitch('force-device-scale-factor', '1');
  if (process.env.SILKOS_SOFTWARE === '1') { app.disableHardwareAcceleration(); app.commandLine.appendSwitch('disable-gpu'); }
}
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const win = mainWindow = new BrowserWindow({
    width: 1280, height: 800, show: false, backgroundColor: '#3b3b8f', autoHideMenuBar: true,
    webPreferences: { webviewTag: true, contextIsolation: true, preload: path.join(__dirname, 'preload.js') }
  });
  if (IS_LINUX) {
    let savedDisplayMode = 'auto';
    try {
      const value = (await fs.promises.readFile(displayModeFile(), 'utf8')).trim();
      savedDisplayMode = value === 'auto' ? 'auto' : Number(value);
    } catch {}
    void applyDisplayScale(savedDisplayMode);
  }
  win.setTitle('SilkOS');
  win.maximize();
  if (IS_LINUX && process.env.SILKOS_KIOSK === '1') win.setFullScreen(true);
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.once('ready-to-show', () => {
    win.show();
    if (IS_LINUX) {
      startTouchpadGestureMonitor(win);
      startAppMenu(win);
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
    for (const [accelerator, shortcut] of [['Alt+Tab', 'alt-tab'], ['Alt+Shift+Tab', 'alt-tab-reverse'], ['Ctrl+Alt+Left', 'space-left'], ['Ctrl+Alt+Right', 'space-right'], ['F4', 'lp'], ['Super+Shift+3', 'screenshot-full'], ['Super+Shift+4', 'screenshot-region']]) {
      try {
        if (globalShortcut.register(accelerator, async () => {
          if (screenLocked) return;
          if (shortcut === 'screenshot-full') { void captureFullScreen(); return; }
          if (shortcut === 'screenshot-region') { void beginRegionCapture(); return; }
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
        else console.error(`Could not register the ${accelerator} shortcut.`);
      } catch (error) {
        console.error(`Could not register the ${accelerator} shortcut:`, error);
      }
    }
    win.on('blur', () => {
      if (!windowSwitchTimer) return;
      clearTimeout(windowSwitchTimer);
      windowSwitchTimer = null;
      if (!screenLocked) win.webContents.send('shortcut', 'alt-release');
    });
  }
  if (IS_LINUX) {
    /* The helper only follows the active window while a native app is focused, and these tell it
       when the shell takes focus back, so it is not polling xprop while nothing else is running. */
    win.on('blur', () => appMenuCommand({ cmd: 'watch' }));
    win.on('focus', () => appMenuCommand({ cmd: 'hold' }));
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
