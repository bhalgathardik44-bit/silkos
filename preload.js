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
  brightness: v => ipcRenderer.invoke('sys:brightness', v)
});
