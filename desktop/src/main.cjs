const {app,BrowserWindow,Menu,dialog,clipboard,ipcMain,utilityProcess}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
let gameWindow,settingsWindow,runtime,connection,configuration={remote:null},closing=false,logPath,configSaving=false;
app.setPath('userData',path.join(app.getPath('appData'),'RightRightRight Desktop'));
const base=__dirname,configFile=()=>path.join(app.getPath('userData'),'connection.json');
const log=(event,extra={})=>{const line=JSON.stringify({at:new Date().toISOString(),event,...extra});console.log(line);if(logPath)fs.appendFile(logPath,line+'\n').catch(()=>{});};
if(!app.requestSingleInstanceLock()){app.quit();}else{
app.on('second-instance',()=>{if(gameWindow){if(gameWindow.isMinimized())gameWindow.restore();gameWindow.show();gameWindow.focus();}});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{closing=true;try{runtime?.postMessage({type:'stop'});}catch{}fs.unlink(path.join(app.getPath('userData'),'desktop.pid.json')).catch(()=>{});});
(async()=>{
 const {normalizeServerAddress,hostLinks,browserAddress}=await import(pathToFileURL(path.join(base,'config.mjs')));
 await app.whenReady();await fs.mkdir(app.getPath('userData'),{recursive:true});logPath=path.join(app.getPath('userData'),'desktop.log');await fs.writeFile(path.join(app.getPath('userData'),'desktop.pid.json'),JSON.stringify({pid:process.pid,execPath:process.execPath}));
 try{configuration=JSON.parse(await fs.readFile(configFile(),'utf8'));}catch{}
 configuration.remote=normalizeServerAddress(process.env.GAME_SERVER_URL!==undefined?process.env.GAME_SERVER_URL:configuration.remote||'');
 const trustedSettings=event=>settingsWindow&&event.sender===settingsWindow.webContents&&event.senderFrame.url===pathToFileURL(path.join(base,'settings.html')).href;
 ipcMain.handle('connection:read',event=>{if(!trustedSettings(event))throw new Error('Invalid settings window');return configuration;});
 ipcMain.handle('connection:cancel',event=>{if(trustedSettings(event))settingsWindow.close();});
 ipcMain.handle('connection:save',async(event,address)=>{
  if(!trustedSettings(event))throw new Error('Invalid settings window');
  if(configSaving)return {error:'The connection is already changing.'};configSaving=true;
  try{const remote=normalizeServerAddress(address);await fs.mkdir(path.dirname(configFile()),{recursive:true});await fs.writeFile(configFile(),JSON.stringify({remote},null,2));configuration={remote};await restart();settingsWindow?.close();return {ok:true};}
  catch(error){return {error:error.message};}finally{configSaving=false;}
 });
 function showSettings(){
  if(settingsWindow){settingsWindow.focus();return;}
  settingsWindow=new BrowserWindow({width:580,height:400,resizable:false,parent:gameWindow,modal:true,title:'Game connection',show:false,webPreferences:{preload:path.join(base,'config-preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
  settingsWindow.removeMenu();settingsWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));settingsWindow.webContents.on('will-navigate',event=>event.preventDefault());
  settingsWindow.loadFile(path.join(base,'settings.html'));settingsWindow.once('ready-to-show',()=>settingsWindow.show());settingsWindow.on('closed',()=>settingsWindow=null);
 }
 function menu(){
  const links=connection?.mode==='host'?hostLinks(connection.port):[];
  Menu.setApplicationMenu(Menu.buildFromTemplate([
   {label:'Right Right Right',submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}]},
   {label:'Game',submenu:[{label:'Solo Practice',enabled:connection?.mode==='host',click:()=>gameWindow?.loadURL(connection.origin+'/?practice=1')},{type:'separator'},{label:'Reload Game',accelerator:'CmdOrCtrl+R',click:()=>gameWindow?.reload()},{role:'togglefullscreen'},...(process.env.RRR_DESKTOP_DEBUG?[{role:'toggleDevTools'}]:[])]},
   {label:'Network',submenu:[{label:connection?.mode==='host'?'Hosting on this Mac':'Using a configured host',enabled:false},{label:'Connection Settings…',click:showSettings},{label:'Copy Host Link',enabled:Boolean(links.length||connection?.remote),click:()=>clipboard.writeText(links[0]||browserAddress(connection.remote))},{label:'Connection Details…',click:()=>dialog.showMessageBox(gameWindow,{type:'info',message:connection?.mode==='host'?'This Mac is the game host':'Game authority',detail:connection?.mode==='host'?`${links.join('\n')||'No local network address is available.'}\n\nThe other Mac must select this host in Network → Connection Settings, then use the same room code. Keep this app open while hosting.`:`${browserAddress(connection.remote)}\n\nAssets are loaded from this app. Both players must use this same host.`,buttons:['OK']})}]},
   {label:'Window',submenu:[{role:'minimize'},{role:'zoom'},{role:'front'}]}
  ]));
 }
 async function startRuntime(){
  return new Promise((resolve,reject)=>{
   const child=utilityProcess.fork(path.join(base,'runtime-entry.mjs'),[JSON.stringify({clientRoot:path.join(base,'client'),remoteUrl:configuration.remote,port:0,host:'0.0.0.0',assetPort:45087})],{serviceName:'Right Right Right Game Host',stdio:'pipe'});
   runtime=child;child.stdout?.on('data',chunk=>process.stdout.write(chunk));child.stderr?.on('data',chunk=>process.stderr.write(chunk));
   const timer=setTimeout(()=>{child.kill();reject(new Error('The local game host did not start.'));},15000);
   child.on('message',message=>{if(message.type==='ready'){clearTimeout(timer);resolve(message);}else if(message.type==='error'){clearTimeout(timer);reject(new Error(message.message));}});
   child.on('exit',code=>{clearTimeout(timer);if(runtime===child){runtime=null;if(!closing)log('host-exit',{code});}if(code)reject(new Error(`The game host exited (${code}).`));});
  });
 }
 async function restart(){
  if(runtime){const previous=runtime;runtime=null;await new Promise(resolve=>{const timer=setTimeout(()=>{previous.kill();resolve();},1500);previous.once('exit',()=>{clearTimeout(timer);resolve();});previous.postMessage({type:'stop'});});}
  connection=await startRuntime();menu();log('desktop-host-ready',{mode:connection.mode,port:connection.port});
  if(!gameWindow){
   gameWindow=new BrowserWindow({width:1280,height:800,minWidth:1024,minHeight:640,title:'Right Right Right',backgroundColor:'#24211f',show:false,webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true,backgroundThrottling:false,spellcheck:false,autoplayPolicy:'user-gesture-required'}});
   gameWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
   gameWindow.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==connection.origin)event.preventDefault();});
   gameWindow.webContents.on('console-message',details=>{if(details.level==='error')log('renderer-error',{message:details.message});});
   gameWindow.webContents.on('render-process-gone',(_event,details)=>log('renderer-gone',details));
   gameWindow.webContents.on('audio-state-changed',event=>log('audio-state',{audible:event.audible}));
   gameWindow.webContents.on('did-fail-load',(_event,code,description)=>log('load-failed',{code,description}));
   gameWindow.webContents.session.setPermissionRequestHandler((_contents,permission,callback)=>callback(_contents.getURL().startsWith(connection.origin+'/')&&['pointerLock','fullscreen','clipboard-sanitized-write'].includes(permission)));
   gameWindow.webContents.session.webRequest.onHeadersReceived((details,callback)=>{
    const headers={...details.responseHeaders};
    if(details.url.startsWith(connection.origin+'/'))headers['Content-Security-Policy']=["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' blob: ws://127.0.0.1:*; media-src 'self' data: blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-src 'none'"];
    callback({responseHeaders:headers});
   });
   gameWindow.once('ready-to-show',()=>gameWindow.show());gameWindow.on('closed',()=>{gameWindow=null;});
  }
  await gameWindow.loadURL(connection.origin);log('game-page-loaded',{url:connection.origin});
 }
 await restart();
})().catch(error=>{log('startup-error',{message:error.message});dialog.showErrorBox('Right Right Right could not start',error.message);app.quit();});
}
