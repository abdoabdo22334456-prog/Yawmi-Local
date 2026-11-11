'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const loaded = ipcRenderer.sendSync('yawmi:load');
contextBridge.exposeInMainWorld('yawmiDesktop', {
  version: loaded.version,
  initialTheme: loaded.theme,
  setTheme: theme=>ipcRenderer.invoke('yawmi:theme',theme),
  initialState: loaded.state,
  startupWarning: loaded.warning,
  saveState: state => ipcRenderer.sendSync('yawmi:save', state),
  exportBackup: () => ipcRenderer.invoke('yawmi:export'),
  importBackup: () => ipcRenderer.invoke('yawmi:import'),
  notify: message => ipcRenderer.invoke('yawmi:notify', message),
  sharing: (action,value) => ipcRenderer.invoke('yawmi:sharing',action,value),
  couple: (action,value) => ipcRenderer.invoke('yawmi:couple',action,value),
  onPlanUpdated: callback => {
    const listener=(_event,state)=>callback(state);ipcRenderer.on('yawmi:plan-updated',listener);
    return()=>ipcRenderer.removeListener('yawmi:plan-updated',listener);
  },
  onCoupleEvent: callback => {
    const listener=(_event,event)=>{if(event&&typeof event.body==='string')callback(event);};ipcRenderer.on('yawmi:couple-event',listener);
    return()=>ipcRenderer.removeListener('yawmi:couple-event',listener);
  },
  onSharingStatus: callback => {
    const listener=(_event,status)=>callback(status);ipcRenderer.on('yawmi:sharing-status',listener);
    return ()=>ipcRenderer.removeListener('yawmi:sharing-status',listener);
  },
  onNudge: callback => {
    const listener=(_event,message)=>{if(typeof message==='string'&&message.length<=150)callback(message);};ipcRenderer.on('yawmi:nudge',listener);
    return ()=>ipcRenderer.removeListener('yawmi:nudge',listener);
  },
  onCommand: callback => {
    const listener = (_event, command) => { if (typeof command === 'string') callback(command); };
    ipcRenderer.on('yawmi:command', listener);
    return () => ipcRenderer.removeListener('yawmi:command', listener);
  }
});
