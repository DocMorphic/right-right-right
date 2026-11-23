const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('connectionSettings',{
  read:()=>ipcRenderer.invoke('connection:read'),
  save:address=>ipcRenderer.invoke('connection:save',address),
  cancel:()=>ipcRenderer.invoke('connection:cancel')
});
