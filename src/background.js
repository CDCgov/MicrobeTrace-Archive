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
  ipcMain.on('tick',    (event, val) => mainWindow.send('tick',    val));
  ipcMain.on('message', (event, msg) => mainWindow.send('message', msg));
});

ipcMain.on('parse-files', (event, instructions) => {
  const parserWindow = createWindow('File Parser', {show: false});
  parserWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'workers/combined.html'),
    protocol: 'file:',
    slashes: true
  }));
  parserWindow.on('ready-to-show', e => {
    parserWindow.send('deliver-instructions', instructions);
  });
});

ipcMain.on('add-nodes', (event, newNodes) => {
  newNodes.forEach(newNode => {
    let o = session.data.nodes.find(oldNode => newNode.id == oldNode);
    if(o){
      Object.assign(o, newNode);
    } else {
      session.data.nodes.push(newNode);
    }
  });
});

ipcMain.on('add-links', (event, newLinks) => {
  newLinks.forEach(newLink => {
    let o = session.data.links.find(oldLink => newLink.source == oldLink.source && newLink.target == oldLink.target);
    if(o){
      Object.assign(o, newLink);
    } else {
      session.data.links.push(newLink);
    }
  });
});

ipcMain.on('compute-mst', (event, titles) => {
  const computeWindow = createWindow('MST Computer', {show: false});
  computeWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'workers/compute-mst.html'),
    protocol: 'file:',
    slashes: true
  }));
  computeWindow.on('ready-to-show', e => {
    computeWindow.send('deliver-data', session.data);
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
  Object.assign(session.data, newData);
  distribute('deliver-data', session.data, e.sender.id);
});

ipcMain.on('update-node-selection', (event, newNodes) => {
  session.data.nodes.forEach(d => d.selected = newNodes.find(nn => nn.id == d.id).selected);
  distribute('update-node-selection', session.data.nodes, event.sender.id);
});

ipcMain.on('update-node-cluster', (event, newNodes) => {
  session.data.nodes.forEach(d => d.cluster = newNodes.find(nn => nn.id == d.id).cluster);
  distribute('update-node-cluster', session.data.nodes, event.sender.id);
});

ipcMain.on('update-visibility', (event, newData) => {
  session.data.links.forEach((l, i) => l.visible = newData.links[i].visible);
  session.data.nodes.forEach((d, i) => d.visible = newData.nodes[i].visible);
  session.data.clusters = newData.clusters;
  distribute('update-visibility', session.data, event.sender.id);
});

ipcMain.on('update-clusters', (event, clusters) => {
  session.data.clusters = clusters;
  distribute('update-clusters', session.data.clusters);
});

ipcMain.on('update-links-mst', (event, newLinks) => {
  session.data.links = newLinks;
  distribute('update-links-mst', session.data.links);
});

ipcMain.on('get-data', e => {
  e.returnValue = session.data;
  e.sender.send('deliver-data', session.data);
});

ipcMain.on('get-manifest', e => {
  e.returnValue = manifest;
  e.sender.send('deliver-manifest', manifest);
});

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
});

ipcMain.on('reset', () => session = dataSkeleton());

app.on('window-all-closed', app.quit);
