const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('silk', {
  onOpenTab: cb => ipcRenderer.on('open-tab', (_, u) => cb(u)),
  suggest: q => ipcRenderer.invoke('suggest', q),
  onShortcut: cb => ipcRenderer.on('shortcut', (_, k) => cb(k)),
  platform: process.platform,
  power: k => ipcRenderer.invoke('sys:power', k),
  battery: () => ipcRenderer.invoke('sys:battery'),
  wifi: () => ipcRenderer.invoke('sys:wifi'),
  volume: v => ipcRenderer.invoke('sys:volume', v),
  brightness: v => ipcRenderer.invoke('sys:brightness', v),
  files: { home: () => ipcRenderer.invoke('fs:home'), list: d => ipcRenderer.invoke('fs:list', d), open: p => ipcRenderer.invoke('fs:open', p) },
  terminal: () => ipcRenderer.invoke('sys:terminal'),
  store: { installed: () => ipcRenderer.invoke('store:installed'), search: q => ipcRenderer.invoke('store:search', q), install: id => ipcRenderer.invoke('store:install', id), run: id => ipcRenderer.invoke('store:run', id) }
});
