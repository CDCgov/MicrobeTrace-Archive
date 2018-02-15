import path from 'path';
import url from 'url';
import jetpack from 'fs-jetpack';
import { app, BrowserWindow, ipcMain } from 'electron';
import createWindow from './helpers/window';
import _ from 'lodash';

const manifest = jetpack.cwd(app.getAppPath()).read('package.json', 'json');

function dataSkeleton(){
  return {
    files: [],
    data: {
      nodes: [],
      nodeFields: [],
      links: [],
      linkFields: [],
      clusters: [],
      distance_matrix: {},
      tree: {}
    },
    state: {
      visible_clusters: [],
      alpha: 0.3
    },
    style: {
      background: '#ffffff',
      linkcolors: ["#3366cc", "#dc3912", "#ff9900", "#109618", "#990099", "#0099c6", "#dd4477", "#66aa00", "#b82e2e", "#316395", "#994499", "#22aa99", "#aaaa11", "#6633cc", "#e67300", "#8b0707", "#651067", "#329262", "#5574a6", "#3b3eac"],
      nodecolors: ["#3366cc", "#dc3912", "#ff9900", "#109618", "#990099", "#0099c6", "#dd4477", "#66aa00", "#b82e2e", "#316395", "#994499", "#22aa99", "#aaaa11", "#6633cc", "#e67300", "#8b0707", "#651067", "#329262", "#5574a6", "#3b3eac"]
    },
    messages: [],
    manifest: manifest
  };
};

var session = dataSkeleton();

var mainWindow, parserWindow, components = {};

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
  ipcMain.on('message', (event, msg) => mainWindow.send('message', msg));
  mainWindow.on('closed', app.quit);
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
  ipcMain.on('cancel-parsing', e => parserWindow.destroy());
});

ipcMain.on('compute-mst', () => {
  let computeWindow = createWindow('MST Computer', {show: false});
  computeWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'workers/compute-mst.html'),
    protocol: 'file:',
    slashes: true
  }));
});

ipcMain.on('compute-tree', () => {
  let computeWindow = createWindow('Tree Computer', {show: false});
  computeWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'workers/compute-tree.html'),
    protocol: 'file:',
    slashes: true
  }));
});

function distribute(type, sdata, except){
  BrowserWindow.getAllWindows().forEach(openWindow => {
    if(openWindow.id !== except){
      openWindow.send(type, sdata);
    }
  });
}

//Used by app.js to propagate old session from parsed JSON
ipcMain.on('set-session', (e, s) => {
  session = s;
  distribute('set-session', session);
});

ipcMain.on('merge-data', (e, newData) => {
  newData.nodes.forEach(newNode => {
    let oldNode = session.data.nodes.find(d => d.id == newNode.id);
    if(oldNode){
      Object.assign(oldNode, newNode);
    } else {
      session.data.nodes.push(newNode);
    }
  });
  newData.links.forEach(newLink => {
    let oldLink = session.data.links.find(l => l.source == newLink.source && l.target == newLink.target);
    if(oldLink){
      Object.assign(oldLink, newLink);
    } else {
      session.data.links.push(newLink);
    }
  });
  session.data.nodeFields = _.uniq(session.data.nodeFields.concat(newData.nodeFields));
  session.data.linkFields = _.uniq(session.data.linkFields.concat(newData.linkFields));
  distribute('set-data', session.data, e.sender.id);
});

ipcMain.on('set-tree', (e, newData) => {
  session.data.tree = newData;
  distribute('set-tree', session.data.tree, e.sender.id);
});

ipcMain.on('get-session', e => {
  e.returnValue = session;
  e.sender.send('set-session', session);
});

ipcMain.on('get-style', e => {
  e.returnValue = session.style;
  e.sender.send('deliver-style', session.style);
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

// nodeClusters is an array of integers representing the cluster to which the i-th node belongs.
ipcMain.on('update-node-clusters', (event, clusters) => {
  let n = session.data.nodes.length;
  if(clusters.length !== n) console.error('Update Node Clusters Error: Length Mismatch');
  for(let i = 0; i < n; i++) session.data.nodes[i].cluster = clusters[i];
  distribute('update-node-clusters', clusters, event.sender.id);
});

ipcMain.on('update-node-visibilities', (event, visibilities) => {
  let n = session.data.nodes.length;
  if(visibilities.length !== n) console.error('Update Node Visibilities Error: Length Mismatch');
  for(let i = 0; i < n; i++) session.data.nodes[i].visible = visibilities[i];
  distribute('update-node-visibilities', visibilities, event.sender.id);
});

ipcMain.on('update-node-degrees', (event, degrees) => {
  let n = session.data.nodes.length;
  if(degrees.length !== n) console.error('Update Node Degrees Error: Length Mismatch');
  for(let i = 0; i < n; i++) session.data.nodes[i].degree = degrees[i];
  distribute('update-node-degrees', degrees, event.sender.id);
});

ipcMain.on('update-link-visibilities', (event, visibilities) => {
  let n = session.data.links.length;
  if(visibilities.length !== n) console.error('Update Link Visibilities Error: Length Mismatch');
  for(let i = 0; i < n; i++) session.data.links[i].visible = visibilities[i];
  distribute('update-link-visibilities', visibilities, event.sender.id);
});

ipcMain.on('update-clusters', (event, clusters) => {
  session.data.clusters = clusters;
  distribute('update-clusters', session.data.clusters);
});

ipcMain.on('update-links-mst', (event, newLinks) => {
  let n = session.data.links.length;
  if(newLinks.length !== n) console.error('Update Link MST Error: Length Mismatch');
  for(let i = 0; i < n; i++) session.data.links[i].mst = newLinks[i];
  distribute('update-links-mst', newLinks);
});

ipcMain.on('update-style', (event, newStyle) => {
  session.style = newStyle;
  distribute('update-style', newStyle);
});

ipcMain.on('launch-view', (event, view) => {
  const thingWindow = createWindow(view, {
    width: 800,
    height: 610,
    show: true,
    alwaysOnTop: view == 'filter.html'
  });
  thingWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'views/' + view),
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
