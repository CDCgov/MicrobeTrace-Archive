import { clipboard, remote, ipcRenderer } from 'electron';
import * as d3 from 'd3';
import { forceAttract } from 'd3-force-attract';
import * as alertify from 'alertifyjs';
import Lazy from 'lazy.js';
import math from 'bettermath';

window.jQuery = window.$ = require('jquery');
require('bootstrap');

$(function(){

  ipcRenderer.on('deliver-manifest', (e, manifest) => {
    $('title').text(manifest.productName + ' v. ' + manifest.version);
    $('#AppName').html('<a href="#">'+manifest.productName+'</a>');
    $('#AppVersion').html('<a href="#">'+manifest.version+'</a>');
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
      $('#file_panel').fadeIn();
      $('.showForFASTA, .showForEdgeCSV').hide();
      $('#sidebar-wrapper').removeClass('toggled');
      $('#collapseTwo').collapse('hide');
      $('.progress-bar').css('width', '0%').attr('aria-valuenow', 0);
    }
    if(soft){
      resetDom();
    } else {
      $('#FastaOrEdgeFile').val('');
      $('#NodeCSVFile').val('');
      $('#button-wrapper, #main_panel').fadeOut(() => {
        resetDom();
        $('#file_panel').fadeIn();
      });
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
    ipcRenderer.send('reset');
  }

  // Make sure we're in a clean environment to start. Probably not strictly
  // necessary, but why not?
  reset();

  // Before anything else gets done, ask the user to accept the legal agreement
  if(!localStorage.getItem('licenseAccepted')){
    $('#acceptAgreement').click(function(){
      // Set that agreement in localStorage
      localStorage.setItem('licenseAccepted', new Date());
    });
    $('#rejectAgreement').click(function(){
      // If you don't agree, no app for you!
      remote.app.quit();
      remote.getCurrentWindow().close();
    });
    // No hacking around the agreement.
    $('#licenseAgreement').modal({
      backdrop: 'static',
      keyboard: false
    });
  }

  $('#FastaOrEdgeFile').change(e => {
    reset(true);

    if(e.target.files.length < 1){
      $('#main-submit, #NodeCSVFile').prop({
        'title': 'Please select a Network CSV or FASTA File',
        'disabled': 'disabled'
      });
      return;
    }

    if(e.target.files[0].name.slice(-3) == 'csv'){
      $('.showForFASTA').hide();
      $('.showForEdgeCSV').show().filter('tr').css('display', 'table-row');
    } else {
      $('.showForEdgeCSV').hide();
      $('.showForFASTA').show().filter('tr').css('display', 'table-row');
    }

    $('#main-submit').prop({
      'title': 'Click to build Network',
      'disabled': ''
    });

    $('#NodeCSVFile').prop({
      'title': 'Click to add a CSV of additional Node data',
      'disabled': ''
    });
  });

  $('#align').on('change', e => {
    if(e.target.checked){
      $('.showForAlign').css('display', 'table-row');
    } else {
      $('.showForAlign').hide();
    }
  });

  $('#main-submit').click(() => {
    ipcRenderer.send('parse-file', {
      file: $('#FastaOrEdgeFile')[0].files[0].path,
      supplement: $('#NodeCSVFile')[0].files.length > 0 ? $('#NodeCSVFile')[0].files[0].path : '',
      align: $('#align').is(':checked'),
      penalties: [
        $('#gapOpenPenalty').val(),
        $('#gapExtensionPenalty').val()
      ]
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
    updateLinkVariables();
    updateNodeVariables();
    renderNetwork();
    updateStatistics();
    $('#loadingInformationModal').modal('hide');
  });

  function updateStatistics(){
    $('#numberOfNodes').text(window.nodes.length.toLocaleString());
    $('#numberOfSelectedNodes').text(window.nodes.filter(d => d.selected).length.toLocaleString());
    $('#visibilityThreshold').text(math.toPrecision(computeThreshold(), 3));
    $('#numberOfVisibleLinks').text(window.links.filter(link => link.visible).length.toLocaleString());
    $('#numberOfPossibleLinks').text((window.nodes.length * (window.nodes.length - 1) / 2).toLocaleString());
  }

  function updateLinkVariables(){
    $('.linkVariables').html(
      '<option value="none">None</option>\n' +
      Object.keys(window.links[0])
        .map(key => '<option value="' + key + '">' + key + '</option>')
        .join('\n')
    );
    $('.linkVariables.numeric').html(
      '<option value="none">None</option>\n' +
      Object.keys(window.links[0])
        .filter(key => math.isNumber(window.nodes[0][key]) && !meta.includes(key))
        .map(key => '<option value="' + key + '">' + key + '</option>')
        .join('\n')
    );
    $('#linkSortVariable').val('distance');
  }

  const meta = ['seq', 'padding', 'selected'];

  function updateNodeVariables(){
    $('.nodeVariables.categorical').html(
      '<option value="none">None</option>\n' +
      Object.keys(window.nodes[0])
        .filter(key => !meta.includes(key))
        .map(key => '<option value="' + key + '">' + key + '</option>')
        .join('\n')
    );
    $('.nodeVariables.numeric').html(
      '<option value="none">None</option>\n' +
      Object.keys(window.nodes[0])
        .filter(key => math.isNumber(window.nodes[0][key]) && !meta.includes(key))
        .map(key => '<option value="' + key + '">' + key + '</option>')
        .join('\n')
    );
    $('#nodeTooltipVariable').val('id');
  }

  function computeThreshold(){
    var minMetric  = parseFloat($('#minThreshold').val()),
        maxMetric  = parseFloat($('#maxThreshold').val()),
        proportion = parseFloat($('#default-link-threshold').val());
    return((maxMetric - minMetric) * proportion + minMetric);
  }

  function setLinkVisibility(){
    if(window.links[0].orig){ return; }
    var metric = $('#linkSortVariable').val(),
        showMST = $('#showMSTLinks').is(':checked');
    window.links.forEach(link => {
      if(link[metric] <= computeThreshold()){
        if(showMST){
          link.visible = link.mst;
        } else {
          link.visible = true;
        }
      } else {
        link.visible = false;
      }
    });
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

    var link = window.network.svg.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(links).enter()
      .append('line')
        .attr('stroke-width', $('#default-link-width').val())
        .on('mouseenter', showLinkToolTip)
        .on('mouseout', hideTooltip);

    var node = window.network.svg.append('g')
      .attr('class', 'nodes')
      .selectAll('circle')
      .data(window.nodes)
      .enter().append('circle')
        .attr('r', $('#default-node-radius').val())
        .attr('fill', $('#default-node-color').val())
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
              .forEach(node => Object.assign(node, {selected: false}));
          }
          n.selected = !n.selected;
          ipcRenderer.send('update-node-selection', window.nodes);
          window.network.svg.select('.nodes').selectAll('circle').data(nodes).classed('selected', d => d.selected);
          $('#numberOfSelectedNodes').text(window.nodes.filter(d => d.selected).length.toLocaleString());
        });

    window.network.force = d3.forceSimulation()
      .force('link', d3.forceLink()
        .id(d => d.id)
        .distance($('#default-link-length').val())
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
          .attr('cx', d => d.x)
          .attr('cy', d => d.y);
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
      d.fx = null;
      d.fy = null;
    }

    function showContextMenu(d){
      d3.event.preventDefault();
      hideTooltip();
      d3.select('#contextmenu')
        .style('left', (d3.event.pageX) + 'px')
        .style('top', (d3.event.pageY) + 'px')
        .style('opacity', 1);
      d3.select('#copyID').on('click', e => {
        clipboard.writeText(d.id);
        hideContextMenu();
      });
      d3.select('#copySeq').on('click', e => {
        clipboard.writeText(d.seq);
        hideContextMenu();
      });
    }

    function hideContextMenu(){
      var menu = d3.select('#contextmenu');
      menu
        .transition().duration(400)
        .style('opacity', 0)
        .on('end', () =>  menu.style('left', '0px').style('top', '0px'));
    }

    function showNodeToolTip(d){
      if($('#nodeTooltipVariable').val() == "none") return;
      d3.select('#tooltip')
        .html(d[$('#nodeTooltipVariable').val()])
        .style('left', (d3.event.pageX + 8) + 'px')
        .style('top', (d3.event.pageY - 28) + 'px')
        .transition().duration(400)
        .style('opacity', 1);
    }

    return(network);
  }

  function showLinkToolTip(d){
    var v = $('#linkTooltipVariable').val();
    if(v === 'none') return;
    d3.select('#tooltip')
      .html((v === 'source' || v === 'target') ? d[v].id : d[v])
      .style('left', (d3.event.pageX + 8) + 'px')
      .style('top', (d3.event.pageY - 28) + 'px')
      .transition().duration(400)
      .style('opacity', 1);
  }

  function hideTooltip(){
    var tooltip = d3.select('#tooltip');
    tooltip
      .transition().duration(400)
      .style('opacity', 0)
      .on('end', () => tooltip.style('left', '0px').style('top', '0px'));
  }

  $('#menu-toggle').click(e => $('#sidebar-wrapper').addClass('toggled'));
  $('#AppName, #main_panel').click(e => $('#sidebar-wrapper').removeClass('toggled'));

  $('#menu-toggle').click(e => $('#sidebar-wrapper').addClass('toggled'));
  $('#AppName, #AppVersion, #HideSidebar, #main_panel').click(e => $('#sidebar-wrapper').removeClass('toggled'));

  $('#FileTab').click(() => reset());

  $('#NetworkTab').click(() => {
    $('#sidebar-wrapper').removeClass('toggled');
    $('#physicsModal').modal('show');
  });

  $('#FileTab').click(() => reset());

  $('#SequencesTab').click(() => {
    ipcRenderer.send('launch-thing', 'views/sequences.html');
    $('#sidebar-wrapper').removeClass('toggled');
  });

  $('#TableTab').click(() => {
    ipcRenderer.send('launch-thing', 'views/table.html');
    $('#sidebar-wrapper').removeClass('toggled');
  });

  ipcRenderer.on('update-node-selection', (e, newNodes) => {
    window.nodes.forEach(d => d.selected = newNodes.find(e => e.id == d.id).selected);
    window.network.svg.select('.nodes').selectAll('circle')
      .data(window.nodes)
      .classed('selected', d => d.selected);
    $('#numberOfSelectedNodes').text(window.nodes.filter(d => d.selected).length.toLocaleString());
  });

  $('#HistogramTab').click(() => {
    ipcRenderer.send('launch-thing', 'views/histogram.html');
    $('#sidebar-wrapper').removeClass('toggled');
  });

  $('#MapTab').click(() => {
    ipcRenderer.send('launch-thing', 'views/map.html');
    $('#sidebar-wrapper').removeClass('toggled');
  });

  $('#HelpTab').click(() => {
    ipcRenderer.send('launch-thing', 'help/index.html');
    $('#sidebar-wrapper').removeClass('toggled');
  });

  function scaleNodeThing(scalar, variable, attribute, floor, reanimate){
    var circles = window.network.svg.selectAll('circle');
    if(variable === 'none'){
      return circles.attr(attribute, scalar);
    }
    if(!floor){floor = 1;}
    var values = Lazy(window.nodes)
      .pluck(variable)
      .uniq()
      .without(undefined)
      .sortBy()
      .toArray();
    var min = Math.min(...values);
    var max = Math.max(...values);
    var rng = max - min;
    circles.attr(attribute, d => {
      var v = d[variable];
      if(typeof v === 'undefined') v = rng / 2 + min;
      return scalar * (v - min) / rng + floor;
    });
    if(reanimate) window.network.force.alpha(0.3).alphaTarget(0).restart();
  }

  $('#default-node-radius').on('input', e => scaleNodeThing($('#default-node-radius').val(), $('#nodeRadiusVariable').val(), 'r', true));
  $('#nodeRadiusVariable').change(e => scaleNodeThing($('#default-node-radius').val(), $('#nodeRadiusVariable').val(), 'r', true));

  $('#default-node-opacity').on('input', e => scaleNodeThing($('#default-node-opacity').val(), $('#nodeOpacityVariable').val(), 'opacity', .1));
  $('#nodeOpacityVariable').change(e => scaleNodeThing($('#default-node-opacity').val(), $('#nodeOpacityVariable').val(), 'opacity', .1));

  $('#default-node-color').on('input', e => window.network.svg.selectAll('circle').attr('fill', e.target.value));
  $('#nodeColorVariable').change(e => {
    $('#default-node-color').fadeOut();
    var circles = window.network.svg.selectAll('circle')
      .data(window.nodes);
    var table = $('#nodeGroupKey').empty();
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
      var input = $('<input type="color" name="'+value+'-node-color-setter" value="'+o(value)+'" />')
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
    window.network.svg.select('.nodes').selectAll('circle')
      .data(window.nodes)
      .classed('selected', d => d.selected);
  });

  $('#default-link-length').on('input', e => {
    window.network.force.force('link').distance(e.target.value);
    window.network.force.alpha(0.3).alphaTarget(0).restart();
  });

  $('#default-link-strength').on('input', e => {
    window.network.force.force('link').strength(e.target.value);
    window.network.force.alpha(0.3).alphaTarget(0).restart();
  });

  $('#default-link-color').on('input', e => window.network.svg.selectAll('line').style('stroke', e.target.value));
  $('#linkColorVariable').change(e => {
    $('#default-link-color').fadeOut();
    var links = window.network.svg.selectAll('line');
    var table = $('#linkGroupKey').empty();
    if(e.target.value == 'none'){
      links.style('stroke', $('#default-link-color').val());
      $('#default-link-color').fadeIn();
      table.fadeOut();
      return;
    }
    table.append('<tr><th>'+e.target.value+'</th><th>Color</th><tr>');
    var values = Lazy(window.links).pluck(e.target.value).uniq().sortBy().toArray();
    var o = d3.scaleOrdinal(d3.schemeCategory10).domain(values);
    links.style('stroke', d => o(d[e.target.value]));
    values.forEach(value => {
      var input = $('<input type="color" name="'+value+'-node-color-setter" value="'+o(value)+'" />')
        .on('input', evt => {
          links
            .filter(d => d[e.target.value] === value)
            .style('stroke', d => evt.target.value);
        });
      var cell = $('<td></td>').append(input);
      var row = $('<tr><td>'+value+'</td></tr>').append(cell);
      table.append(row);
    });
    table.fadeIn();
  });

  function scaleLinkThing(scalar, variable, attribute, floor, reanimate){
    var links = window.network.svg.selectAll('line');
    if(variable === 'none'){
      return links.attr(attribute, scalar);
    }
    if(!floor){floor = 1;}
    var values = Lazy(window.links)
      .pluck(variable)
      .uniq()
      .without(undefined)
      .sortBy()
      .toArray();
    var min = Math.min(...values);
    var max = Math.max(...values);
    var rng = max - min;
    links.attr(attribute, d => {
      var v = d[variable];
      if(typeof v === 'undefined') v = rng / 2 + min;
      return scalar * (v - min) / rng + floor;
    });
    if(reanimate) window.network.force.alpha(0.3).alphaTarget(0).restart();
  }

  $('#default-link-opacity').on('input', e => scaleLinkThing($('#default-link-opacity').val(), $('#linkOpacityVariable').val(), 'opacity', .1));
  $('#linkOpacityVariable').change(e => scaleLinkThing($('#default-link-opacity').val(), $('#linkOpacityVariable').val(), 'opacity', .1));

  $('#default-link-width').on('input', e => scaleLinkThing($('#default-link-width').val(), $('#linkWidthVariable').val(), 'stroke-width'));
  $('#linkWidthVariable').change(e => scaleLinkThing($('#default-link-width').val(), $('#linkWidthVariable').val(), 'stroke-width'));

  var oldThreshold = computeThreshold();

  function refreshLinks(){
    var newThreshold = computeThreshold();
    var links = Lazy(window.links);
    if($('#showMSTLinks').is(':checked')){
      links = links.filter(link => link.mst);
    }
    var sortVar = $('#linkSortVariable').val();
    links = links
      .filter(link => link[sortVar] <= newThreshold)
      .toArray();
    var selection = window.network.svg
      .select('.links')
      .selectAll('line')
      .data(links);
    if(newThreshold > oldThreshold){
      selection.enter().append('line').merge(selection)
        .on('mouseenter', showLinkToolTip)
        .on('mouseout', hideTooltip);
      scaleLinkThing($('#default-link-width').val(), $('#linkWidthVariable').val(), 'stroke-width')
      window.network.force.nodes(window.nodes).on('tick', () => {
        selection
          .attr('x1', d => d.source.x)
          .attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x)
          .attr('y2', d => d.target.y);
        window.network.svg.select('.nodes').selectAll('circle')
          .attr('cx', d => d.x)
          .attr('cy', d => d.y)
          .classed('selected', d => d.selected);
      });
    } else {
      selection.exit().remove();
    }
    window.network.force.force('link').links(links);
    window.network.force.alpha(0.3).alphaTarget(0).restart();
    updateStatistics();
    oldThreshold = newThreshold;
  }

  $('#showMSTLinks, #showAllLinks').parent().click(e => {
    setLinkVisibility();
    refreshLinks();
  });

  $('#default-link-threshold').on('input', e => {
    setLinkVisibility();
    refreshLinks();
  });

  $('#hideNetworkStatistics').parent().click(() => $('#networkStatistics').fadeOut());
  $('#showNetworkStatistics').parent().click(() => $('#networkStatistics').fadeIn());

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

  $('#main_panel').click(e => $('#sidebar-wrapper').removeClass('toggled'));

  $('[data-toggle="tooltip"]').tooltip();

  $(document).on('keydown', e => {
    if (e.which === 123) {
      remote.getCurrentWindow().toggleDevTools();
    } else if (e.which === 116) {
      reset();
    }
  });
});

//override alertify defaults
alertify.defaults.transition = 'slide';
alertify.defaults.theme.ok = 'btn btn-primary';
alertify.defaults.theme.cancel = 'btn btn-danger';
alertify.defaults.theme.input = 'form-control';

// Small helpers you might want to keep
import './helpers/external_links.js';
import './helpers/window.js';
