import path from 'path';
import url from 'url';
import jetpack from 'fs-jetpack';
import { app, BrowserWindow, ipcMain } from 'electron';
import createWindow from './helpers/window';

// Special module holding environment variables which you declared
// in config/env_xxx.json file.
import env from './env';

// Save userData in separate folders for each environment.
// Thanks to this you can use production and development versions of the app
// on same machine like those are two separate apps.
if (env.name !== 'production') {
  const userDataPath = app.getPath('userData');
  app.setPath('userData', `${userDataPath} (${env.name})`);
}

var data;

function reset(){
  data = {
    metric: 'distance',
    nodes: [],
    links: []
  };
};

reset();

const manifest = jetpack.cwd(app.getAppPath()).read('package.json', 'json');

ipcMain.on('log', (event, msg) => console.log(msg));

app.on('ready', () => {
  const mainWindow = createWindow('main', {
    width: 1024,
    height: 768,
    show: true
  });
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true,
  }));
  if(env.name === 'development'){
    mainWindow.openDevTools();
  }
  ipcMain.on('tick',    (event, val) => mainWindow.send('tick',    val));
  ipcMain.on('message', (event, msg) => mainWindow.send('message', msg));
});

ipcMain.on('parse-file', (event, instructions) => {
  var worker = 'workers/'
  if(instructions.file.slice(-3) === 'csv'){
    worker += 'parse-link-csv.html';
  } else {
    worker += 'parse-fasta.html';
  }
  const parserWindow = createWindow('File Parser', {show: false});
  parserWindow.loadURL(url.format({
    pathname: path.join(__dirname, worker),
    protocol: 'file:',
    slashes: true
  }));
  parserWindow.on('ready-to-show', e => {
    parserWindow.send('deliver-instructions', instructions);
  });
});

function distribute(type, sdata, except){
  BrowserWindow.getAllWindows().forEach(openWindow => {
    if(openWindow.id !== except){
      openWindow.send(type, sdata);
    }
  });
}

ipcMain.on('update-data', (e, newData) => {
  Object.assign(data, newData);
  distribute('deliver-data', data, e.sender.id);
});

ipcMain.on('update-nodes', (event, newNodes) => {
  data.nodes = newNodes;
  distribute('deliver-nodes', data.nodes, event.sender.id);
});

ipcMain.on('update-node-selection', (event, newNodes) => {
  data.nodes.forEach(d => d.selected = newNodes.find(nn => nn.id == d.id).selected);
  distribute('update-node-selection', data.nodes, event.sender.id);
});

ipcMain.on('update-link-visibility', (event, newLinks) => {
  data.links.forEach(l => l.visible = newLinks.find(nl => nl.id == l.id).visible);
  distribute('update-link-visibility', data.links, event.sender.id);
});

ipcMain.on('get-data',      e => e.sender.send('deliver-data',     data));
ipcMain.on('get-nodes',     e => e.sender.send('deliver-nodes',    data.nodes));
ipcMain.on('get-links',     e => e.sender.send('deliver-links',    data.links));
ipcMain.on('get-manifest',  e => e.sender.send('deliver-manifest', manifest));
ipcMain.on('get-component', (e, component) => {
  e.returnValue = jetpack.cwd(app.getAppPath()).read('app/components/'+component, 'utf8');
  e.sender.send('deliver-component', e.returnValue);
});

ipcMain.on('launch-view', (event, view) => {
  const thingWindow = createWindow(view, {
    width: 800,
    height: 600,
    show: true
  });
  thingWindow.loadURL(url.format({
    pathname: path.join(__dirname, view),
    protocol: 'file:',
    slashes: true
  }));
  if (env.name === 'development') {
    thingWindow.openDevTools();
  }
});

ipcMain.on('reset', reset);

app.on('window-all-closed', app.quit);
