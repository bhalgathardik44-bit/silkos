const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('silk', {
  onOpenTab: cb => ipcRenderer.on('open-tab', (_, u) => cb(u)),
  suggest: q => ipcRenderer.invoke('suggest', q),
  onShortcut: cb => ipcRenderer.on('shortcut', (_, k) => cb(k)),
  onTouchpadGesture: cb => ipcRenderer.on('touchpad-gesture', (_, gesture) => cb(gesture)),
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
  connectWifi: (ssid, password) => ipcRenderer.invoke('sys:wifi:connect', ssid, password),
  bluetooth: enabled => ipcRenderer.invoke('sys:bluetooth', enabled),
  bluetoothDevices: () => ipcRenderer.invoke('sys:bluetooth:devices'),
  connectBluetooth: address => ipcRenderer.invoke('sys:bluetooth:connect', address),
  selectWallpaper: () => ipcRenderer.invoke('wallpaper:select'),
  keyboardBrightness: value => ipcRenderer.invoke('sys:keyboard-brightness', value),
  media: action => ipcRenderer.invoke('sys:media', action),
  volume: v => ipcRenderer.invoke('sys:volume', v),
  brightness: v => ipcRenderer.invoke('sys:brightness', v),
  trackpad: { setTapToClick: enabled => ipcRenderer.invoke('sys:trackpad:tap-to-click', enabled) },
  resources: () => ipcRenderer.invoke('sys:resources'),
  workspaces: {
    list: () => ipcRenderer.invoke('sys:workspaces'),
    switchTo: index => ipcRenderer.invoke('sys:workspace:set', index)
  },
  files: { home: () => ipcRenderer.invoke('fs:home'), list: (d, showHidden) => ipcRenderer.invoke('fs:list', d, showHidden), open: p => ipcRenderer.invoke('fs:open', p) },
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
