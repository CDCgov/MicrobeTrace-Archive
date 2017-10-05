import { clipboard, remote, ipcRenderer } from 'electron';
import Lazy from 'lazy.js';
import math from 'bettermath';
import jetpack from 'fs-jetpack';
import Papa from 'papaparse';
import './helpers/window.js';

import d3 from 'd3';
const extraSymbols = require('d3-symbol-extra');
Object.assign(d3, extraSymbols); //d3-symbol-extra doesn't automatically write to d3
d3.symbols.concat(Object.values(extraSymbols)); //update the list of available symbols
import { forceAttract } from 'd3-force-attract';

window.jquery = window.jQuery = window.$ = require('jquery');
require('bootstrap');

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
    function resetDom(){
      messages = [];
      $('#loadingInformation').empty();
      $('#network').empty();
      $('#groupKey').find('tbody').empty();
      $('.showForSequence, .showForMST, .showForLinkCSV, .showForNodeFile').slideUp();
      $('.showForNotMST').css('display', 'inline-block');
      $('.progress-bar').css('width', '0%').attr('aria-valuenow', 0);
      $('#align').prop('checked', false).parent().removeClass('active');
      $('#file_panel').fadeIn();
      $('#FastaOrLinkFileName').text('').hide();
      $('#main-submit').hide();
      $('#NodeCSVFile').val('').parent().parent().parent().hide();
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
    if(window.network){
      if(window.network.force){
        window.network.force.stop();
      }
    }
    window.network = undefined;
    window.nodes = undefined;
    window.links = undefined;
    window.distance_matrix = undefined;
    ipcRenderer.send('reset');
  }

  $('body').prepend(ipcRenderer.sendSync('get-component', 'nav.html'));
  $('#FileTab').click(() => reset());
  $('body').append(ipcRenderer.sendSync('get-component', 'exportRasterImage.html'));
  $('body').append(ipcRenderer.sendSync('get-component', 'exportVectorImage.html'));

  $('#FileTab').append('<li role="separator" class="divider"></li>');

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
      var extension = fileName.split('.').pop();
      if(extension === 'fas' || extension === 'fasta'){
        jetpack.write(fileName, window.nodes.map(n => '>'+n.id+'\n'+n.seq).join('\n'));
      } else {
        jetpack.write(fileName, '#MEGA\nTitle: '+fileName+'\n\n'+window.nodes.map(n => '#'+n.id+'\n'+n.seq).join('\n'));
      }
      alertify.success('File Saved!');
    });
  }).insertAfter('#FileTab');

  $('<li id="ExportHIVTraceTab" class="hidden"><a href="#">Export HIVTRACE File</a></li>').click(() => {
    remote.dialog.showSaveDialog({
      filters: [
        {name: 'JSON', extensions: ['json']}
      ]
    }, (fileName) => {
      if (fileName === undefined){
        return alertify.error('File not exported!');
      }
      jetpack.write(fileName, makeHIVTraceOutput());
      alertify.success('File Saved!');
    });
  }).insertAfter('#FileTab');

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

    if(e.target.files[0].name.slice(-3) == 'csv'){
      Papa.parse(e.target.files[0], {
        header: true,
        preview: 1,
        complete: results => {
          window.links = results.data;
          var keys = Object.keys(window.links[0]);
          $('.linkVariables').html(
            keys
              .filter(key => !meta.includes(key))
              .map(key => '<option value="' + key + '">' + key + '</option>')
              .join('\n')
          );
          $('#LinkSourceColumn').val(keys.includes('source') ? 'source' : keys[0]);
          $('#LinkTargetColumn').val(keys.includes('target') ? 'target' : keys[1]);
        }
      });
      $('.showForLinkCSV').slideDown().filter('tr').css('display', 'table-row');
      $('.showForSequence').slideUp();
    } else {
      $('.showForSequence').slideDown().filter('tr').css('display', 'table-row');
      $('.showForLinkCSV').slideUp();
    }

    $('#main-submit').slideDown();
    $('#NodeCSVFile').parent().parent().parent().slideDown();
  });

  $('#NodeCSVFile').parent().click(e => {
    if($('#FastaOrLinkFile')[0].files.length === 0){
      e.preventDefault();
      alertify.error('Please load a Link CSV or FASTA file first.');
    }
  });

  $('#NodeCSVFile').on('change', e => {
    if(e.target.files.length > 0){
      $('#NodeCSVFileName').text(e.target.files[0].name).slideDown();
      Papa.parse(e.target.files[0], {
        header: true,
        preview: 1,
        complete: results => {
          var keys = Object.keys(results.data[0]);
          $('.nodeVariables').html(
            keys
              .filter(key => !meta.includes(key))
              .map(key => '<option value="' + key + '">' + key + '</option>')
              .join('\n')
          );
          $('#NodeSequenceColumn').prepend('<option value="none" selected>None</option>\n');
          $('#NodeIDColumn').val(keys[0]);
          $('.showForNodeFile').slideDown();
        }
      });
    } else {
      $('.showForNodeFile').slideUp();
    }
  });

  $('#NodeSequenceColumn').on('change', e => {
    if(e.target.value === 'None'){
      $('#showForSequence').slideDown().filter('tr').css('display', 'table-row');
    } else {
      $('#showForSequence').slideUp();
    }
  });

  $('#main-submit').click(function(e){
    if($('#FastaOrLinkFile')[0].files.length == 0){
      return alertify.error('Please load a Link CSV or FASTA file first.');
    }
    ipcRenderer.send('parse-file', {
      file: $('#FastaOrLinkFile')[0].files[0].path,
      supplement: $('#NodeCSVFile')[0].files.length > 0 ? $('#NodeCSVFile')[0].files[0].path : '',
      align: $('#align').is(':checked'),
      identifierColumn: $('#NodeIDColumn').val(),
      sequenceColumn: $('#NodeSequenceColumn').val(),
      sourceColumn: $('#LinkSourceColumn').val(),
      targetColumn: $('#LinkTargetColumn').val(),
      penalties: [-5, -1.7]
    });

    $('#file_panel').fadeOut(() => {
      $('#button-wrapper, #main_panel').fadeIn(() => {
        if(!window.network){
          $('#loadingInformationModal').modal({
            keyboard: false,
            backdrop: 'static'
          });
        }
      });
    });
  });

  ipcRenderer.on('tick', (event, msg) => $('.progress-bar').css('width', msg+'%').attr('aria-valuenow', msg));

  var messages = [];
  ipcRenderer.on('message', (event, msg) => {
    messages.push(msg);
    $('#loadingInformation').html(messages.join('<br />'));
  });

  ipcRenderer.on('deliver-data', (e, data) => {
    window.nodes = data.nodes;
    window.links = data.links;
    updateNodeVariables();
    updateLinkVariables();
    renderNetwork();
    updateStatistics();
    $('.hidden').removeClass('hidden');
    $('#loadingInformationModal').modal('hide');
  });

  function updateStatistics(){
    if($('#hideNetworkStatistics').is(':checked')) return;
    var llinks = Lazy(window.links).filter(e => e.visible);
    $('#numberOfNodes').text(window.nodes.length.toLocaleString());
    $('#numberOfSelectedNodes').text(window.nodes.filter(d => d.selected).length.toLocaleString());
    $('#visibilityThreshold').text(math.toPrecision($('#default-link-threshold').val(), 3));
    $('#numberOfVisibleLinks').text(llinks.size().toLocaleString());
    $('#numberOfPossibleLinks').text((window.nodes.length * (window.nodes.length - 1) / 2).toLocaleString());
    tagClusters();
    var singletons = window.nodes.length - llinks.pluck('source').union(llinks.pluck('target')).uniq().size();
    $('#numberOfSingletonNodes').text(singletons.toLocaleString());
    $('#numberOfDisjointComponents').text((window.clusters.length - singletons).toLocaleString());
  }

  const meta = ['seq', 'padding', 'selected', 'orig', 'mst', 'visible', 'index'];

  function updateNodeVariables(){
    var keys = Object.keys(window.nodes[0]);
    $('.nodeVariables.categorical').html(
      '<option value="none">None</option>\n' +
      keys
        .filter(key => !meta.includes(key))
        .map(key => '<option value="' + key + '">' + key + '</option>')
        .join('\n')
    );
    $('.nodeVariables.numeric').html(
      '<option value="none">None</option>\n' +
      keys
        .filter(key => math.isNumber(window.nodes[0][key]) && !meta.includes(key))
        .map(key => '<option value="' + key + '">' + key + '</option>')
        .join('\n')
    );
    if(keys.includes('id')) $('#nodeTooltipVariable').val('id');
  }

  function updateLinkVariables(){
    var keys = Object.keys(window.links[0]);
    $('.linkVariables').html(
      '<option value="none">None</option>\n' +
      keys
        .map(key => '<option value="' + key + '">' + key + '</option>')
        .join('\n')
    );
    $('.linkVariables.numeric').html(
      '<option value="none">None</option>\n' +
      keys
        .filter(key => math.isNumber(window.links[0][key]))
        .map(key => '<option value="' + key + '">' + key + '</option>')
        .join('\n')
    );
    if(keys.includes('distance')){
      $('#linkSortVariable').val('distance');
    }
  }

  function DFS(node){
    if(typeof node.cluster !== 'undefined') return;
    node.cluster = window.clusters.length;
    window.clusters[window.clusters.length - 1].size++;
    window.links
      .filter(l => l.visible && (l.source.id == node.id || l.target.id == node.id))
      .forEach(l => {
        if(!l.source.cluster) DFS(l.source);
        if(!l.target.cluster) DFS(l.target);
      });
  }

  function tagClusters(){
    window.clusters = [];
    window.nodes.forEach(node => delete node.cluster);
    window.nodes.forEach(node => {
      if(typeof node.cluster === 'undefined'){
        window.clusters.push({
          id: window.clusters.length,
          size: 0
        });
        DFS(node);
      }
    });
    ipcRenderer.send('update-node-cluster', window.nodes);
  }

  function setLinkVisibility(){
    var metric  = $('#linkSortVariable').val(),
        showMST = $('#showMSTLinks').is(':checked'),
        threshold = $('#default-link-threshold').val();
    if(metric == 'none' && window.links[0].orig){
      window.links.forEach(link => link.visible = true);
    } else {
      window.links.forEach(link => {
        if(link[metric] <= threshold){
          if(showMST){
            link.visible = link.mst;
          } else {
            link.visible = true;
          }
        } else {
          link.visible = false;
        }
      });
    }
    ipcRenderer.send('update-link-visibility', window.links);
  }

  function renderNetwork(){
    window.network = {};

    setLinkVisibility();

    var links = window.links.filter(link => link.visible),
        width = $(window).width(),
        height = $(window).height(),
        xScale = d3.scaleLinear().domain([0, width]).range([0, width]),
        yScale = d3.scaleLinear().domain([0, height]).range([0, height]);

    window.network.zoom = d3.zoom().on('zoom', () => window.network.svg.attr('transform', d3.event.transform));
    window.network.svg = d3.select('svg')
      .on('click', hideContextMenu)
      .html('') //Let's make sure the canvas is blank.
      .call(window.network.zoom)
      .append('g');

    window.network.svg.append('svg:defs')
      .selectAll('marker').data([{id: 'end-arrow'}]).enter().append('marker')
        .attr('id', d => d.id)
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 20)
        .attr('refY', 5)
        .attr('markerWidth', 4)
        .attr('markerHeight', 4)
        .attr('orient', 'auto')
        .append('svg:path')
          .attr('d', 'M0,0 L0,10 L10,5 z');

    var link = window.network.svg.append('g').attr('id', 'links')
      .selectAll('line').data(links).enter().append('line').attr('class', 'link')
        .attr('stroke', $('#default-link-color').val())
        .attr('stroke-width', $('#default-link-width').val())
        .attr('opacity', $('#default-link-opacity').val())
        .on('mouseenter', showLinkToolTip)
        .on('mouseout', hideTooltip);

    var node = window.network.svg.append('g').attr('id', 'nodes')
      .selectAll('g').data(window.nodes).enter().append('g').attr('class', 'node')
        .call(d3.drag()
          .on('start', dragstarted)
          .on('drag', dragged)
          .on('end', dragended))
        .on('mouseenter', showNodeToolTip)
        .on('mouseout', hideTooltip)
        .on('contextmenu', showContextMenu)
        .on('click', n => {
          if(!d3.event.shiftKey){
            window.nodes
              .filter(node => node !== n)
              .forEach(node => node.selected = false);
          }
          n.selected = !n.selected;
          ipcRenderer.send('update-node-selection', window.nodes);
          window.network.svg.select('g#nodes').selectAll('path').data(nodes).classed('selected', d => d.selected);
          $('#numberOfSelectedNodes').text(window.nodes.filter(d => d.selected).length.toLocaleString());
        });

    node.append('path')
      .attr('d', d3.symbol()
        .size($('#default-node-radius').val())
        .type(d3[$('#default-node-symbol').val()])
      )
      .attr('fill', $('#default-node-color').val());

    node.append('text')
      .attr('dy', 5)
      .attr('dx', 5);

    window.network.force = d3.forceSimulation()
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

    window.network.force.nodes(nodes).on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
      node
        .attr('transform', d => {
          if(d.fixed){
            return 'translate(' + d.fx + ', ' + d.fy + ')';
          } else {
            return 'translate(' + d.x + ', ' + d.y + ')';
          }
        });
    });

    window.network.force.force('link').links(links);

    function dragstarted(d) {
      if (!d3.event.active) window.network.force.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(d) {
      d.fx = d3.event.x;
      d.fy = d3.event.y;
    }

    function dragended(d) {
      if (!d3.event.active) window.network.force.alphaTarget(0);
      if(!d.fixed){
        d.fx = null;
        d.fy = null;
      }
    }

    function showContextMenu(d){
      d3.event.preventDefault();
      hideTooltip();
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
          window.network.force.alpha(0.3).alphaTarget(0).restart();
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
      d3.select('#contextmenu')
        .style('left', (d3.event.pageX) + 'px')
        .style('top', (d3.event.pageY) + 'px')
        .style('opacity', 1);
    }

    function hideContextMenu(){
      var menu = d3.select('#contextmenu');
      menu
        .transition().duration(100)
        .style('opacity', 0)
        .on('end', () =>  menu.style('left', '0px').style('top', '0px'));
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
  }

  function showLinkToolTip(d){
    var v = $('#linkTooltipVariable').val();
    if(v === 'none') return;
    d3.select('#tooltip')
      .html((v === 'source' || v === 'target') ? d[v].id : d[v])
      .style('left', (d3.event.pageX + 8) + 'px')
      .style('top', (d3.event.pageY - 28) + 'px')
      .transition().duration(100)
      .style('opacity', 1);
  }

  function hideTooltip(){
    var tooltip = d3.select('#tooltip');
    tooltip
      .transition().duration(100)
      .style('opacity', 0)
      .on('end', () => tooltip.style('left', '-40px').style('top', '-40px'));
  }

  function makeHIVTraceOutput(){
    return JSON.stringify({
      trace_results: {
        'HIV Stages': {},
        'Degrees': {},
        'Multiple sequences': {},
        'Edge Stages': {},
        'Cluster sizes': window.clusters.map(c => c.size),
        'Settings': {
          'contaminant-ids': ['HXB2_prrt'],
          'contaminants': 'remove',
          'edge-filtering': 'remove',
          'threshold': $('#default-link-threshold').val()
        },
        'Network Summary': {
          'Sequences used to make links': 0,
          'Clusters': window.clusters.length,
          'Edges': window.links.filter(l => l.visible).length,
          'Nodes': window.nodes.length
        },
        'Directed Edges': {},
        'Edges': [],
        'Nodes': []
      }
    }, null, 2);
  }

  ipcRenderer.on('update-node-selection', (e, newNodes) => {
    window.nodes.forEach(d => d.selected = newNodes.find(e => e.id == d.id).selected);
    window.network.svg.select('g#nodes').selectAll('path').data(window.nodes).classed('selected', d => d.selected);
    $('#numberOfSelectedNodes').text(window.nodes.filter(d => d.selected).length.toLocaleString());
  });

  function redrawNodes(){
    //Things to track in the function:
    //* Symbols:
    var type = d3[$('#default-node-symbol').val()];
    var symbolVariable = $('#nodeSymbolVariable').val();
    var o = (b => d3[$('#default-node-symbol').val()]);
    if(symbolVariable !== 'none'){
      var map = {};
      var values = Lazy(window.nodes).pluck($('#nodeSymbolVariable').val()).uniq().sort().toArray();
      $('#nodeShapes select').each(function(i, el){
        map[values[i]] = $(this).val();
      });
      o = (v => map[v]);
    }
    //* Sizes:
    var defaultSize = $('#default-node-radius').val();
    var size = defaultSize;
    var sizeVariable = $('#nodeRadiusVariable').val();
    if(sizeVariable !== 'none'){
      var values = Lazy(window.nodes).pluck(sizeVariable).without(undefined).uniq().sort().toArray();
      var min = math.min(values);
      var max = math.max(values);
      var oldrng = max - min;
      var med = oldrng / 2;
    }
    window.network.svg.select('g#nodes').selectAll('path').data(window.nodes).each(function(d){
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
  }

  $('#nodeLabelVariable').change(e => {
    if(e.target.value === 'none'){
      window.network.svg.select('g#nodes')
        .selectAll('text').text('');
    } else {
      window.network.svg.select('g#nodes')
        .selectAll('text').data(window.nodes)
        .text(d => d[e.target.value]);
    }
  });

  $('#default-node-symbol').on('input', redrawNodes);
  $('#nodeSymbolVariable').change(e => {
    $('#default-node-symbol').fadeOut();
    $('#nodeShapes').fadeOut(function(){$(this).remove()});
    var table = $('<tbody id="nodeShapes"></tbody>').appendTo('#groupKey');
    if(e.target.value === 'none'){
      redrawNodes();
      $('#default-node-symbol').fadeIn();
      return table.fadeOut(e => table.remove());
    }
    var circles = window.network.svg.select('g#nodes').selectAll('path').data(window.nodes);
    table.append('<tr><th>'+e.target.value+'</th><th>Shape</th><tr>');
    var values = Lazy(window.nodes).pluck(e.target.value).uniq().sort().toArray();
    var symbolKeys = ['symbolCircle', 'symbolCross', 'symbolDiamond', 'symbolSquare', 'symbolStar', 'symbolTriangle', 'symbolWye'].concat(Object.keys(extraSymbols));
    var o = d3.scaleOrdinal(symbolKeys).domain(values);
    var options = $('#default-node-symbol').html();
    values.forEach(v => {
      var subset = circles.filter(d => d[e.target.value] === v);
      var selector = $('<select></select>').append(options).val(o(v)).change(redrawNodes);
      var cell = $('<td></td>').append(selector);
      var row = $('<tr><td>' + v + '</td></tr>').append(cell);
      table.append(row);
    });
    redrawNodes();
    table.fadeIn();
  });

  $('#default-node-radius').on('input', redrawNodes);
  $('#nodeRadiusVariable').change(redrawNodes);

  function scaleNodeOpacity(){
    var scalar = $('#default-node-opacity').val();
    var variable = $('#nodeOpacityVariable').val();
    var circles = window.network.svg.select('g#nodes').selectAll('path').data(window.nodes);
    if(variable === 'none'){
      return circles.attr('opacity', scalar);
    }
    var values = Lazy(window.nodes).pluck(variable).without(undefined).sort().uniq().toArray();
    var min = math.min(values);
    var max = math.max(values);
    var rng = max - min;
    var med = rng / 2 + min;
    circles.attr('opacity', d => {
      var v = d[variable];
      if(typeof v === 'undefined') v = med;
      return scalar * (v - min) / rng + 0.1;
    });
  }

  $('#default-node-opacity').on('input', scaleNodeOpacity);
  $('#nodeOpacityVariable').change(scaleNodeOpacity);

  $('#default-node-color').on('input', e => window.network.svg.select('g#nodes').selectAll('path').attr('fill', e.target.value));
  $('#nodeColorVariable').change(e => {
    $('#default-node-color').fadeOut();
    var circles = window.network.svg.select('g#nodes').selectAll('path').data(window.nodes);
    $('#nodeColors').fadeOut(function(){$(this).remove()});
    var table = $('<tbody id="nodeColors"></tbody>').appendTo('#groupKey');
    if(e.target.value == 'none'){
      circles.attr('fill', $('#default-node-color').val());
      $('#default-node-color').fadeIn();
      table.fadeOut();
      return;
    }
    table.append('<tr><th>'+e.target.value+'</th><th>Color</th><tr>');
    var values = Lazy(window.nodes).pluck(e.target.value).uniq().sortBy().toArray();
    var o = d3.scaleOrdinal(d3.schemeCategory10).domain(values);
    circles.attr('fill', d => o(d[e.target.value]));
    values.forEach(value => {
      var input = $('<input type="color" value="'+o(value)+'" />')
        .on('input', evt => {
          circles
            .filter(d => d[e.target.value] == value)
            .attr('fill', d => evt.target.value);
        });
      var cell = $('<td></td>').append(input);
      var row = $('<tr><td>'+value+'</td></tr>').append(cell);
      table.append(row);
    });
    table.fadeIn();
  });

  $('#default-node-charge').on('input', e => {
    window.network.force.force('charge').strength(-e.target.value);
    window.network.force.alpha(0.3).alphaTarget(0).restart();
  });

  ipcRenderer.on('deliver-nodes', (e, nodes) => {
    window.nodes = nodes;
    window.network.svg.select('g#nodes').selectAll('path')
      .data(window.nodes)
      .classed('selected', d => d.selected);
  });

  $('#DirectedLinks').parent().click(e => {
    window.network.svg.select('g#links').selectAll('line').attr('marker-end', 'url(#end-arrow)');
  });

  $('#UndirectedLinks').parent().click(e => {
    window.network.svg.select('g#links').selectAll('line').attr('marker-end', null);
  });

  function setLinkPattern(){
    var linkWidth = $('#default-link-width').val();
    var mappings = {
      'None': 'none',
      'Dotted': linkWidth + ',' + 2 * linkWidth,
      'Dashed': linkWidth * 5,
      'Dot-Dashed': linkWidth * 5 + ',' + linkWidth * 5 + ',' + linkWidth  + ',' + linkWidth * 5
    }
    window.network.svg.select('g#links').selectAll('line').attr('stroke-dasharray', mappings[$('#default-link-pattern').val()]);
  }

  $('#default-link-pattern').on('change', setLinkPattern);

  $('#default-link-length').on('input', e => {
    window.network.force.force('link').distance(e.target.value);
    window.network.force.alpha(0.3).alphaTarget(0).restart();
  });

  function setLinkColor(e){
    if($('#linkColorVariable').val() == 'none'){
      window.network.svg.select('g#links').selectAll('line').style('stroke', $('#default-link-color').val());
      $('#default-link-color').fadeIn();
      $('#linkColors').fadeOut();
      return;
    }
    $('#default-link-color').fadeOut();
    var links = window.network.svg.selectAll('line');
    $('#linkColors').remove();
    $('#groupKey').append('<tbody id="linkColors"></tbody>');
    var table = $('#linkColors');
    var variable = $('#linkColorVariable').val();
    table.append('<tr><th>'+variable+'</th><th>Color</th><tr>');
    var values = Lazy(window.links).pluck(variable).uniq().sortBy().toArray();
    var o = d3.scaleOrdinal(d3.schemeCategory10).domain(values);
    links.style('stroke', d => o(d[variable]));
    values.forEach(value => {
      var input = $('<input type="color" name="'+value+'-node-color-setter" value="'+o(value)+'" />')
        .on('input', evt => {
          links
            .filter(d => d[variable] === value)
            .style('stroke', d => evt.target.value);
        });
      var cell = $('<td></td>').append(input);
      var row = $('<tr><td>'+value+'</td></tr>').append(cell);
      table.append(row);
    });
    table.fadeIn();
  }

  $('#default-link-color').on('input', setLinkColor);
  $('#linkColorVariable').change(setLinkColor);

  function scaleLinkThing(scalar, variable, attribute, floor){
    var links = window.network.svg.selectAll('line');
    if(variable === 'none'){
      return links.attr(attribute, scalar);
    }
    if(!floor){floor = 1;}
    var values = Lazy(window.links).pluck(variable).without(undefined).sort().uniq().toArray();
    var min = math.min(values);
    var max = math.max(values);
    var rng = max - min;
    var recip = $('#reciprocal-link-width').is(':checked');
    links.attr(attribute, d => {
      var v = d[variable];
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

  function refreshLinks(){
    setLinkVisibility();
    var vlinks = links.filter(l => l.visible);
    var selection = window.network.svg.select('g#links').selectAll('line').data(vlinks);
    selection.enter().append('line').merge(selection)
        .on('mouseenter', showLinkToolTip)
        .on('mouseout', hideTooltip);
    selection.exit().remove();
    window.network.force.nodes(window.nodes).on('tick', e => {
      selection
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
      window.network.svg.select('g#nodes').selectAll('g')
        .attr('transform', d => {
          if(d.fixed){
            return 'translate(' + d.fx + ', ' + d.fy + ')';
          } else {
            return 'translate(' + d.x + ', ' + d.y + ')';
          }
        });
    });
    window.network.force.force('link').links(vlinks);
    window.network.svg.select('g#links').selectAll('line').style('stroke', $('#default-link-color').val());
  }

  $('#linkSortVariable').on('change', e => {
    if(e.target.value === 'none'){
      $('#computeMST').fadeOut();
    } else {
      $('#computeMST').css('display', 'inline-block');
    }
  });

  ipcRenderer.on('update-links-mst', (event, newLinks) => {
    window.links.forEach(ol => {
      ol.mst = false;
      var newlink = newLinks.find(nl => nl.source == ol.source.id && nl.target == ol.target.id);
      if(typeof newlink !== "undefined"){
        ol.mst = newlink.mst;
      }
    });
    $('.showForMST').css('display', 'inline-block');
    alertify.success('MST successfully computed.', 10);
  });

  $('#computeMST').click(e => {
    ipcRenderer.send('compute-mst');
    $('.showForNotMST').fadeOut();
  });

  $('#showMSTLinks, #showAllLinks').parent().click(e => {
    refreshLinks();
    window.network.force.alpha(0.3).alphaTarget(0).restart();
  });

  $('#default-link-threshold').on('input', e => {
    refreshLinks();
    setLinkPattern();
    setLinkColor();
    scaleLinkThing($('#default-link-opacity').val(), $('#linkOpacityVariable').val(), 'opacity', .1);
    scaleLinkThing($('#default-link-width').val(),   $('#linkWidthVariable').val(),  'stroke-width');
    updateStatistics();
    window.network.force.alpha(0.3).alphaTarget(0).restart();
  });

  $('#hideNetworkStatistics').parent().click(() => $('#networkStatistics').fadeOut());
  $('#showNetworkStatistics').parent().click(() => {
    updateStatistics();
    $('#networkStatistics').fadeIn()
  });

  $('#network-friction').on('input', e => {
    window.network.force.velocityDecay(e.target.value);
    window.network.force.alpha(0.3).alphaTarget(0).restart();
  });

  $('#network-gravity').on('input', e => {
    window.network.force.force('gravity').strength(e.target.value);
    window.network.force.alpha(0.3).alphaTarget(0).restart();
  });

  $('#main_panel').css('background-color', $('#network-color').val());

  $('#network-color').on('input', e => $('#main_panel').css('background-color', e.target.value));

  $('[data-toggle="tooltip"]').tooltip();

  $(document).on('keydown', e => {
    if (e.which === 123) {
      remote.getCurrentWindow().toggleDevTools();
    } else if (e.which === 116) {
      reset();
    }
  });
});
