const { contextBridge, ipcRenderer } = require('electron');
const subscribe = (channel, cb) => {
  const listener = (_, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
contextBridge.exposeInMainWorld('silk', {
  onOpenTab: cb => ipcRenderer.on('open-tab', (_, u) => cb(u)),
  suggest: q => ipcRenderer.invoke('suggest', q),
  onShortcut: cb => ipcRenderer.on('shortcut', (_, k) => cb(k)),
  onTouchpadGesture: cb => ipcRenderer.on('touchpad-gesture', (_, gesture) => cb(gesture)),
  nativeMenu: {
    onBar: cb => {
      const listener = (_, bar) => cb(bar);
      ipcRenderer.on('native-menu', listener);
      return () => ipcRenderer.removeListener('native-menu', listener);
    },
    /* Submenus the app has not populated yet are filled in only when the pointer reaches them. */
    open: id => ipcRenderer.invoke('native-menu:open', id),
    activate: id => ipcRenderer.invoke('native-menu:activate', id)
  },
  platform: process.platform,
  lock: {
    status: () => ipcRenderer.invoke('lock:status'),
    setPassword: (password, currentPassword) => ipcRenderer.invoke('lock:set-password', password, currentPassword),
    verify: password => ipcRenderer.invoke('lock:verify', password),
    setWindowLocked: locked => ipcRenderer.invoke('lock:window', locked)
  },
  power: k => ipcRenderer.invoke('sys:power', k),
  battery: () => ipcRenderer.invoke('sys:battery'),
  wifi: enabled => ipcRenderer.invoke('sys:wifi', enabled),
  wifiNetworks: () => ipcRenderer.invoke('sys:wifi:networks'),
  connectWifi: (ssid, password, hidden) => ipcRenderer.invoke('sys:wifi:connect', ssid, password, hidden === true),
  portal: () => ipcRenderer.invoke('sys:portal:check'),
  bluetooth: enabled => ipcRenderer.invoke('sys:bluetooth', enabled),
  bluetoothDevices: () => ipcRenderer.invoke('sys:bluetooth:devices'),
  connectBluetooth: address => ipcRenderer.invoke('sys:bluetooth:connect', address),
  selectWallpaper: () => ipcRenderer.invoke('wallpaper:select'),
  keyboardBrightness: value => ipcRenderer.invoke('sys:keyboard-brightness', value),
  media: action => ipcRenderer.invoke('sys:media', action),
  volume: v => ipcRenderer.invoke('sys:volume', v),
  audio: {
    devices: () => ipcRenderer.invoke('sys:audio:devices'),
    select: (kind, name) => ipcRenderer.invoke('sys:audio:select', kind, name)
  },
  capture: {
    full: () => ipcRenderer.invoke('screenshot:full'),
    region: () => ipcRenderer.invoke('screenshot:region'),
    cancel: () => ipcRenderer.invoke('screenshot:cancel'),
    complete: rect => ipcRenderer.invoke('screenshot:complete', rect),
    onInit: cb => subscribe('screenshot:init', cb),
    onSaved: cb => subscribe('screenshot:saved', cb),
    onError: cb => subscribe('screenshot:error', cb)
  },
  brightness: v => ipcRenderer.invoke('sys:brightness', v),
  display: { setScale: mode => ipcRenderer.invoke('sys:display:scale', mode) },
  trackpad: {
    setTapToClick: enabled => ipcRenderer.invoke('sys:trackpad:tap-to-click', enabled),
    setNaturalScroll: enabled => ipcRenderer.invoke('sys:trackpad:natural-scroll', enabled)
  },
  resources: () => ipcRenderer.invoke('sys:resources'),
  workspaces: {
    list: () => ipcRenderer.invoke('sys:workspaces'),
    switchTo: index => ipcRenderer.invoke('sys:workspace:set', index)
  },
  files: {
    home: () => ipcRenderer.invoke('fs:home'),
    list: (d, showHidden) => ipcRenderer.invoke('fs:list', d, showHidden),
    stat: paths => ipcRenderer.invoke('fs:stat', paths),
    open: p => ipcRenderer.invoke('fs:open', p),
    mkdir: (d, name) => ipcRenderer.invoke('fs:mkdir', d, name),
    rename: (p, name) => ipcRenderer.invoke('fs:rename', p, name),
    trash: paths => ipcRenderer.invoke('fs:trash', paths),
    move: (paths, destination) => ipcRenderer.invoke('fs:move', paths, destination)
  },
  persist: { status: () => ipcRenderer.invoke('persist:status'), setup: d => ipcRenderer.invoke('persist:setup', d) },
  terminal: () => ipcRenderer.invoke('sys:terminal'),
  store: {
    installed: () => ipcRenderer.invoke('store:installed'),
    search: q => ipcRenderer.invoke('store:search', q),
    detail: id => ipcRenderer.invoke('store:detail', id),
    install: id => ipcRenderer.invoke('store:install', id),
    uninstall: id => ipcRenderer.invoke('store:uninstall', id),
    updates: () => ipcRenderer.invoke('store:updates'),
    updateAll: id => ipcRenderer.invoke('store:update-all', id),
    run: id => ipcRenderer.invoke('store:run', id),
    onProgress: cb => {
      const listener = (_, step) => cb(step);
      ipcRenderer.on('store:progress', listener);
      return () => ipcRenderer.removeListener('store:progress', listener);
    }
  }
});
