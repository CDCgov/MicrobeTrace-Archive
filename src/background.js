import path from 'path';
import url from 'url';
import jetpack from 'fs-jetpack';
import { app, BrowserWindow, ipcMain } from 'electron';
import createWindow from './helpers/window';

function dataSkeleton(){
  return {
    files: [],
    data: {
      nodes: [],
      links: [],
      clusters: [],
      distance_matrix: {}
    },
    state: {
      visible_clusters: [],
      alpha: 0.3
    },
    messages: []
  };
};

var session = dataSkeleton();

var mainWindow, parserWindow, components = {};

const manifest = jetpack.cwd(app.getAppPath()).read('package.json', 'json');

ipcMain.on('log', (event, msg) => console.log(msg));

app.on('ready', () => {
  mainWindow = createWindow('main', {
    width: 1024,
    height: 768,
    show: true
  });
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true,
  }));
  ipcMain.on('tick',    (event, val) => mainWindow.send('tick',    val));
  ipcMain.on('message', (event, msg) => mainWindow.send('message', msg));
});

ipcMain.on('parse-files', (event, instructions) => {
  parserWindow = createWindow('File Parser', {show: false});
  parserWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'workers/combined.html'),
    protocol: 'file:',
    slashes: true
  }));
  parserWindow.on('ready-to-show', e => {
    parserWindow.send('deliver-instructions', instructions);
  });
});

ipcMain.on('cancel-parsing', e => parserWindow.destroy());

ipcMain.on('compute-mst', (event, titles) => {
  const computeWindow = createWindow('MST Computer', {show: false});
  computeWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'workers/compute-mst.html'),
    protocol: 'file:',
    slashes: true
  }));
  computeWindow.on('ready-to-show', e => {
    computeWindow.send('set-data', session.data);
  });
});

function distribute(type, sdata, except){
  BrowserWindow.getAllWindows().forEach(openWindow => {
    if(openWindow.id !== except){
      openWindow.send(type, sdata);
    }
  });
}

['set-data', 'update-data'].forEach(action => {
  ipcMain.on(action, (e, newData) => {
    session.data = newData;
    distribute(action, session.data, e.sender.id);
  });
});

ipcMain.on('get-data', e => {
  e.returnValue = session.data;
  e.sender.send('set-data', session.data);
});

ipcMain.on('get-manifest', e => {
  e.returnValue = manifest;
  e.sender.send('deliver-manifest', manifest);
});

ipcMain.on('get-component', (e, component) => {
  if(!components[component]){
    components[component] = jetpack.cwd(app.getAppPath()).read('app/components/'+component, 'utf8');
  }
  e.returnValue = components[component];
  e.sender.send('deliver-component', e.returnValue);
});

// selections is an array of indices of nodes whose selection bit must be flipped.
ipcMain.on('update-node-selections', (event, selections) => {
  let n = session.data.nodes.length;
  if(selections.length !== n) console.error('Update Node Selection Error: Length Mismatch');
  for(let i = 0; i < n; i++) session.data.nodes[i].selected = selections[i];
  distribute('update-node-selections', selections, event.sender.id);
});

ipcMain.on('update-node-visibilities', (event, visibilities) => {
  let n = session.data.nodes.length;
  if(visibilities.length !== n) console.error('Update Node Visibilities Error: Length Mismatch');
  for(let i = 0; i < n; i++) session.data.nodes[i].visible = visibilities[i];
  distribute('update-node-visibilities', visibilities, event.sender.id);
});

ipcMain.on('update-link-visibilities', (event, visibilities) => {
  let n = session.data.links.length;
  if(visibilities.length !== n) console.error('Update Link Visibilities Error: Length Mismatch');
  for(let i = 0; i < n; i++) session.data.links[i].visible = visibilities[i];
  distribute('update-link-visibilities', visibilities, event.sender.id);
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
});

ipcMain.on('reset', () => {
  BrowserWindow
    .getAllWindows()
    .filter(w => w.id != mainWindow.id)
    .forEach(w => w.close());
  session = dataSkeleton();
});

app.on('window-all-closed', app.quit);
