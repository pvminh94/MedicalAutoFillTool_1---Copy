const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('MAF', {
  fillData: (data) => ipcRenderer.send('fill-data', data)
});