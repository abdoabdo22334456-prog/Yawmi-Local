'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const loaded = ipcRenderer.sendSync('yawmi:load');
contextBridge.exposeInMainWorld('yawmiDesktop', {
  version: loaded.version,
  prefs: loaded.prefs,
  initialState: loaded.state,
  startupWarning: loaded.warning,
  saveState: state => ipcRenderer.sendSync('yawmi:save', state),
  setPrefs: patch => ipcRenderer.invoke('yawmi:prefs', patch),
  exportBackup: () => ipcRenderer.invoke('yawmi:export'),
  importBackup: () => ipcRenderer.invoke('yawmi:import'),
  notify: message => ipcRenderer.invoke('yawmi:notify', message),
  onCommand: callback => {
    const listener = (_event, command) => { if (typeof command === 'string') callback(command); };
    ipcRenderer.on('yawmi:command', listener);
    return () => ipcRenderer.removeListener('yawmi:command', listener);
  }
});
