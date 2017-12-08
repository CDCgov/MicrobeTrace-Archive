import { clipboard, remote, ipcRenderer } from 'electron';
import Lazy from 'lazy.js';
import math from 'bettermath';
import jetpack from 'fs-jetpack';
import './helpers/window.js';

import d3 from 'd3';
const extraSymbols = require('d3-symbol-extra');
Object.assign(d3, extraSymbols); //d3-symbol-extra doesn't automatically write to d3
d3.symbols.concat(Object.values(extraSymbols)); //update the list of available symbols
import { forceAttract } from 'd3-force-attract';

window.jquery = window.jQuery = window.$ = require('jquery');
require('bootstrap');

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
}

$(function(){

  ipcRenderer.on('deliver-manifest', (e, manifest) => {
    $('title').text(manifest.productName + ' v' + manifest.version);
    $('.title').text(manifest.productName);
  });
  ipcRenderer.send('get-manifest');

  // We're going to use this function in a variety of contexts. It's purpose is
  // to restore the app to the state it was in when launched.
  // The argument indicates whether the contents of the file inputs should be
  // flushed. Obviously, this should not happen when the fileinput change
  // callbacks invoke this function.
  function reset(soft){
    if(!soft){
      window.session = dataSkeleton();
      $('#fileTable').empty();
      ipcRenderer.send('reset');
      $('#main-submit').hide();
    }
    $('#button-wrapper, #main_panel').fadeOut(() => {
      $('#network').empty();
      $('#groupKey').find('tbody').empty();
      $('.showForMST').hide();
      $('.progress-bar').css('width', '0%').attr('aria-valuenow', 0);
      $('.showForNotMST').css('display', 'inline-block');
      $('#loadingInformation').empty();
      $('#FileTab', '#ExportHIVTraceTab', '#ExportTab', '#ScreenshotTab', '#VectorTab', '#TableTab, #FlowTab, #SequencesTab, #HistogramTab, #MapTab, #SettingsTab').addClass('disabled');
      $('#file_panel').fadeIn();
    });
  }

  $('body').prepend(ipcRenderer.sendSync('get-component', 'nav.html'));
  //Since the navbar is a reused component, we can only change it per view by injecting elements, like so:
  $('#FileTab').click(() => reset());

  $('body').append(ipcRenderer.sendSync('get-component', 'exportRasterImage.html'));
  $('body').append(ipcRenderer.sendSync('get-component', 'exportVectorImage.html'));

  $('<li id="ExportHIVTraceTab"><a href="#">Export HIVTRACE File</a></li>').click(() => {
    remote.dialog.showSaveDialog({
      filters: [
        {name: 'JSON', extensions: ['json']}
      ]
    }, (fileName) => {
      if (fileName === undefined){
        return alertify.error('File not exported!');
      }
      jetpack.write(fileName, JSON.stringify({
        trace_results: {
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
    });
  })//.insertAfter('#FileTab');

  $('<li id="ExportTab"><a href="#">Export Data</a></li>').click(e => {
    remote.dialog.showSaveDialog({
      filters: [
        {name: 'FASTA', extensions: ['fas', 'fasta']},
        {name: 'MEGA', extensions: ['meg', 'mega']}
      ]
    }, fileName => {
      if (fileName === undefined){
        return alertify.error('File not exported!');
      }
      let extension = fileName.split('.').pop();
      if(extension === 'fas' || extension === 'fasta'){
        jetpack.write(fileName, session.data.nodes.map(n => '>'+n.id+'\n'+n.seq).join('\n'));
      } else {
        jetpack.write(fileName, '#MEGA\nTitle: '+fileName+'\n\n'+session.data.nodes.map(n => '#'+n.id+'\n'+n.seq).join('\n'));
      }
      alertify.success('File Saved!');
    });
  }).insertAfter('#FileTab');

  $('<li role="separator" class="divider"></li>').insertAfter('#FileTab');

  $('<li id="AddDataTab"><a href="#">Add Data</a></li>').click(reset).insertAfter('#FileTab');

  $('body').append(ipcRenderer.sendSync('get-component', 'search.html'));
  $('#searchBox').hide();

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
          let root = $('<div class="row" style="display:none; margin:2px auto;"></div>');
          $('<div class="col-xs-3 filename"></div>')
            .append($('<a href="#" class="fa fa-times killlink"></a>').click(e => {
              session.files.splice(session.files.indexOf(path),1);
              root.slideUp(e => root.remove());
            }))
            .append(' ' + filename)
            .appendTo(root);
          root.append(`
            <div class="col-xs-3 text-right">
              <div class="btn-group btn-group-xs" data-toggle="buttons">
                <label class="btn btn-primary${!isFasta&!isNode?' active':''}">
                  <input type="radio" name="options-${filename}" data-state="link" autocomplete="off"${!isFasta&!isNode?' checked':''}>Link</input>
                </label>
                <label class="btn btn-primary${!isFasta&isNode?' active':''}">
                  <input type="radio" name="options-${filename}" data-state="node" autocomplete="off"${!isFasta&isNode?' checked':''}>Node</input>
                </label>
                <label class="btn btn-primary">
                  <input type="radio" name="options-${filename}" data-state="distmat" autocomplete="off">Dist. Mat.</input>
                </label>
                <label class="btn btn-primary${isFasta?' active':''}">
                  <input type="radio" name="options-${filename}" data-state="fasta" autocomplete="off"${isFasta?' checked':''}>FASTA</input>
                </label>
              </div>
            </div>
          `);
          let data = '', options = '', headers = [];
          let stream = jetpack.createReadStream(path);
          stream.on('data', chunk => {
            data += chunk;
            if(chunk.includes('\n')){
              headers = data.substring(0, data.indexOf('\n')).split(',').map(h => {
                if(['"', "'"].includes(h[0])) h = h.substring(1, h.length-1);
                return h;
              });
              options = '<option>None</option>' + headers.map(h => '<option>'+h+'</option>').join('');
              root.append(`
                <div class='col-xs-3 text-right'${isFasta?' style="display: none;"':''} data-file='${filename}'>
                  <label>${isNode?'ID':'Source'}</label>&nbsp;<select>${options}</select>
                </div>
                <div class='col-xs-3 text-right'${isFasta?' style="display: none;"':''} data-file='${filename}'>
                  <label>${isNode?'Sequence':'Target'}</label>&nbsp;<select>${options}</select>
                </div>
              `);
              stream.pause();
            }
          });
          root.appendTo('#fileTable').slideDown();
          let refit = function(e){
            let these = $(`[data-file='${filename}']`),
                first = $(these.get(0)),
                second = $(these.get(1));
            if($(e.target).data('state') === 'node'){
              first.find('label').text('ID');
              if(headers.includes('id')) first.find('select').val('id');
              second.find('label').text('Sequence');
              if(headers.includes('seq')) second.find('select').val('seq');
              these.fadeIn();
            } else if($(e.target).data('state') === 'link'){
              first.find('label').text('Source');
              if(headers.includes('source')) first.find('select').val('source');
              second.find('label').text('Target');
              if(headers.includes('target')) second.find('select').val('target');
              these.fadeIn();
            } else {
              these.fadeOut();
            }
          };
          $(`[name="options-${filename}"]`).change(refit);
          refit({target: $('[name="options-'+filename+'"]:checked')[0]});
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

  $('#main-submit').click(function(e){
    let files = [];
    $('#fileTable .row').each((i, el) => {
      files[i] = {
        path: session.files[i],
        type: $(el).find('input[type="radio"]:checked').data('state'),
        field1: $(el).find('select:first').val(),
        field2: $(el).find('select:last').val()
      };
    });

    ipcRenderer.send('parse-files', {
      files: files,
      align: $('#align').is(':checked'),
      reference: $('#reference').text()
    });

    $('#file_panel').fadeOut(() => {
      $('#button-wrapper, #main_panel').fadeIn(() => {
        $('#loadingInformationModal').modal({
          keyboard: false,
          backdrop: 'static'
        });
      });
    });
  });

  ipcRenderer.on('tick', (event, msg) => $('.progress-bar').css('width', msg+'%').attr('aria-valuenow', msg));

  ipcRenderer.on('message', (event, msg) => {
    session.messages.push(msg);
    $('#loadingInformation').html(session.messages.join('<br />'));
  });

  ipcRenderer.on('deliver-data', (e, data) => {
    $('#FileTab', '#ExportHIVTraceTab', '#ExportTab', '#ScreenshotTab', '#VectorTab', '#TableTab, #FlowTab, #SequencesTab, #HistogramTab, #MapTab, #SettingsTab').removeClass('disabled');
    session.data = data;
    session.data.links.forEach(l => {
      l.source = session.data.nodes.find(d => d.id === l.source);
      l.target = session.data.nodes.find(d => d.id === l.target);
    });
    updateNodeVariables();
    updateLinkVariables();
    setNodeVisibility();
    setLinkVisibility();
    setupNetwork();
    renderNetwork();
    tagClusters();
    computeDegree();
    session.state.visible_clusters = session.data.clusters.map(c => c.id);
    updateStatistics();
    $('.hidden').removeClass('hidden');
    setTimeout(e => {
      session.network.fit();
      $('#loadingInformationModal').modal('hide');
    }, 1500);
  });

  function updateNodeVariables(){
    let keys = Object.keys(session.data.nodes[0]);
    $('.nodeVariables.categorical').html(
      '<option value="none">None</option>\n' +
      keys
        .map(key => '<option value="' + key + '">' + key + '</option>')
        .join('\n')
    );
    $('.nodeVariables.numeric').html(
      '<option value="none">None</option>\n' +
      keys
        .filter(key => math.isNumber(session.data.nodes[0][key]))
        .map(key => '<option value="' + key + '">' + key + '</option>')
        .join('\n')
    );
    if(keys.includes('id')) $('#nodeTooltipVariable').val('id');
  }

  function updateLinkVariables(){
    let keys = Object.keys(session.data.links[0]);
    $('.linkVariables').html(
      '<option value="none">None</option>\n' +
      keys
        .map(key => '<option value="' + key + '">' + key + '</option>')
        .join('\n')
    );
    $('.linkVariables.numeric').html(
      '<option value="none">None</option>\n' +
      keys
        .filter(key => math.isNumber(session.data.links[0][key]))
        .map(key => '<option value="' + key + '">' + key + '</option>')
        .join('\n')
    );
    if(keys.includes('distance')){
      $('#linkSortVariable').val('distance');
      $('#default-link-threshold').css('visibility', 'visible');
    }
  }

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
    ipcRenderer.send('update-node-cluster', session.data.nodes);
  }

  function DFS(node){
    if(typeof node.cluster !== 'undefined') return;
    let lsv = $('#linkSortVariable').val();
    node.cluster = session.data.clusters.length;
    session.data.clusters[session.data.clusters.length - 1].nodes++;
    session.data.links.forEach(l => {
      if(l.visible && (l.source.id == node.id || l.target.id == node.id)){
        l.cluster = session.data.clusters.length;
        session.data.clusters[session.data.clusters.length - 1].links++;
        session.data.clusters[session.data.clusters.length - 1].sum_distances += l[lsv];
        if(!l.source.cluster) DFS(l.source);
        if(!l.target.cluster) DFS(l.target);
      }
    });
  }

  function computeDegree(){
    session.data.nodes.forEach(d => d.degree = 0);
    session.data.links
      .filter(l => l.visible)
      .forEach(l => {
        l.source.degree++;
        l.target.degree++;
      });
    session.data.clusters.forEach(c => {
      c.links = c.links/2;
      c.links_per_node = c.links/c.nodes;
      c.mean_genetic_distance = c.sum_distances/c.links;
    });
    ipcRenderer.send('update-clusters', session.data.clusters);
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

  function renderNetwork(){
    let vlinks = session.data.links.filter(link => link.visible);

    // Links are considerably simpler.
    let link = d3.select('g#links').selectAll('line').data(vlinks);
    link.exit().remove();
    link.enter().append('line')
      .attr('stroke', $('#default-link-color').val())
      .attr('stroke-width', $('#default-link-width').val())
      .attr('opacity', $('#default-link-opacity').val())
      .on('mouseenter', showLinkToolTip)
      .on('mouseout', hideTooltip);

    setLinkPattern();
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
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
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

    ipcRenderer.send('update-visibility', session.data);
  }

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
   if(!d3.event.shiftKey){
     session.data.nodes
       .filter(node => node !== n)
       .forEach(node => node.selected = false);
   }
   n.selected = !n.selected;
   ipcRenderer.send('update-node-selection', session.data.nodes);
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
      let values = Lazy(session.data.nodes).pluck(sizeVariable).without(undefined).uniq().sort().toArray();
      var min = math.min(values);
      var max = math.max(values);
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

  ipcRenderer.on('update-node-selection', (e, newNodes) => {
    session.data.nodes.forEach(d => d.selected = newNodes.find(e => e.id == d.id).selected);
    session.network.svg.select('g#nodes').selectAll('g.node').data(session.data.nodes).select('path').classed('selected', d => d.selected);
    $('#numberOfSelectedNodes').text(session.data.nodes.filter(d => d.selected).length.toLocaleString());
  });

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
    let values = Lazy(session.data.nodes).pluck(variable).without(undefined).sort().uniq().toArray();
    let min = math.min(values);
    let max = math.max(values);
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
    let colors = JSON.parse(ipcRenderer.sendSync('get-component', 'colors.json'));
    let o = d3.scaleOrdinal(colors).domain(values);
    circles.attr('fill', d => o(d[e.target.value]));
    values.forEach(value => {
      let input = $('<input type="color" value="'+o(value)+'" />')
        .on('input', evt => {
          circles
            .filter(d => d[e.target.value] == value)
            .attr('fill', d => evt.target.value);
        });
      let cell = $('<td></td>').append(input);
      let row = $('<tr><td>'+value+'</td></tr>').append(cell);
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

  function setLinkPattern(){
    let linkWidth = $('#default-link-width').val();
    let mappings = {
      'None': 'none',
      'Dotted': linkWidth + ',' + 2 * linkWidth,
      'Dashed': linkWidth * 5,
      'Dot-Dashed': linkWidth * 5 + ',' + linkWidth * 5 + ',' + linkWidth  + ',' + linkWidth * 5
    }
    session.network.svg.select('g#links').selectAll('line').attr('stroke-dasharray', mappings[$('#default-link-pattern').val()]);
  }

  $('#default-link-pattern').on('change', setLinkPattern);

  $('#default-link-length').on('input', e => {
    session.network.force.force('link').distance(e.target.value);
    session.network.force.alpha(0.3).alphaTarget(0).restart();
  });

  function setLinkColor(e){
    if($('#linkColorVariable').val() == 'none'){
      session.network.svg.select('g#links').selectAll('line').style('stroke', $('#default-link-color').val());
      $('#default-link-color').fadeIn();
      $('#linkColors').fadeOut();
      return;
    }
    $('#default-link-color').fadeOut();
    let links = session.network.svg.select('g#links').selectAll('line').data(session.data.links);
    $('#linkColors').remove();
    $('#groupKey').append('<tbody id="linkColors"></tbody>');
    let table = $('#linkColors');
    let variable = $('#linkColorVariable').val();
    table.append('<tr><th>'+variable+'</th><th>Color</th><tr>');
    let values = Lazy(session.data.links).pluck(variable).uniq().sort().toArray();
    let colors = JSON.parse(ipcRenderer.sendSync('get-component', 'colors.json'));
    let o = d3.scaleOrdinal(colors).domain(values);
    links.style('stroke', d => o(d[variable]));
    values.forEach(value => {
      let input = $('<input type="color" name="'+value+'-node-color-setter" value="'+o(value)+'" />')
        .on('input', evt => {
          links
            .filter(d => d[variable] === value)
            .style('stroke', d => evt.target.value);
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
    let links = session.network.svg.select('g#links').selectAll('line').data(session.data.links.filter(l => l.visible));
    if(variable === 'none'){
      return links.attr(attribute, scalar);
    }
    if(!floor){floor = 1;}
    let values = Lazy(session.data.links).pluck(variable).without(undefined).sort().uniq().toArray();
    let min = math.min(values);
    let max = math.max(values);
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
      //$('#default-link-threshold').attr('step', math.meanAbsoluteDeviation(session.data.links.map(l => l[e.target.value])));
      $('#computeMST').css('display', 'inline-block');
      $('#default-link-threshold').css('visibility', 'visible');
    }
  });

  ipcRenderer.on('update-links-mst', (event, newLinks) => {
    session.data.links.forEach(ol => {
      ol.mst = false;
      let newlink = newLinks.find(nl => nl.source == ol.source.id && nl.target == ol.target.id);
      if(typeof newlink !== "undefined"){
        ol.mst = newlink.mst;
      }
    });
    $('.showForMST').css('display', 'inline-block');
    alertify.success('MST successfully computed.', 4);
  });

  $('#computeMST').click(e => {
    ipcRenderer.send('compute-mst');
    $('.showForNotMST').fadeOut();
  });

  $('#showMSTLinks, #showAllLinks').change(e => {
    setLinkVisibility();
    tagClusters();
    if($('#HideSingletons').is(':checked')) setNodeVisibility();
    renderNetwork();
    computeDegree();
    updateStatistics();
    session.network.force.alpha(0.3).alphaTarget(0).restart();
  })

  $('#ShowSingletons, #HideSingletons').change(e => {
    tagClusters();
    setNodeVisibility();
    renderNetwork();
    computeDegree();
    updateStatistics();
    session.network.force.alpha(0.3).alphaTarget(0).restart();
  });

  $('#default-link-threshold').on('input', e => {
    setLinkVisibility();
    tagClusters();
    if($('#HideSingletons').is(':checked')) setNodeVisibility();
    renderNetwork();
    computeDegree();
    updateStatistics();
    session.network.force.alpha(0.3).alphaTarget(0).restart();
  });

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

  $('#network-color').on('input', e => $('#main_panel').css('background-color', e.target.value));

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
    ipcRenderer.send('update-node-selection', session.data.nodes);
    $('#numberOfSelectedNodes').text(session.data.nodes.filter(d => d.selected).length.toLocaleString());
  });

  $('[data-toggle="tooltip"]').tooltip();

  $(document).on('keydown', e => {
    if(e.key === 'Escape'){
      $('#searchBox').slideUp();
    }
    if(e.key === 'F5'){
      reset();
    }
    if(e.key === 'F12'){
      remote.getCurrentWindow().toggleDevTools();
    }
  });
});
