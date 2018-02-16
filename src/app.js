import { clipboard, remote, ipcRenderer } from 'electron';
import Lazy from 'lazy.js';
import math from 'bettermath';
import jetpack from 'fs-jetpack';
import './helpers/window.js';
import _ from 'lodash';

const d3 = require('d3');
const extraSymbols = require('d3-symbol-extra');
Object.assign(d3, extraSymbols); //d3-symbol-extra doesn't automatically write to d3
d3.symbols.concat(Object.values(extraSymbols)); //update the list of available symbols
import { forceAttract } from 'd3-force-attract';

import Papa from 'papaparse';

window.jquery = window.jQuery = window.$ = require('jquery');
require('bootstrap');

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
      linkcolors: ['#3366cc', '#dc3912', '#ff9900', '#109618', '#990099', '#0099c6', '#dd4477', '#66aa00', '#b82e2e', '#316395', '#994499', '#22aa99', '#aaaa11', '#6633cc', '#e67300', '#8b0707', '#651067', '#329262', '#5574a6', '#3b3eac'],
      nodecolors: ['#3366cc', '#dc3912', '#ff9900', '#109618', '#990099', '#0099c6', '#dd4477', '#66aa00', '#b82e2e', '#316395', '#994499', '#22aa99', '#aaaa11', '#6633cc', '#e67300', '#8b0707', '#651067', '#329262', '#5574a6', '#3b3eac']
    },
    messages: [],
    manifest: {}
  };
}

$(function(){

  $('head').append(ipcRenderer.sendSync('get-component', 'titleize.html'));
  $('body').prepend(ipcRenderer.sendSync('get-component', 'nav.html'));

  //Since the navbar is a reused component, we can only change it per view by injecting elements, like so:
  $('<li id="FileTab"><a href="#settings">New</a></li>')
    .click(() => reset())
    .insertBefore('#CloseTab');

  $('<li id="SaveTab"><a href="#">Save</a></li>').click(e => {
    remote.dialog.showSaveDialog({
      filters: [
        {name: 'MicrobeTrace Session', extensions: ['microbetrace']}
      ],
    }, filename => {
      jetpack.write(filename, JSON.stringify(session));
      alertify.success('File Saved!');
    });
  }).insertBefore('#CloseTab');

  $('<li id="OpenTab"><a href="#">Open</a></li>').click(e => {
    remote.dialog.showOpenDialog({
      filters: [
        {name: 'MicrobeTrace Session', extensions: ['microbetrace']}
      ],
    }, filepaths => {
      $('#file_panel').fadeOut(() => {
        $('#main_panel').fadeIn(() => {
          $('#loadingInformationModal').modal({
            keyboard: false,
            backdrop: 'static'
          });
          ipcRenderer.send('set-session', JSON.parse(jetpack.read(filepaths[0])));
        });
      });
    });
  }).insertBefore('#CloseTab');

  $('<li role="separator" class="divider"></li>').insertBefore('#CloseTab');

  $('<li id="ExportTab"><a href="#">Export Data</a></li>').click(e => {
    if(session.data.nodes.length == 0) return alertify.warning('Please load some data first!');
    remote.dialog.showSaveDialog({
      filters: [
        {name: 'Link CSV', extensions: ['links.csv']},
        {name: 'Node CSV', extensions: ['nodes.csv']},
        {name: 'TN93-based Distance Matrix CSV', extensions: ['tn93.dm.csv']},
        {name: 'SNP-based Distance Matrix CSV', extensions: ['snps.dm.csv']},
        {name: 'FASTA', extensions: ['fas', 'fasta']},
        {name: 'MEGA', extensions: ['meg', 'mega']},
        {name: 'Link JSON', extensions: ['links.json']},
        {name: 'Node JSON', extensions: ['nodes.json']},
        {name: 'HIVTrace', extensions: ['hivtrace.json']},
        {name: 'TN93-based Tree Newick', extensions: ['tn93.nwk']},
        {name: 'SNP-based Tree Newick', extensions: ['snps.nwk']}
      ]
    }, filename => {
      if (filename === undefined){
        return alertify.error('File not exported!');
      }
      let extension = filename.split('.').pop();
      if(filename.slice(-10) == 'links.json'){
        jetpack.write(filename, JSON.stringify(session.data.links));
        alertify.success('File Saved!');
      } else if(filename.slice(-9) == 'links.csv'){
        jetpack.write(filename, Papa.unparse(session.data.links.map(l => {
          if(typeof l.source == 'object') l.source = l.source.id;
          if(typeof l.target == 'object') l.target = l.target.id;
          return l
        })));
        alertify.success('File Saved!');
      } else if(filename.slice(-10) == 'nodes.json'){
        jetpack.write(filename, JSON.stringify(session.data.nodes));
        alertify.success('File Saved!');
      } else if(filename.slice(-9) == 'nodes.csv'){
        jetpack.write(filename, Papa.unparse(session.data.nodes));
        alertify.success('File Saved!');
      } else if(extension === 'fas' || extension === 'fasta'){
        jetpack.write(filename, session.data.nodes.filter(n => n.seq).map(n => '>'+n.id+'\n'+n.seq).join('\n'));
        alertify.success('File Saved!');
      } else if(extension === 'meg' || extension === 'mega') {
        jetpack.write(filename, '#MEGA\nTitle: '+filename+'\n\n'+session.data.nodes.filter(n => n.seq).map(n => '#'+n.id+'\n'+n.seq).join('\n'));
        alertify.success('File Saved!');
      } else if(filename.slice(-13) == 'hivtrace.json') {
        jetpack.write(filename, JSON.stringify({
          'trace_results': {
            'HIV Stages': {},
            'Degrees': {},
            'Multiple sequences': {},
            'Edge Stages': {},
            'Cluster sizes': session.data.clusters.map(c => c.size),
            'Settings': {
              'contaminant-ids': [],
              'contaminants': 'remove',
              'edge-filtering': 'remove',
              'threshold': $('#default-link-threshold').val()
            },
            'Network Summary': {
              'Sequences used to make links': 0,
              'Clusters': session.data.clusters.length,
              'Edges': session.data.links.filter(l => l.visible).length,
              'Nodes': session.data.nodes.length
            },
            'Directed Edges': {},
            'Edges': session.data.links,
            'Nodes': session.data.nodes
          }
        }, null, 2));
        alertify.success('File Saved!');
      } else if(filename.slice(-11) == 'tn93.dm.csv') {
        let labels = session.data.distance_matrix.labels;
        jetpack.write(filename, ',' + labels.join(',') + '\n' +
          session.data.distance_matrix.tn93
            .map((row, i) => labels[i] + ',' + row.join(','))
            .join('\n'));
        alertify.success('File Saved!');
      } else if(filename.slice(-11) == 'snps.dm.csv') {
        let labels = session.data.distance_matrix.labels;
        jetpack.write(filename, ',' + labels.join(',') + '\n' +
          session.data.distance_matrix.snps
            .map((row, i) => labels[i] + ',' + row.join(','))
            .join('\n'));
        alertify.success('File Saved!');
      } else if(extension == 'nwk'){
        let type = filename.split('.');
        type = type[type.length-2];
        if(!session.data.tree[type]){
          ipcRenderer.on('set-tree', (e, tree) => {
            session.data.tree = tree;
            jetpack.write(filename, session.data.tree[type]);
            alertify.success('File Saved!');
          });
          ipcRenderer.send('compute-tree');
        }
      }
    });
  }).insertBefore('#CloseTab');

  $('body').append(ipcRenderer.sendSync('get-component', 'exportRasterImage.html'));
  $('#ScreenshotTab').insertBefore('#CloseTab');

  $('body').append(ipcRenderer.sendSync('get-component', 'exportVectorImage.html'));
  $('#VectorTab').insertBefore('#CloseTab');

  $('<li role="separator" class="divider"></li>').insertBefore('#CloseTab');

  $('body').append(ipcRenderer.sendSync('get-component', 'search.html'));
  $('#searchBox').hide();

  $('<li id="AddDataTab"><a href="#">Add Data</a></li>').click(reset).insertBefore('#SettingsTab');

  $('<li role="separator" class="divider"></li>').insertBefore('#SettingsTab');

  $('<li id="RevealAllTab"><a href="#">Reveal All</a></li>').click(e => {
    session.state.visible_clusters = session.data.clusters.map(c => c.id);
    $('#HideSingletons').prop('checked', false).parent().removeClass('active');
    $('#ShowSingletons').prop('checked', true).parent().addClass('active');
    setLinkVisibility();
    setNodeVisibility();
    renderNetwork();
    session.network.force.alpha(0.3).alphaTarget(0).restart();
  }).insertBefore('#SettingsTab');

  $('<li id="ZoomToSelectedTab"><a href="#">Zoom To Selected</a></li>')
    .click(e => {
      let nodes = session.data.nodes.filter(d => d.selected);
      let maxX = math.max(nodes, 'x'),
          minX = math.min(nodes, 'x'),
          maxY = math.max(nodes, 'y'),
          minY = math.min(nodes, 'y');
      let bbox = session.network.svg.node().getBBox();
      session.network.fit({
        height: (maxY - minY) * 1.2,
        width:  (maxX - minX) * 1.2,
        x: (maxX-minX)/2 + bbox.x,
        y: (maxY-minY)/2 - bbox.y
      });
    })//.insertBefore('#SettingsTab');

  $('<li id="ZoomToFitTab"><a href="#">Zoom To Fit</a></li>')
    .click(e => session.network.fit())
    .insertBefore('#SettingsTab');

  $('<li role="separator" class="divider"></li>').insertBefore('#SettingsTab');

  // We're going to use this function in a variety of contexts. It's purpose is
  // to restore the app to the state it was in when launched.
  // The argument indicates whether the contents of the file inputs should be
  // flushed. Obviously, this should not happen when the fileinput change
  // callbacks invoke this function.
  function reset(soft){
    if(!soft){
      window.session = dataSkeleton();
      $('#file_panel .panel-body').empty();
      ipcRenderer.send('reset');
      $('#main-submit').hide();
    }
    $('#main_panel').fadeOut(() => {
      $('#network').empty();
      $('#groupKey').empty();
      $('#loadCancelButton, .showForMST, #alignerControlsButton').hide();
      $('.progress-bar').css('width', '0%').attr('aria-valuenow', 0);
      $('.showForNotMST').css('display', 'inline-block');
      $('#loadingInformation').empty();
      $('#FileTab', '#ExportHIVTraceTab', '#ExportTab', '#ScreenshotTab', '#VectorTab', '#TableTab, #FlowTab, #SequencesTab, #HistogramTab, #MapTab, #SettingsTab').addClass('disabled');
      $('#file_panel').fadeIn();
    });
  }

  reset();

  // Before anything else gets done, ask the user to accept the legal agreement
  if(!localStorage.getItem('licenseAccepted')){
    $('#acceptAgreement').click(function(){
      // Set that agreement in localStorage
      localStorage.setItem('licenseAccepted', new Date());
    });
    $('#rejectAgreement').click(function(){
      // If you don't agree, no app for you!
      remote.getCurrentWindow().close();
    });
    // No hacking around the agreement.
    $('#licenseAgreement').modal({
      backdrop: 'static',
      keyboard: false
    });
  }

  //This kind of shit gives me nightmares. How did it come to this?
  $('#addFiles').click(e => {
    remote.dialog.showOpenDialog({
      filters: [{name: 'Allowed Files', extensions: ['csv', 'tsv', 'tab', 'txt', 'fas', 'fasta']}],
      properties: ['multiSelections']
    }, paths => {
      if(paths){
        Array.prototype.push.apply(session.files, paths);
        paths.forEach(path => {
          let filename = path.split(/[\\\/]/).pop();
          let extension = filename.split('.').pop().slice(0,3).toLowerCase();
          let isFasta = (extension === 'fas');
          if(isFasta) $('#alignerControlsButton').slideDown();
          let isNode = filename.toLowerCase().includes('node');
          let root = $('<div class="row row-striped"></div>');
          $('<div class="col-xs-8 filename"></div>')
            .append($('<a href="#" class="fa fa-times killlink"></a>').click(e => {
              session.files.splice(session.files.indexOf(path),1);
              root.slideUp(e => root.remove());
            }))
            .append(`&nbsp;<a href="#" title="${filename}">${filename}</a>`)
            .appendTo(root);
          root.append(`
            <div class="col-xs-4 text-right" style="padding-bottom:5px;">
              <div class="btn-group btn-group-xs" data-toggle="buttons">
                <label class="btn btn-default${!isFasta&!isNode?' active':''}">
                  <input type="radio" name="options-${filename}" data-type="link" autocomplete="off"${!isFasta&!isNode?' checked':''}>Link</input>
                </label>
                <label class="btn btn-default${!isFasta&isNode?' active':''}">
                  <input type="radio" name="options-${filename}" data-type="node" autocomplete="off"${!isFasta&isNode?' checked':''}>Node</input>
                </label>
                <label class="btn btn-default">
                  <input type="radio" name="options-${filename}" data-type="distmat" autocomplete="off">Dist. Mat.</input>
                </label>
                <label class="btn btn-default${isFasta?' active':''}">
                  <input type="radio" name="options-${filename}" data-type="fasta" autocomplete="off"${isFasta?' checked':''}>FASTA</input>
                </label>
              </div>
            </div>
          `);
          let data = '', options = '', headers = [];
          Papa.parse(jetpack.createReadStream(path), {
            header: true,
            step: function(row, parser){
              headers = row.meta.fields;
              parser.abort();
            },
            complete: function(){
              options = '<option>None</option>' + headers.map(h => `<option value="${h}">${titleize(h)}</option>`).join('');
              $(`
                <div class='col-xs-4 text-right'${isFasta?' style="display: none;"':''} data-file='${filename}'>
                  <label style="width:65px">${isNode?'ID':'Source'}</label><span>&nbsp;</span><select style="width:calc(100% - 69px)">${options}</select>
                </div>
                <div class='col-xs-4 text-right'${isFasta?' style="display: none;"':''} data-file='${filename}'>
                  <label style="width:65px">${isNode?'Sequence':'Target'}</label><span>&nbsp;</span><select style="width:calc(100% - 69px)">${options}</select>
                </div>
                <div class='col-xs-4 text-right'${!isFasta&&!isNode?'':' style="display: none;"'} data-file='${filename}'>
                  <label style="width:65px">Distance</label><span>&nbsp;</span><select style="width:calc(100% - 69px)">${options}</select>
                </div>
              `).appendTo(root);
              let a = isNode ? ['ID', 'Id', 'id'] : ['SOURCE', 'Source', 'source'],
                  b = isNode ? ['SEQUENCE', 'SEQ', 'Sequence', 'sequence', 'seq'] : ['TARGET', 'Target', 'target'],
                  c = ['SNPs', 'TN93', 'snps', 'tn93', 'length', 'distance'];
              [a, b, c].forEach((list, i) => {
                list.forEach(title => {
                  if(headers.includes(title)){
                    $(root.find('select').get(i)).val(title);
                  }
                });
              });
              root.appendTo('#file_panel .panel-body').slideDown();
              let refit = function(e){
                let type = $(e ? e.target : `[name="options-${filename}"]:checked`).data('type'),
                these = $(`[data-file='${filename}']`),
                first = $(these.get(0)),
                second = $(these.get(1)),
                third = $(these.get(2)),
                a = ['SOURCE', 'Source', 'source'],
                b = ['TARGET', 'Target', 'target'],
                c = ['SNPs', 'TN93', 'snps', 'tn93', 'length', 'distance'];
                if(type === 'node'){
                  a = ['ID', 'Id', 'id'];
                  b = ['SEQUENCE', 'SEQ', 'Sequence', 'sequence', 'seq'];
                  first.slideDown().find('label').text('ID');
                  second.slideDown().find('label').text('Sequence');
                  third.slideUp();
                } else if(type === 'link'){
                  first.slideDown().find('label').text('Source');
                  second.slideDown().find('label').text('Target');
                  third.slideDown();
                } else {
                  these.slideUp();
                }
                [a, b, c].forEach((list, i) => {
                  list.forEach(title => {
                    if(headers.includes(title)){
                      $(these.find('select').get(i)).find('select').val(title);
                    }
                  });
                });
              };
              $(`[name="options-${filename}"]`).change(refit);
              refit();
            }
          });
        });
        $('#main-submit').slideDown();
      }
    });
  });

  $('#align').parent().click(e => $('#referenceRow').slideDown());
  $('#doNotAlign').parent().click(e => $('#referenceRow').slideUp());

  $('#refSeqFileLoad').click(e => {
    remote.dialog.showOpenDialog({
      filters: [{name: 'FASTA Files', extensions:['fas', 'fasta', 'txt']}]
    }, paths => {
      if(paths){
        $('#refSeqFile').text(paths[0]).slideDown();
        $('#reference').val(jetpack.read(paths[0]).split(/[\n>]/)[2]);
      }
    });
  });

  $('#refSeqLoad').click(e => $('#reference').val($('#HXB2pol').html()));
  $('#reference').val($('#HXB2pol').html());

  $('#loadCancelButton').click(e => {
    ipcRenderer.send('cancel-parsing');
    $('#loadingInformationModal').modal('hide');
    reset(true);
  });

  var messageTimeout;

  $('#main-submit').click(function(e){
    let files = [];
    $('#file_panel .row').each((i, el) => {
      files[i] = {
        path: session.files[i],
        type: $(el).find('input[type="radio"]:checked').data('type'),
        field1: $(el).find('select').get(0).value,
        field2: $(el).find('select').get(1).value,
        field3: $(el).find('select').get(2).value
      };
    });

    ipcRenderer.send('parse-files', {
      files: files,
      align: $('#align').is(':checked'),
      reference: $('#reference').val()
    });

    $('#file_panel').fadeOut(() => {
      $('#file_panel .panel-body').empty();
      $('#main_panel').fadeIn(() => {
        $('#loadingInformationModal').modal({
          keyboard: false,
          backdrop: 'static'
        });
      });
    });

    messageTimeout = setTimeout(() => {
      $('#loadCancelButton').slideDown();
      alertify.warning("If you stare long enough, you can reverse the DNA Molecule\'s spin direction");
    }, 20000);
  });

  ipcRenderer.on('message', (event, msg) => {
    session.messages.push(msg);
    $('#loadingInformation').html(session.messages.join('<br />'));
  });

  ipcRenderer.on('set-session', (e, s) => {
    session = s;
    clearTimeout(messageTimeout);
    $('#FileTab', '#ExportHIVTraceTab', '#ExportTab', '#ScreenshotTab', '#VectorTab', '#TableTab, #FlowTab, #SequencesTab, #HistogramTab, #MapTab, #SettingsTab').removeClass('disabled');
    $('.nodeVariables').html('<option value="none">None</option>\n' + session.data.nodeFields.map(key => `<option value="${key}">${titleize(key)}</option>`).join('\n'));
    $('#nodeTooltipVariable').val('id');
    $('.linkVariables').html('<option value="none">None</option>\n' + session.data.linkFields.map(key => `<option value="${key}">${titleize(key)}</option>`).join('\n'));
    $('#linkSortVariable').val('distance');
    $('#default-link-threshold').attr('max', math.max(session.data.links.map(l => l.distance)));
    tagClusters(); //You need the first call to tagClusters to be able to setNodeVisibility.
    setNodeVisibility();
    setLinkVisibility();
    setupNetwork();
    renderNetwork();
    tagClusters(); //You need the second call to tagClusters to get the Stats right.
    if(session.data.linkFields.includes('origin')){
      $('#linkColorVariable').val('origin');
      setLinkColor();
    }
    computeDegree();
    updateStatistics();
    $('.hidden').removeClass('hidden');
    setTimeout(e => {
      session.network.fit();
      $('#loadingInformationModal').modal('hide');
    }, 1500);
  });

  function updateStatistics(){
    if($('#hideNetworkStatistics').is(':checked')) return;
    let llinks = Lazy(session.data.links).filter(e => e.visible);
    let lnodes = Lazy(session.data.nodes).filter(e => e.visible);
    let singletons = lnodes.size() - llinks.pluck('source').union(llinks.pluck('target')).uniq().size();
    $('#numberOfSelectedNodes').text(lnodes.filter(d => d.selected).size().toLocaleString());
    $('#numberOfNodes').text(lnodes.size().toLocaleString());
    $('#numberOfVisibleLinks').text(llinks.size().toLocaleString());
    $('#numberOfSingletonNodes').text(singletons.toLocaleString());
    $('#numberOfDisjointComponents').text(session.data.clusters.length - singletons);
  }

  function tagClusters(){
    session.data.clusters = [];
    session.data.nodes.forEach(node => delete node.cluster);
    session.data.nodes.forEach(node => {
      if(typeof node.cluster === 'undefined'){
        session.data.clusters.push({
          id: session.data.clusters.length,
          nodes: 0,
          links: 0,
          sum_distances: 0,
          visible: true
        });
        DFS(node);
      }
    });
    session.state.visible_clusters = session.data.clusters.map(c => c.id);
    ipcRenderer.send('update-node-clusters', session.data.nodes.map(d => d.cluster));
  }

  function DFS(node){
    if(typeof node.cluster !== 'undefined') return;
    let lsv = $('#linkSortVariable').val();
    node.cluster = session.data.clusters.length;
    session.data.clusters[session.data.clusters.length - 1].nodes++;
    session.data.links.forEach(l => {
      if(l.visible && (l.source == node.id || l.target == node.id)){
        l.cluster = session.data.clusters.length;
        session.data.clusters[session.data.clusters.length - 1].links++;
        session.data.clusters[session.data.clusters.length - 1].sum_distances += l[lsv];
        let source = session.data.nodes.find(d => d.id === l.source);
        if(!source.cluster) DFS(source);
        let target = session.data.nodes.find(d => d.id === l.target);
        if(!target.cluster) DFS(target);
      }
    });
  }

  function computeDegree(){
    session.data.nodes.forEach(d => d.degree = 0);
    session.data.links
      .filter(l => l.visible)
      .forEach(l => {
        session.data.nodes.find(d => d.id == l.source).degree++;
        session.data.nodes.find(d => d.id == l.target).degree++;
      });
    session.data.clusters.forEach(c => {
      c.links = c.links/2;
      c.links_per_node = c.links/c.nodes;
      c.mean_genetic_distance = c.sum_distances/c.links;
    });
    ipcRenderer.send('update-clusters', session.data.clusters);
    ipcRenderer.send('update-node-degrees', session.data.nodes.map(d => d.degree));
  }

  function setNodeVisibility(){
    session.data.nodes.forEach(n => n.visible = true);
    if(session.state.visible_clusters.length < session.data.clusters.length){
      session.data.nodes.forEach(n => n.visible = n.visible && session.state.visible_clusters.includes(n.cluster));
    }
    if($('#HideSingletons').is(':checked')){
      let clusters = session.data.clusters.map(c => c.nodes);
      session.data.nodes.forEach(n => n.visible = n.visible && clusters[n.cluster-1] > 1);
    }
    ipcRenderer.send('update-node-visibilities', session.data.nodes.map(d => d.visible));
  }

  function setLinkVisibility(){
    let metric  = $('#linkSortVariable').val(),
        threshold = $('#default-link-threshold').val();
    session.data.links.forEach(link => link.visible = true);
    if(metric !== 'none'){
      session.data.links.forEach(link => link.visible = link.visible && (link[metric] <= threshold));
    }
    if($('#showMSTLinks').is(':checked')){
      session.data.links.forEach(link => link.visible = link.visible && link.mst);
    }
    if(session.state.visible_clusters.length < session.data.clusters.length){
      session.data.links.forEach(link => link.visible = link.visible && session.state.visible_clusters.includes(link.cluster));
    }
    ipcRenderer.send('update-link-visibilities', session.data.links.map(l => l.visible));
  }

  function setupNetwork(){
    session.network = {};
    let width = $(window).width(),
        height = $(window).height(),
        xScale = d3.scaleLinear().domain([0, width]).range([0, width]),
        yScale = d3.scaleLinear().domain([0, height]).range([0, height]);

    session.network.zoom = d3.zoom().on('zoom', () => session.network.svg.attr('transform', d3.event.transform));

    session.network.svg = d3.select('svg')
      .on('click', hideContextMenu)
      .html('') //Let's make sure the canvas is blank.
      .call(session.network.zoom)
      .append('g');

    session.network.fit = function(bounds){
      if(!bounds) bounds = session.network.svg.node().getBBox();
      if (bounds.width == 0 || bounds.height == 0) return; // nothing to fit
      let parent = session.network.svg.node().parentElement,
          midX = bounds.x + bounds.width / 2,
          midY = bounds.y + bounds.height / 2;
      let scale = 0.95 / Math.max(bounds.width / parent.clientWidth, bounds.height / parent.clientHeight);
      d3.select('svg')
        .transition()
        .duration(750)
        .call(session.network.zoom.transform, d3.zoomIdentity
          .translate(parent.clientWidth / 2 - scale * midX, parent.clientHeight / 2 - scale * midY)
          .scale(scale));
    };

    session.network.force = d3.forceSimulation()
      .force('link', d3.forceLink()
        .id(d => d.id)
        .distance($('#default-link-length').val())
        .strength(0.125)
      )
      .force('charge', d3.forceManyBody()
        .strength(-$('#default-node-charge').val())
      )
      .force('gravity', forceAttract()
        .target([width/2, height/2])
        .strength($('#network-gravity').val())
      )
      .force('center', d3.forceCenter(width / 2, height / 2));

    session.network.force.on('end', e => {
      $('#playbutton').data('state', 'paused').html('<i class="fa fa-play" aria-hidden="true"></i>');
    });

    session.network.svg.append('svg:defs').append('marker')
      .attr('id', 'end-arrow')
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 20)
      .attr('refY', 5)
      .attr('markerWidth', 4)
      .attr('markerHeight', 4)
      .attr('orient', 'auto')
      .append('svg:path')
        .attr('d', 'M0,0 L0,10 L10,5 z');

    session.network.svg.append('g').attr('id', 'links');
    session.network.svg.append('g').attr('id', 'nodes');
  }

  function getVLinks(){
    let vlinks = _.cloneDeep(session.data.links.filter(link => link.visible));
    let output = [];
    let n = vlinks.length;
    for(let i = 0; i < n; i++){
      vlinks[i].origin.forEach((o, j, l) => {
        output.push(Object.assign({}, vlinks[i], {
          origin: o,
          oNum: j,
          origins: l.length,
          source: session.data.nodes.find(d => d.id == vlinks[i].source),
          target: session.data.nodes.find(d => d.id == vlinks[i].target)
        }));
      });
    }
    return output;
  }

  function renderNetwork(){
    let vlinks = getVLinks();

    // Links are considerably simpler.
    let link = d3.select('g#links').selectAll('line').data(vlinks);
    link.exit().remove();
    link.enter().append('line')
      .attr('stroke', $('#default-link-color').val())
      .attr('stroke-width', $('#default-link-width').val())
      .attr('opacity', $('#default-link-opacity').val())
      .on('mouseenter', showLinkToolTip)
      .on('mouseout', hideTooltip);

    setLinkColor();
    scaleLinkThing($('#default-link-opacity').val(), $('#linkOpacityVariable').val(), 'opacity', .1);
    scaleLinkThing($('#default-link-width').val(),   $('#linkWidthVariable').val(),  'stroke-width');

    let vnodes = session.data.nodes.filter(node => node.visible);

    //OK, this is a little bit of expert-level D3 voodoo that deserves some explanation.
    let node = d3.select('g#nodes').selectAll('g.node').data(vnodes);
    node.exit().remove(); //Removing nodes with no representation in the dataset.
    node = node.enter().append('g').attr('class', 'node').attr('tabindex', '0') //Adding nodes that weren't represented in the dataset before.
      .call(d3.drag() //A bunch of mouse handlers.
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended))
      .on('mouseenter focusin', showNodeToolTip)
      .on('mouseout focusout', hideTooltip)
      .on('contextmenu', showContextMenu)
      .on('click', clickHandler)
      .on('keydown', n => {
        if(d3.event.code === 'Space') clickHandler(n);
        if(d3.event.shiftKey && d3.event.key === 'F10') showContextMenu(n);
      });

    // What's this?
    node.append('path'); // Adding a path?
    node.append('text'); // And a text? Wouldn't those already be attached to the nodes?
    // Well, they would for nodes that already existed. The wouldn't for new nodes.
    // And until we merge the old and new nodes, `node` refers only to the *added* nodes.
    // Speaking of merging...
    node = node.merge(node);
    // E voila! node now refers to all the g.node elements in the network,
    // and they all have path and text elements, so we can confidently...
    node.select('path').attr('fill', $('#default-node-color').val());
    // And style them according to the DOM State instructions.
    redrawNodes();
    // And append our label text, too!
    node.select('text')
      .attr('dy', 5)
      .attr('dx', 8);

    let pb = $('#playbutton'),
        allLinks = d3.select('g#links').selectAll('line'),
        allNodes = d3.select('g#nodes').selectAll('g.node');

    session.network.force.nodes(vnodes).on('tick', () => {
      allLinks
        .attr('x1', l => l.source.x)
        .attr('y1', l => l.source.y)
        .attr('x2', l => l.target.x)
        .attr('y2', l => l.target.y);
      allNodes
        .attr('transform', d => {
          if(d.fixed){
            return 'translate(' + d.fx + ', ' + d.fy + ')';
          } else {
            return 'translate(' + d.x + ', ' + d.y + ')';
          }
        });
      if(pb.data('state', 'paused')){
        pb.data('state', 'playing')
          .html('<i class="fa fa-pause" aria-hidden="true"></i>');
      }
    });

    session.network.force.force('link').links(vlinks);
  }

  ipcRenderer.on('update-node-selections', (e, selections) => {
    let i = 0, n = session.data.nodes.length;
    for(i; i < n; i++) session.data.nodes[i].selected = selections[i];
    d3.select('g#nodes').selectAll('g.node').data(session.data.nodes).select('path').classed('selected', d => d.selected);
    updateStatistics();
  });

  function dragstarted(d) {
    if (!d3.event.active) session.network.force.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(d) {
    d.fx = d3.event.x;
    d.fy = d3.event.y;
  }

  function dragended(d) {
    if (!d3.event.active) session.network.force.alphaTarget(0);
    if(!d.fixed){
      d.fx = null;
      d.fy = null;
    }
  }

  function clickHandler(n){
    if(d3.event.shiftKey){
      n.selected = !n.selected;
    } else {
      let selected = session.data.nodes.filter(node => node.selected);
      if(selected.find(d => d.id === n.id)){
        session.data.nodes.forEach(d => d.selected = false);
      } else {
        session.data.nodes.forEach(d => d.selected = (d.id === n.id));
      }
    }
    ipcRenderer.send('update-node-selections', session.data.nodes.map(d => d.selected));
    d3.select('g#nodes').selectAll('g.node').data(session.data.nodes).select('path').classed('selected', d => d.selected);
    $('#numberOfSelectedNodes').text(session.data.nodes.filter(d => d.selected).length.toLocaleString());
  }

  function showContextMenu(d){
    d3.event.preventDefault();
    hideTooltip();
    d3.select('#viewAttributes').on('click', e => {
      showAttributeModal(d);
    }).node().focus();
    d3.select('#copyID').on('click', e => {
      clipboard.writeText(d.id);
      hideContextMenu();
    });
    d3.select('#copySeq').on('click', e => {
      clipboard.writeText(d.seq);
      hideContextMenu();
    });
    if(d.fixed){
      $('#pinNode').text('Unpin Node').click(e => {
        d.fx = null;
        d.fy = null;
        d.fixed = false;
        session.network.force.alpha(0.3).alphaTarget(0).restart();
        hideContextMenu();
      });
    } else {
      $('#pinNode').text('Pin Node').click(e => {
        d.fx = d.x;
        d.fy = d.y;
        d.fixed = true;
        hideContextMenu();
      });
    }
    $('#hideCluster').click(e => {
      session.state.visible_clusters = session.state.visible_clusters.filter(cid => cid !== d.cluster);
      setLinkVisibility();
      setNodeVisibility();
      renderNetwork();
      session.network.force.alpha(0.3).alphaTarget(0).restart();
      hideContextMenu();
    });
    if(session.state.visible_clusters < session.data.clusters.length){
      $('#isolateCluster').text('De-isolate Cluster').click(e => {
        session.state.visible_clusters = session.data.clusters.map(c => c.id);
        setNodeVisibility();
        setLinkVisibility();
        renderNetwork();
        session.network.force.alpha(0.3).alphaTarget(0).restart();
        hideContextMenu();
      });
    } else {
      $('#isolateCluster').text('Isolate Cluster').click(e => {
        session.state.visible_clusters = [d.cluster];
        setLinkVisibility();
        setNodeVisibility();
        renderNetwork();
        session.network.force.alpha(0.3).alphaTarget(0).restart();
        hideContextMenu();
      });
    }
    d3.select('#contextmenu')
      .style('left', (d3.event.pageX) + 'px')
      .style('top', (d3.event.pageY) + 'px')
      .style('opacity', 1);
  }

  function hideContextMenu(){
    let menu = d3.select('#contextmenu');
    menu
      .transition().duration(100)
      .style('opacity', 0)
      .on('end', () =>  menu.style('right', '0px').style('top', '0px'));
  }

  function showAttributeModal(d){
    let target = $('#attributeModal tbody').empty();
    for(const attribute in d){
      target.append('<tr><td><strong>' + attribute + '</strong></td><td>' + d[attribute] + '</td></tr>');
    }
    $('#attributeModal').modal('show');
    hideContextMenu();
  }

  function showNodeToolTip(d){
    if($('#nodeTooltipVariable').val() === 'none') return;
    d3.select('#tooltip')
      .html(d[$('#nodeTooltipVariable').val()])
      .style('left', (d3.event.pageX + 8) + 'px')
      .style('top', (d3.event.pageY - 28) + 'px')
      .transition().duration(100)
      .style('opacity', 1);
  }

  function showLinkToolTip(d){
    let v = $('#linkTooltipVariable').val();
    if(v === 'none') return;
    d3.select('#tooltip')
      .html((v === 'source' || v === 'target') ? d[v].id : d[v])
      .style('left', (d3.event.pageX + 8) + 'px')
      .style('top', (d3.event.pageY - 28) + 'px')
      .transition().duration(100)
      .style('opacity', 1);
  }

  function hideTooltip(){
    let tooltip = d3.select('#tooltip');
    tooltip
      .transition().duration(100)
      .style('opacity', 0)
      .on('end', () => tooltip.style('left', '-40px').style('top', '-40px'));
  }

  function redrawNodes(){
    //Things to track in the function:
    //* Symbols:
    let type = d3[$('#default-node-symbol').val()];
    let symbolVariable = $('#nodeSymbolVariable').val();
    let o = (b => d3[$('#default-node-symbol').val()]);
    if(symbolVariable !== 'none'){
      let map = {};
      let values = Lazy(session.data.nodes).pluck(symbolVariable).uniq().sort().toArray();
      $('#nodeShapes select').each(function(i, el){
        map[values[i]] = $(this).val();
      });
      o = (v => map[v]);
    }
    //* Sizes:
    let defaultSize = $('#default-node-radius').val();
    let size = defaultSize;
    let sizeVariable = $('#nodeRadiusVariable').val();
    if(sizeVariable !== 'none'){
      let values = Lazy(session.data.nodes).pluck(sizeVariable).without(undefined);
      var min = values.min();
      var max = values.max();
      var oldrng = max - min;
      var med = oldrng / 2;
    }
    let vnodes = session.data.nodes.filter(n => n.visible);
    let nodes = session.network.svg.select('g#nodes').selectAll('g.node').data(vnodes);
    nodes.select('path').each(function(d){
      if(symbolVariable !== 'none'){
        type = d3[o(d[$('#nodeSymbolVariable').val()])];
      }
      if(sizeVariable !== 'none'){
        size = med;
        if(typeof d[sizeVariable] !== 'undefined'){
          size = d[sizeVariable];
        }
        size = (size - min + 1) / oldrng
        size = size * size * defaultSize;
      }
      d3.select(this).attr('d', d3.symbol()
        .size(size)
        .type(type));
    });
    //* Labels:
    let labelVar = $('#nodeLabelVariable').val();
    nodes.select('text').text(n => n[labelVar]);
  }

  $('#nodeLabelVariable').change(e => {
    if(e.target.value === 'none'){
      session.network.svg.select('g#nodes').selectAll('g.node')
        .select('text').text('');
    } else {
      session.network.svg.select('g#nodes').selectAll('g.node').data(session.data.nodes.filter(n => n.visible))
        .select('text').text(d => d[e.target.value]);
    }
  });

  $('#default-node-symbol').on('input', redrawNodes);
  $('#nodeSymbolVariable').change(e => {
    $('#default-node-symbol').fadeOut();
    $('#nodeShapes').fadeOut(function(){$(this).remove()});
    let table = $('<tbody id="nodeShapes"></tbody>').appendTo('#groupKey');
    if(e.target.value === 'none'){
      redrawNodes();
      $('#default-node-symbol').fadeIn();
      return table.fadeOut(e => table.remove());
    }
    table.append('<tr><th>'+e.target.value+'</th><th>Shape</th><tr>');
    let values = Lazy(session.data.nodes).pluck(e.target.value).uniq().sort().toArray();
    let symbolKeys = ['symbolCircle', 'symbolCross', 'symbolDiamond', 'symbolSquare', 'symbolStar', 'symbolTriangle', 'symbolWye'].concat(Object.keys(extraSymbols));
    let o = d3.scaleOrdinal(symbolKeys).domain(values);
    let options = $('#default-node-symbol').html();
    values.forEach(v => {
      let selector = $('<select></select>').append(options).val(o(v)).change(redrawNodes);
      let cell = $('<td></td>').append(selector);
      let row = $('<tr><td>' + v + '</td></tr>').append(cell);
      table.append(row);
    });
    redrawNodes();
    table.fadeIn();
  });

  $('#default-node-radius').on('input', redrawNodes);
  $('#nodeRadiusVariable').change(redrawNodes);

  function scaleNodeOpacity(){
    let scalar = $('#default-node-opacity').val();
    let variable = $('#nodeOpacityVariable').val();
    let circles = session.network.svg.select('g#nodes').selectAll('g.node').data(session.data.nodes).select('path');
    if(variable === 'none'){
      return circles.attr('opacity', scalar);
    }
    let values = Lazy(session.data.nodes).pluck(variable).without(undefined);
    let min = values.min();
    let max = values.max();
    let rng = max - min;
    let med = rng / 2 + min;
    circles.attr('opacity', d => {
      let v = d[variable];
      if(typeof v === 'undefined') v = med;
      return scalar * (v - min) / rng + 0.1;
    });
  }

  $('#default-node-opacity').on('input', scaleNodeOpacity);
  $('#nodeOpacityVariable').change(scaleNodeOpacity);

  $('#default-node-color').on('input', e => session.network.svg.select('g#nodes').selectAll('g.node').select('path').attr('fill', e.target.value));
  $('#nodeColorVariable').change(e => {
    $('#default-node-color').fadeOut();
    let circles = session.network.svg.select('g#nodes').selectAll('g.node').data(session.data.nodes).select('path');
    $('#nodeColors').fadeOut(function(){$(this).remove()});
    let table = $('<tbody id="nodeColors"></tbody>').appendTo('#groupKey');
    if(e.target.value == 'none'){
      circles.attr('fill', $('#default-node-color').val());
      $('#default-node-color').fadeIn();
      table.fadeOut();
      return;
    }
    table.append('<tr><th>'+e.target.value+'</th><th>Color</th><tr>');
    let values = Lazy(session.data.nodes).pluck(e.target.value).uniq().sortBy().toArray();
    let o = d3.scaleOrdinal(session.style.nodecolors).domain(values);
    circles.attr('fill', d => o(d[e.target.value]));
    values.forEach((value, i) => {
      let input = $(`<input type="color" value="${o(value)}" data-num="${i}" />`)
        .on('input', function(evt){
          circles
            .filter(d => d[e.target.value] == value)
            .attr('fill', d => evt.target.value);
          session.style.nodecolors[$(this).data('num')] = evt.target.value;
          ipcRenderer.send('update-style', session.style);
        });
      let cell = $('<td></td>').append(input);
      let row = $(`<tr><td>${value}</td></tr>`).append(cell);
      table.append(row);
    });
    table.fadeIn();
  });

  $('#default-node-charge').on('input', e => {
    session.network.force.force('charge').strength(-e.target.value);
    session.network.force.alpha(0.3).alphaTarget(0).restart();
  });

  $('#DirectedLinks').parent().click(e => {
    session.network.svg.select('g#links').selectAll('line').attr('marker-end', 'url(#end-arrow)');
  });

  $('#UndirectedLinks').parent().click(e => {
    session.network.svg.select('g#links').selectAll('line').attr('marker-end', null);
  });

  $('#default-link-length').on('input', e => {
    session.network.force.force('link').distance(e.target.value);
    session.network.force.alpha(0.3).alphaTarget(0).restart();
  });

  function setLinkColor(e){
    let variable = $('#linkColorVariable').val();
    if(variable == 'none'){
      session.network.svg.select('g#links').selectAll('line').style('stroke', $('#default-link-color').val());
      $('#default-link-color').fadeIn();
      $('#linkColors').fadeOut();
      return;
    }
    $('#default-link-color').fadeOut();
    let vlinks = getVLinks();
    let links = session.network.svg.select('g#links').selectAll('line').data(vlinks);
    $('#linkColors').remove();
    let table = $('<tbody id="linkColors"></tbody>').appendTo('#groupKey');
    table.append('<tr><th>'+variable+'</th><th>Color</th><tr>');
    let values = Lazy(vlinks).pluck(variable).uniq().sort().toArray();
    let o = d3.scaleOrdinal(session.style.linkcolors).domain(values);
    links
      .style('stroke', d => o(d[variable]))
      .attr('stroke-dasharray', l => {
        let out = new Array(l.origins * 2);
        let ofs = new Array(l.origins).fill(1);
        let ons = new Array(l.origins).fill(0);
        ons[l.oNum] = 1;
        ofs[l.oNum] = 0;
        for(let i = 0; i < l.origins; i++){
          out[2*i] = ons[i];
          out[2*i + 1] = ofs[i];
        }
        return math.multiply(out, 6).join(', ');
      });
    values.forEach((value, i) => {
      let input = $(`<input type="color" name="${value}-node-color-setter" value="${o(value)}" data-num="${i}" />`)
        .on('input', function(evt){
          links
            .filter(d => d[variable] === value)
            .style('stroke', d => evt.target.value);
          session.style.linkcolors[$(this).data('num')] = evt.target.value;
          ipcRenderer.send('update-style', session.style);
        });
      let cell = $('<td></td>').append(input);
      let row = $('<tr><td>'+value+'</td></tr>').append(cell);
      table.append(row);
    });
    table.fadeIn();
  }

  $('#default-link-color').on('input', setLinkColor);
  $('#linkColorVariable').change(setLinkColor);

  function scaleLinkThing(scalar, variable, attribute, floor){
    let vlinks = getVLinks();
    let links = session.network.svg.select('g#links').selectAll('line').data(vlinks);
    if(variable === 'none'){
      return links.attr(attribute, scalar);
    }
    if(!floor){floor = 1;}
    let values = Lazy(session.data.links).pluck(variable).without(undefined);
    let min = values.min();
    let max = values.max();
    let rng = max - min;
    let recip = $('#reciprocal-link-width').is(':checked');
    links.attr(attribute, d => {
      let v = d[variable];
      if(typeof v === 'undefined') v = rng / 2 + min;
      if(recip && attribute == 'stroke-width'){
        return scalar * (1 - (v - min) / rng) + floor;
      }
      return scalar * (v - min) / rng + floor;
    });
  }

  $('#default-link-opacity').on('input', e => scaleLinkThing($('#default-link-opacity').val(), $('#linkOpacityVariable').val(), 'opacity', .1));
  $('#linkOpacityVariable').change(e => scaleLinkThing($('#default-link-opacity').val(), $('#linkOpacityVariable').val(), 'opacity', .1));

  $('#default-link-width').on('input', e => scaleLinkThing($('#default-link-width').val(), $('#linkWidthVariable').val(), 'stroke-width'));
  $('#linkWidthVariable, #reciprocal-link-width').change(e => scaleLinkThing($('#default-link-width').val(), $('#linkWidthVariable').val(), 'stroke-width'));

  $('#linkSortVariable').on('change', e => {
    if(e.target.value === 'none'){
      $('#computeMST').fadeOut();
      $('#default-link-threshold').css('visibility', 'hidden');
    } else {
      $('#default-link-threshold').attr('max', math.max(session.data.links.map(l => l.distance)));
      $('#computeMST').css('display', 'inline-block');
      $('#default-link-threshold').css('visibility', 'visible');
    }
  });

  $('#default-link-threshold').on('input', e => {
    setLinkVisibility();
    tagClusters();
    setNodeVisibility();
    renderNetwork();
    computeDegree();
    updateStatistics();
    session.network.force.alpha(0.3).alphaTarget(0).restart();
  });

  $('#computeMST').click(e => {
    ipcRenderer.send('compute-mst');
    $('.showForNotMST').fadeOut();
  });

  ipcRenderer.on('update-links-mst', (e, msts) => {
    let n = msts.length;
    for(let i = 0; i < n; i++) session.data.links[i].mst = msts[i];
    $('.showForMST').css('opacity', 0).css('display', 'inline-block').animate({'opacity': 1});
  });

  $('#showMSTLinks, #showAllLinks').change(e => {
    setLinkVisibility();
    tagClusters();
    setNodeVisibility();
    renderNetwork();
    computeDegree();
    updateStatistics();
    session.network.force.alpha(0.3).alphaTarget(0).restart();
  });

  $('#ShowSingletons, #HideSingletons').change(e => {
    tagClusters();
    setNodeVisibility();
    renderNetwork();
    computeDegree();
    updateStatistics();
    session.network.force.alpha(0.3).alphaTarget(0).restart();
  });

  ipcRenderer.on('update-link-visibilities', (e, visibilities) => {
    let n = session.data.links.length;
    if(visibilities.length !== n) alertify.error('Update Link Visibilities Error: Length Mismatch');
    for(let i = 0; i < n; i++) session.data.links[i].visible = visibilities[i];
    tagClusters();
    setNodeVisibility();
    renderNetwork();
    computeDegree();
    updateStatistics();
    session.network.force.alpha(0.3).alphaTarget(0).restart();
  });

  ipcRenderer.on('set-tree', (e, tree) => session.data.tree = tree);

  ipcRenderer.on('update-style', (e, style) => {
    session.style = style;
    restyle();
  });

  function restyle(){
    redrawNodes();
    setLinkColor();
    $('#main_panel').css('background-color', session.style.background);
    $('#network-color').val(session.style.background);
  }

  $('#hideNetworkStatistics').parent().click(() => $('#networkStatistics').fadeOut());

  $('#showNetworkStatistics').parent().click(() => {
    updateStatistics();
    $('#networkStatistics').fadeIn();
  });

  $('#network-friction').on('input', e => {
    session.network.force.velocityDecay(e.target.value);
    session.network.force.alpha(0.3).alphaTarget(0).restart();
  });

  $('#network-gravity').on('input', e => {
    session.network.force.force('gravity').strength(e.target.value);
    session.network.force.alpha(0.3).alphaTarget(0).restart();
  });

  $('#main_panel').css('background-color', $('#network-color').val());

  $('#network-color').on('input', e => {
    session.style.background = e.target.value;
    $('#main_panel').css('background-color', session.style.background);
    ipcRenderer.send('update-style', session.style);
  });

  $('#faster').click(e => {
    session.state.alpha += 0.2;
    session.network.force.alphaTarget(session.state.alpha).restart();
  });

  $('#slower').click(e => {
    session.state.alpha = Math.max(session.state.alpha - 0.2, 0.1);
    session.network.force.alphaTarget(session.state.alpha).restart();
  });

  $('#playbutton')
    .data('state', 'paused')
    .click(function(e){
      if($(this).data('state') === 'paused'){
        $(this).data('state', 'playing')
          .html('<i class="fa fa-pause" aria-hidden="true"></i>');
        session.network.force.alphaTarget(session.state.alpha).restart();
      } else {
        $(this).data('state', 'paused')
          .html('<i class="fa fa-play" aria-hidden="true"></i>');
        session.network.force.alpha(0).alphaTarget(0);
      }
    });

  $('#search').on('input', e => {
    if(e.target.value === '') {
      session.data.nodes.forEach(n => n.selected = false);
    } else {
      session.data.nodes.forEach(n => n.selected = (n.id.indexOf(e.target.value)>-1));
      if(session.data.nodes.filter(n => n.selected).length === 0) alertify.warning('No matches!');
    }
    d3.select('g#nodes')
      .selectAll('g.node')
      .select('path')
      .data(session.data.nodes)
      .classed('selected', d => d.selected);
    ipcRenderer.send('update-node-selections', session.data.nodes.map(d => d.selected));
    $('#numberOfSelectedNodes').text(session.data.nodes.filter(d => d.selected).length.toLocaleString());
  });

  $('[data-toggle="tooltip"]').tooltip();

  $('#CloseTab, #ReloadTab').remove();

});
