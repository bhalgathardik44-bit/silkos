const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('silk', {
  onOpenTab: cb => ipcRenderer.on('open-tab', (_, u) => cb(u)),
  suggest: q => ipcRenderer.invoke('suggest', q),
  onShortcut: cb => ipcRenderer.on('shortcut', (_, k) => cb(k)),
  platform: process.platform,
  power: k => ipcRenderer.invoke('sys:power', k),
  battery: () => ipcRenderer.invoke('sys:battery'),
  wifi: () => ipcRenderer.invoke('sys:wifi'),
  setWifi: enabled => ipcRenderer.invoke('sys:wifi:set', enabled),
  bluetooth: () => ipcRenderer.invoke('sys:bluetooth'),
  setBluetooth: enabled => ipcRenderer.invoke('sys:bluetooth:set', enabled),
  volume: v => ipcRenderer.invoke('sys:volume', v),
  media: () => ipcRenderer.invoke('sys:media'),
  mediaAction: (player, action) => ipcRenderer.invoke('sys:media:action', player, action),
  brightness: v => ipcRenderer.invoke('sys:brightness', v),
  resources: () => ipcRenderer.invoke('sys:resources'),
  users: {
    list: () => ipcRenderer.invoke('users:list'),
    create: (name, password) => ipcRenderer.invoke('users:create', name, password),
    verify: (id, password) => ipcRenderer.invoke('users:verify', id, password),
    update: (id, password, name, newPassword) => ipcRenderer.invoke('users:update', id, password, name, newPassword),
    remove: (id, password) => ipcRenderer.invoke('users:delete', id, password),
    chooseAvatar: id => ipcRenderer.invoke('users:avatar', id)
  },
  appearance: {
    get: () => ipcRenderer.invoke('appearance:get'),
    chooseWallpaper: kind => ipcRenderer.invoke('appearance:pick', kind),
    clearWallpaper: kind => ipcRenderer.invoke('appearance:clear', kind)
  },
  files: { home: () => ipcRenderer.invoke('fs:home'), list: d => ipcRenderer.invoke('fs:list', d), open: p => ipcRenderer.invoke('fs:open', p) },
  persist: { status: () => ipcRenderer.invoke('persist:status'), setup: d => ipcRenderer.invoke('persist:setup', d) },
  terminal: () => ipcRenderer.invoke('sys:terminal'),
  store: { installed: () => ipcRenderer.invoke('store:installed'), search: q => ipcRenderer.invoke('store:search', q), install: id => ipcRenderer.invoke('store:install', id), run: id => ipcRenderer.invoke('store:run', id) }
});
