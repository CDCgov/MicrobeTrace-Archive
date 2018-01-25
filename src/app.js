import { clipboard, remote, ipcRenderer } from 'electron';
import Lazy from 'lazy.js';
import math from 'bettermath';
import jetpack from 'fs-jetpack';
import Papa from 'papaparse';
import './helpers/window.js';

const d3 = require('d3');
const extraSymbols = require('d3-symbol-extra');
Object.assign(d3, extraSymbols); //d3-symbol-extra doesn't automatically write to d3
d3.symbols.concat(Object.values(extraSymbols)); //update the list of available symbols
import { forceAttract } from 'd3-force-attract';

window.jquery = window.jQuery = window.$ = require('jquery');
require('bootstrap');

function dataSkeleton(){
  return {
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

  // We're going to use this function in a variety of contexts. It's purpose is
  // to restore the app to the state it was in when launched.
  // The argument indicates whether the contents of the file inputs should be
  // flushed. Obviously, this should not happen when the fileinput change
  // callbacks invoke this function.
  function reset(soft){
    window.app = dataSkeleton();
    function resetDom(){
      $('.showForSequence, .showForMST, .showForLinkCSV, .showForNodeFile').slideUp();
      $('#alignerColumn').removeClass('col-sm-offset-6');
      $('.progress-bar').css('width', '0%').attr('aria-valuenow', 0);
      $('#align').prop('checked', false).parent().removeClass('active');
      $('#FastaOrLinkFileName').text('').hide();
      $('#NodeCSVFileColumn, #main-submit, #NodeSequenceColumnRow').hide();
      $('#NodeCSVFile').val('');
      $('#file_panel').fadeIn();
      app.messages = [];
      $('#loadingInformation').empty();
      $('#network').empty();
      $('.showForNotMST').css('display', 'inline-block');
      $('#groupKey').find('tbody').empty();
    }
    if(soft){
      resetDom();
    } else {
      $('#FastaOrLinkFile').val('');
      $('#NodeCSVFileName').text('').hide();
      $('#FileTab', '#ExportHIVTraceTab', '#ExportTab', '#ScreenshotTab', '#VectorTab', '#TableTab, #FlowTab, #SequencesTab, #HistogramTab, #MapTab, #SettingsTab').addClass('hidden');
      $('#button-wrapper, #main_panel').fadeOut(() => resetDom());
    }
    //Trust me, this is necessary. Don't ask why.
    if(typeof app.network !== 'undefined'){
      if(app.network.force){
        app.network.force.stop();
      }
    }
    ipcRenderer.send('reset');
  }

  $('body').prepend(ipcRenderer.sendSync('get-component', 'nav.html'));
  //Since the navbar is a reused component, we can only change it per view by injecting elements, like so:
  $('#FileTab').click(() => reset());
  $('body').append(ipcRenderer.sendSync('get-component', 'exportRasterImage.html'));
  $('body').append(ipcRenderer.sendSync('get-component', 'exportVectorImage.html'));

  $('<li id="ExportHIVTraceTab" class="hidden"><a href="#">Export HIVTRACE File</a></li>').click(() => {
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
          'Cluster sizes': app.data.clusters.map(c => c.size),
          'Settings': {
            'contaminant-ids': [],
            'contaminants': 'remove',
            'edge-filtering': 'remove',
            'threshold': $('#default-link-threshold').val()
          },
          'Network Summary': {
            'Sequences used to make links': 0,
            'Clusters': app.data.clusters.length,
            'Edges': app.data.links.filter(l => l.visible).length,
            'Nodes': app.data.nodes.length
          },
          'Directed Edges': {},
          'Edges': app.data.links,
          'Nodes': app.data.nodes
        }
      }, null, 2));
      alertify.success('File Saved!');
    });
  })//.insertAfter('#FileTab');

  $('<li id="ExportTab" class="hidden"><a href="#">Export Data</a></li>').click(e => {
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
        jetpack.write(fileName, app.data.nodes.map(n => '>'+n.id+'\n'+n.seq).join('\n'));
      } else {
        jetpack.write(fileName, '#MEGA\nTitle: '+fileName+'\n\n'+app.data.nodes.map(n => '#'+n.id+'\n'+n.seq).join('\n'));
      }
      alertify.success('File Saved!');
    });
  }).insertAfter('#FileTab');

  $('<li role="separator" class="divider"></li>').insertAfter('#FileTab');

  $('body').append(ipcRenderer.sendSync('get-component', 'search.html'));
  $('#searchBox').hide();

  $('<li id="RevealAllTab" class="hidden"><a href="#">Reveal All</a></li>').click(e => {
    app.state.visible_clusters = app.data.clusters.map(c => c.id);
    $('#HideSingletons').prop('checked', false).parent().removeClass('active');
    $('#ShowSingletons').prop('checked', true).parent().addClass('active');
    setLinkVisibility();
    setNodeVisibility();
    renderNetwork();
    app.network.force.alpha(0.3).alphaTarget(0).restart();
  }).insertBefore('#SettingsTab');

  // $('<li id="ZoomToSelectedTab" class="hidden"><a href="#">Zoom To Selected</a></li>')
  //   .click(e => {
  //     let nodes = app.data.nodes.filter(d => d.selected);
  //     let maxX = math.max(nodes, 'x'),
  //         minX = math.min(nodes, 'x'),
  //         maxY = math.max(nodes, 'y'),
  //         minY = math.min(nodes, 'y');
  //     let bbox = app.network.svg.node().getBBox();
  //     app.network.fit({
  //       height: (maxY - minY) * 1.2,
  //       width:  (maxX - minX) * 1.2,
  //       x: (maxX-minX)/2 + bbox.x,
  //       y: (maxY-minY)/2 - bbox.y
  //     });
  //   })
  //   .insertBefore('#SettingsTab');

  $('<li id="ZoomToFitTab" class="hidden"><a href="#">Zoom To Fit</a></li>')
    .click(e => app.network.fit())
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

  $('#FastaOrLinkFile').change(e => {
    reset(true);

    if(e.target.files.length < 1) return

    $('#FastaOrLinkFileName').text(e.target.files[0].name).slideDown();

    if(e.target.files[0].name.slice(-3).toLowerCase() == 'csv'){
      Papa.parse(e.target.files[0], {
        header: true,
        preview: 1,
        complete: results => {
          app.data.links = results.data;
          let keys = Object.keys(app.data.links[0]);
          $('.linkVariables').html(
            keys
              .map(key => '<option value="' + key + '">' + key + '</option>')
              .join('\n')
          );
          $('#LinkSourceColumn').val(keys.includes('source') ? 'source' : keys[0]);
          $('#LinkTargetColumn').val(keys.includes('target') ? 'target' : keys[1]);
        }
      });
      $('.showForSequence').slideUp();
      $('.showForLinkCSV').slideDown();
    } else {
      $('.showForLinkCSV').slideUp();
      $('.showForSequence').slideDown();
    }

    $('#NodeCSVFile').val('');
    $('#NodeCSVFileName').text('');
    $('.showForNodeFile').slideUp();
    $('#NodeCSVFileColumn').slideDown();
    $('#main-submit').slideDown();
  });

  $('#NodeCSVFile').on('change', e => {
    if(e.target.files.length > 0){
      $('#NodeCSVFileName').text(e.target.files[0].name).slideDown();
      Papa.parse(e.target.files[0], {
        header: true,
        preview: 1,
        complete: results => {
          let keys = Object.keys(results.data[0]);
          $('.nodeVariables').html(
            keys
              .map(key => '<option value="' + key + '">' + key + '</option>')
              .join('\n')
          );
          if($('#FastaOrLinkFile')[0].files[0].name.slice(-3).toLowerCase() == 'csv'){
            $('#NodeSequenceColumn').prepend('<option selected>None</option>\n');
            $('#NodeSequenceColumnRow').slideDown();
          }
          $('#NodeIDColumn').val(keys[0]);
          $('.showForNodeFile').slideDown();
        }
      });
    } else {
      $('#NodeCSVFileName').text('');
      $('#sequenceAlignmentRow').slideUp();
      $('#NodeSequenceColumnRow').slideUp();
      $('.showForNodeFile').slideUp();
    }
  });

  $('#NodeSequenceColumn').on('change', e => {
    if(e.target.value === 'None'){
      $('.showForSequence').slideUp(e => {
        $('#alignerColumn').removeClass('col-sm-offset-6');
      });
    } else {
      $('#alignerColumn').addClass('col-sm-offset-6');
      $('.showForSequence').slideDown();
    }
  });

  $('[name="shouldAlign"]').change(e => {
    if(e.target.id == 'align'){
      $('#alignerRow').slideDown();
    } else {
      $('#alignerRow, #referenceRow').slideUp();
    }
  });

  $('#refSeqFirst').click(function(e){
    $('#referenceRow, #refSeqFile').slideUp();
    $(this).removeClass('active').attr('aria-pressed', false);
  });

  $('#refSeqPaste').click(e => {
    $('#refSeqFirst').removeClass('active').attr('aria-pressed', false);
    $('#reference').val(electron.clipboard.readText());
    $('#referenceRow').slideDown();
    $('#refSeqFile').slideUp();
  });

  $('#refSeqLoad').click(e => {
    $('#refSeqFirst').removeClass('active').attr('aria-pressed', false);
    remote.dialog.showOpenDialog({
      filters: [{name: 'FASTA Files', extensions:['fas', 'fasta', 'txt']}]
    }, paths => {
      if(paths){
        $('#refSeqFile').text(paths[0].split(/[/\\]/).pop()).slideDown();
        $('#reference').val(jetpack.read(paths[0]).split(/[\n>]/)[2]);
        $('#referenceRow').slideDown();
      }
    });
  });

  $('#main-submit').click(function(e){
    ipcRenderer.send('parse-file', {
      file: $('#FastaOrLinkFile')[0].files[0].path,
      supplement: $('#NodeCSVFile')[0].files.length > 0 ? $('#NodeCSVFile')[0].files[0].path : '',
      align: $('#align').is(':checked'),
      reference: $('#refSeqFirst').hasClass('active') ? 'first' : $('#reference').text(),
      identifierColumn: $('#NodeIDColumn').val(),
      sequenceColumn: $('#NodeSequenceColumn').val(),
      sourceColumn: $('#LinkSourceColumn').val(),
      targetColumn: $('#LinkTargetColumn').val()
    });

    $('#file_panel').fadeOut(() => {
      $('#button-wrapper, #main_panel').fadeIn(() => {
        if(!app.network){
          $('#loadingInformationModal').modal({
            keyboard: false,
            backdrop: 'static'
          });
        }
      });
    });
  });

  ipcRenderer.on('tick', (event, msg) => $('.progress-bar').css('width', msg+'%').attr('aria-valuenow', msg));

  app.messages = [];
  ipcRenderer.on('message', (event, msg) => {
    app.messages.push(msg);
    $('#loadingInformation').html(app.messages.join('<br />'));
  });

  ipcRenderer.on('deliver-data', (e, data) => {
    Object.assign(app.data, data);
    app.data.links.forEach(l => {
      l.source = app.data.nodes.find(d => d.id === l.source);
      l.target = app.data.nodes.find(d => d.id === l.target);
    });
    updateNodeVariables();
    updateLinkVariables();
    setNodeVisibility();
    setLinkVisibility();
    setupNetwork();
    renderNetwork();
    tagClusters();
    computeDegree();
    app.state.visible_clusters = app.data.clusters.map(c => c.id);
    updateStatistics();
    $('.hidden').removeClass('hidden');
    setTimeout(e => {
      app.network.fit();
      $('#loadingInformationModal').modal('hide');
    }, 1500);
  });

  function updateNodeVariables(){
    let keys = Object.keys(app.data.nodes[0]);
    $('.nodeVariables.categorical').html(
      '<option value="none">None</option>\n' +
      keys
        .map(key => '<option value="' + key + '">' + key + '</option>')
        .join('\n')
    );
    $('.nodeVariables.numeric').html(
      '<option value="none">None</option>\n' +
      keys
        .filter(key => math.isNumber(app.data.nodes[0][key]))
        .map(key => '<option value="' + key + '">' + key + '</option>')
        .join('\n')
    );
    if(keys.includes('id')) $('#nodeTooltipVariable').val('id');
  }

  function updateLinkVariables(){
    let keys = Object.keys(app.data.links[0]);
    $('.linkVariables').html(
      '<option value="none">None</option>\n' +
      keys
        .map(key => '<option value="' + key + '">' + key + '</option>')
        .join('\n')
    );
    $('.linkVariables.numeric').html(
      '<option value="none">None</option>\n' +
      keys
        .filter(key => math.isNumber(app.data.links[0][key]))
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
    let llinks = Lazy(app.data.links).filter(e => e.visible);
    let lnodes = Lazy(app.data.nodes).filter(e => e.visible);
    let singletons = lnodes.size() - llinks.pluck('source').union(llinks.pluck('target')).uniq().size();
    $('#numberOfSelectedNodes').text(lnodes.filter(d => d.selected).size().toLocaleString());
    $('#numberOfNodes').text(lnodes.size().toLocaleString());
    $('#numberOfVisibleLinks').text(llinks.size().toLocaleString());
    $('#numberOfSingletonNodes').text(singletons.toLocaleString());
    $('#numberOfDisjointComponents').text(app.data.clusters.length - singletons);
  }

  function tagClusters(){
    app.data.clusters = [];
    app.data.nodes.forEach(node => delete node.cluster);
    app.data.nodes.forEach(node => {
      if(typeof node.cluster === 'undefined'){
        app.data.clusters.push({
          index: app.data.clusters.length,
          id: app.data.clusters.length,
          nodes: 0,
          links: 0,
          sum_distances: 0,
          visible: true
        });
        DFS(node);
      }
    });
    app.state.visible_clusters = app.data.clusters.map(c => c.id);
    ipcRenderer.send('update-node-cluster', app.data.nodes);
  }

  function DFS(node){
    if(typeof node.cluster !== 'undefined') return;
    let lsv = $('#linkSortVariable').val();
    node.cluster = app.data.clusters.length;
    app.data.clusters[app.data.clusters.length - 1].nodes++;
    app.data.links.forEach(l => {
      if(l.visible && (l.source.id == node.id || l.target.id == node.id)){
        l.cluster = app.data.clusters.length;
        app.data.clusters[app.data.clusters.length - 1].links++;
        app.data.clusters[app.data.clusters.length - 1].sum_distances += l[lsv];
        if(!l.source.cluster) DFS(l.source);
        if(!l.target.cluster) DFS(l.target);
      }
    });
  }

  function computeDegree(){
    app.data.nodes.forEach(d => d.degree = 0);
    app.data.links
      .filter(l => l.visible)
      .forEach(l => {
        l.source.degree++;
        l.target.degree++;
      });
    app.data.clusters.forEach(c => {
      c.links = c.links/2;
      c.links_per_node = c.links/c.nodes;
      c.mean_genetic_distance = c.sum_distances/c.links;
    });
    ipcRenderer.send('update-clusters', app.data.clusters);
  }

  function setNodeVisibility(){
    app.data.nodes.forEach(n => n.visible = true);
    if(app.state.visible_clusters.length < app.data.clusters.length){
      app.data.nodes.forEach(n => n.visible = n.visible && app.state.visible_clusters.includes(n.cluster));
    }
    if($('#HideSingletons').is(':checked')){
      let clusters = app.data.clusters.map(c => c.nodes);
      app.data.nodes.forEach(n => n.visible = n.visible && clusters[n.cluster-1] > 1);
    }
  }

  function setLinkVisibility(){
    let metric  = $('#linkSortVariable').val(),
        threshold = $('#default-link-threshold').val();
    app.data.links.forEach(link => link.visible = true);
    if(metric !== 'none'){
      app.data.links.forEach(link => link.visible = link.visible && (link[metric] <= threshold));
    }
    if($('#showMSTLinks').is(':checked')){
      app.data.links.forEach(link => link.visible = link.visible && link.mst);
    }
    if(app.state.visible_clusters.length < app.data.clusters.length){
      app.data.links.forEach(link => link.visible = link.visible && app.state.visible_clusters.includes(link.cluster));
    }
  }

  function setupNetwork(){
    app.network = {};
    let width = $(window).width(),
        height = $(window).height(),
        xScale = d3.scaleLinear().domain([0, width]).range([0, width]),
        yScale = d3.scaleLinear().domain([0, height]).range([0, height]);

    app.network.zoom = d3.zoom().on('zoom', () => app.network.svg.attr('transform', d3.event.transform));

    app.network.svg = d3.select('svg')
      .on('click', hideContextMenu)
      .html('') //Let's make sure the canvas is blank.
      .call(app.network.zoom)
      .append('g');

    app.network.fit = function(bounds){
      if(!bounds) bounds = app.network.svg.node().getBBox();
      if (bounds.width == 0 || bounds.height == 0) return; // nothing to fit
      let parent = app.network.svg.node().parentElement,
          midX = bounds.x + bounds.width / 2,
          midY = bounds.y + bounds.height / 2;
      let scale = 0.95 / Math.max(bounds.width / parent.clientWidth, bounds.height / parent.clientHeight);
      d3.select('svg')
        .transition()
        .duration(750)
        .call(app.network.zoom.transform, d3.zoomIdentity
          .translate(parent.clientWidth / 2 - scale * midX, parent.clientHeight / 2 - scale * midY)
          .scale(scale));
    };

    app.network.force = d3.forceSimulation()
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

    app.network.force.on('end', e => {
      $('#playbutton').data('state', 'paused').html('<i class="fa fa-play" aria-hidden="true"></i>');
    });

    app.network.svg.append('svg:defs').append('marker')
      .attr('id', 'end-arrow')
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 20)
      .attr('refY', 5)
      .attr('markerWidth', 4)
      .attr('markerHeight', 4)
      .attr('orient', 'auto')
      .append('svg:path')
        .attr('d', 'M0,0 L0,10 L10,5 z');

    app.network.svg.append('g').attr('id', 'links');
    app.network.svg.append('g').attr('id', 'nodes');
  }

  function renderNetwork(){
    let vlinks = app.data.links.filter(link => link.visible);

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

    let vnodes = app.data.nodes.filter(node => node.visible);

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

    let pb = $('#playbutton');

    app.network.force.nodes(vnodes).on('tick', () => {
      d3.select('g#links').selectAll('line')
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
      d3.select('g#nodes').selectAll('g.node')
        .attr('transform', d => {
          if(d.fixed){
            return 'translate(' + d.fx + ', ' + d.fy + ')';
          } else {
            return 'translate(' + d.x + ', ' + d.y + ')';
          }
        });
      if(pb.data('state', 'paused')){
        pb.data('state', 'playing');
        pb.html('<i class="fa fa-pause" aria-hidden="true"></i>');
      }
    });

    app.network.force.force('link').links(vlinks);

    ipcRenderer.send('update-visibility', app.data);
  }

  function dragstarted(d) {
    if (!d3.event.active) app.network.force.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(d) {
    d.fx = d3.event.x;
    d.fy = d3.event.y;
  }

  function dragended(d) {
    if (!d3.event.active) app.network.force.alphaTarget(0);
    if(!d.fixed){
      d.fx = null;
      d.fy = null;
    }
  }

  function clickHandler(n){
   if(!d3.event.shiftKey){
     app.data.nodes
       .filter(node => node !== n)
       .forEach(node => node.selected = false);
   }
   n.selected = !n.selected;
   ipcRenderer.send('update-node-selection', app.data.nodes);
   d3.select('g#nodes').selectAll('g.node').data(app.data.nodes).select('path').classed('selected', d => d.selected);
   $('#numberOfSelectedNodes').text(app.data.nodes.filter(d => d.selected).length.toLocaleString());
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
        app.network.force.alpha(0.3).alphaTarget(0).restart();
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
      app.state.visible_clusters = app.state.visible_clusters.filter(cid => cid !== d.cluster);
      setLinkVisibility();
      setNodeVisibility();
      renderNetwork();
      app.network.force.alpha(0.3).alphaTarget(0).restart();
      hideContextMenu();
    });
    if(app.state.visible_clusters < app.data.clusters.length){
      $('#isolateCluster').text('De-isolate Cluster').click(e => {
        app.state.visible_clusters = app.data.clusters.map(c => c.id);
        setNodeVisibility();
        setLinkVisibility();
        renderNetwork();
        app.network.force.alpha(0.3).alphaTarget(0).restart();
        hideContextMenu();
      });
    } else {
      $('#isolateCluster').text('Isolate Cluster').click(e => {
        app.state.visible_clusters = [d.cluster];
        setLinkVisibility();
        setNodeVisibility();
        renderNetwork();
        app.network.force.alpha(0.3).alphaTarget(0).restart();
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
      let values = Lazy(app.data.nodes).pluck(symbolVariable).uniq().sort().toArray();
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
      let values = Lazy(app.data.nodes).pluck(sizeVariable).without(undefined).uniq().sort().toArray();
      var min = math.min(values);
      var max = math.max(values);
      var oldrng = max - min;
      var med = oldrng / 2;
    }
    let vnodes = app.data.nodes.filter(n => n.visible);
    let nodes = app.network.svg.select('g#nodes').selectAll('g.node').data(vnodes);
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
    app.data.nodes.forEach(d => d.selected = newNodes.find(e => e.id == d.id).selected);
    app.network.svg.select('g#nodes').selectAll('g.node').data(app.data.nodes).select('path').classed('selected', d => d.selected);
    $('#numberOfSelectedNodes').text(app.data.nodes.filter(d => d.selected).length.toLocaleString());
  });

  $('#nodeLabelVariable').change(e => {
    if(e.target.value === 'none'){
      app.network.svg.select('g#nodes').selectAll('g.node')
        .select('text').text('');
    } else {
      app.network.svg.select('g#nodes').selectAll('g.node').data(app.data.nodes.filter(n => n.visible))
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
    let values = Lazy(app.data.nodes).pluck(e.target.value).uniq().sort().toArray();
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
    let circles = app.network.svg.select('g#nodes').selectAll('g.node').data(app.data.nodes).select('path');
    if(variable === 'none'){
      return circles.attr('opacity', scalar);
    }
    let values = Lazy(app.data.nodes).pluck(variable).without(undefined).sort().uniq().toArray();
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

  $('#default-node-color').on('input', e => app.network.svg.select('g#nodes').selectAll('g.node').select('path').attr('fill', e.target.value));
  $('#nodeColorVariable').change(e => {
    $('#default-node-color').fadeOut();
    let circles = app.network.svg.select('g#nodes').selectAll('g.node').data(app.data.nodes).select('path');
    $('#nodeColors').fadeOut(function(){$(this).remove()});
    let table = $('<tbody id="nodeColors"></tbody>').appendTo('#groupKey');
    if(e.target.value == 'none'){
      circles.attr('fill', $('#default-node-color').val());
      $('#default-node-color').fadeIn();
      table.fadeOut();
      return;
    }
    table.append('<tr><th>'+e.target.value+'</th><th>Color</th><tr>');
    let values = Lazy(app.data.nodes).pluck(e.target.value).uniq().sortBy().toArray();
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
    app.network.force.force('charge').strength(-e.target.value);
    app.network.force.alpha(0.3).alphaTarget(0).restart();
  });

  $('#DirectedLinks').parent().click(e => {
    app.network.svg.select('g#links').selectAll('line').attr('marker-end', 'url(#end-arrow)');
  });

  $('#UndirectedLinks').parent().click(e => {
    app.network.svg.select('g#links').selectAll('line').attr('marker-end', null);
  });

  function setLinkPattern(){
    let linkWidth = $('#default-link-width').val();
    let mappings = {
      'None': 'none',
      'Dotted': linkWidth + ',' + 2 * linkWidth,
      'Dashed': linkWidth * 5,
      'Dot-Dashed': linkWidth * 5 + ',' + linkWidth * 5 + ',' + linkWidth  + ',' + linkWidth * 5
    }
    app.network.svg.select('g#links').selectAll('line').attr('stroke-dasharray', mappings[$('#default-link-pattern').val()]);
  }

  $('#default-link-pattern').on('change', setLinkPattern);

  $('#default-link-length').on('input', e => {
    app.network.force.force('link').distance(e.target.value);
    app.network.force.alpha(0.3).alphaTarget(0).restart();
  });

  function setLinkColor(e){
    if($('#linkColorVariable').val() == 'none'){
      app.network.svg.select('g#links').selectAll('line').style('stroke', $('#default-link-color').val());
      $('#default-link-color').fadeIn();
      $('#linkColors').fadeOut();
      return;
    }
    $('#default-link-color').fadeOut();
    let links = app.network.svg.select('g#links').selectAll('line').data(app.data.links);
    $('#linkColors').remove();
    $('#groupKey').append('<tbody id="linkColors"></tbody>');
    let table = $('#linkColors');
    let variable = $('#linkColorVariable').val();
    table.append('<tr><th>'+variable+'</th><th>Color</th><tr>');
    let values = Lazy(app.data.links).pluck(variable).uniq().sort().toArray();
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
    let links = app.network.svg.select('g#links').selectAll('line').data(app.data.links.filter(l => l.visible));
    if(variable === 'none'){
      return links.attr(attribute, scalar);
    }
    if(!floor){floor = 1;}
    let values = Lazy(app.data.links).pluck(variable).without(undefined).sort().uniq().toArray();
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
      //$('#default-link-threshold').attr('step', math.meanAbsoluteDeviation(app.data.links.map(l => l[e.target.value])));
      $('#computeMST').css('display', 'inline-block');
      $('#default-link-threshold').css('visibility', 'visible');
    }
  });

  ipcRenderer.on('update-links-mst', (event, newLinks) => {
    app.data.links.forEach(ol => {
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
    app.network.force.alpha(0.3).alphaTarget(0).restart();
  })

  $('#ShowSingletons, #HideSingletons').change(e => {
    tagClusters();
    setNodeVisibility();
    renderNetwork();
    computeDegree();
    updateStatistics();
    app.network.force.alpha(0.3).alphaTarget(0).restart();
  });

  $('#default-link-threshold').on('input', e => {
    setLinkVisibility();
    tagClusters();
    if($('#HideSingletons').is(':checked')) setNodeVisibility();
    renderNetwork();
    computeDegree();
    updateStatistics();
    app.network.force.alpha(0.3).alphaTarget(0).restart();
  });

  $('#hideNetworkStatistics').parent().click(() => $('#networkStatistics').fadeOut());
  $('#showNetworkStatistics').parent().click(() => {
    updateStatistics();
    $('#networkStatistics').fadeIn();
  });

  $('#network-friction').on('input', e => {
    app.network.force.velocityDecay(e.target.value);
    app.network.force.alpha(0.3).alphaTarget(0).restart();
  });

  $('#network-gravity').on('input', e => {
    app.network.force.force('gravity').strength(e.target.value);
    app.network.force.alpha(0.3).alphaTarget(0).restart();
  });

  $('#main_panel').css('background-color', $('#network-color').val());

  $('#network-color').on('input', e => $('#main_panel').css('background-color', e.target.value));

  $('#faster').click(e => {
    app.state.alpha += 0.2;
    app.network.force.alphaTarget(app.state.alpha).restart();
  });
  $('#slower').click(e => {
    app.state.alpha = Math.max(app.state.alpha - 0.2, 0.1);
    app.network.force.alphaTarget(app.state.alpha).restart();
  });

  $('#playbutton')
    .data('state', 'paused')
    .click(function(e){
      if($(this).data('state') === 'paused'){
        $(this).data('state', 'playing')
          .html('<i class="fa fa-pause" aria-hidden="true"></i>');
        app.network.force.alphaTarget(app.state.alpha).restart();
      } else {
        $(this).data('state', 'paused')
          .html('<i class="fa fa-play" aria-hidden="true"></i>');
        app.network.force.alpha(0).alphaTarget(0);
      }
    });

  $('#search').on('input', e => {
    if(e.target.value === '') {
      app.data.nodes.forEach(n => n.selected = false);
    } else {
      app.data.nodes.forEach(n => n.selected = (n.id.indexOf(e.target.value)>-1));
      if(app.data.nodes.filter(n => n.selected).length === 0) alertify.warning('No matches!');
    }
    d3.select('g#nodes')
      .selectAll('g.node')
      .select('path')
      .data(app.data.nodes)
      .classed('selected', d => d.selected);
    ipcRenderer.send('update-node-selection', app.data.nodes);
    $('#numberOfSelectedNodes').text(app.data.nodes.filter(d => d.selected).length.toLocaleString());
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
