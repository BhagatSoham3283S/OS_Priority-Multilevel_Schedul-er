/**
 * ui.js — Page behaviour: input table, running the simulation, drawing the Gantt
 * chart, timeline playback and the side-by-side comparison.
 * Depends on engine.js (Scheduler) and validate.js (Validator).
 */
(function () {
  'use strict';

  var S = window.Scheduler, V = window.Validator;
  var SAMPLE = [
    { pid: 'P1', arrival: '0', burst: '6', priority: '2', queue: '0' },
    { pid: 'P2', arrival: '1', burst: '4', priority: '4', queue: '1' },
    { pid: 'P3', arrival: '2', burst: '7', priority: '5', queue: '2' },
    { pid: 'P4', arrival: '4', burst: '3', priority: '1', queue: '0' },
    { pid: 'P5', arrival: '5', burst: '2', priority: '3', queue: '1' }
  ];
  var DEFAULT_POLICIES = ['PRIORITY', 'RR', 'FCFS'];

  var rows = SAMPLE.map(function (r) { return Object.assign({}, r); });
  var invalid = {};          // "row:field" -> true, used to mark cells after a failed run
  var hasResults = false;
  var panels = [];           // drawn result panels, updated during playback
  var play = { t: 0, total: 0, timer: null };

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(x, d) { return Number(x).toFixed(d); }
  function hueOf(i) { return Math.round((i * 137.5) % 360); }

  /* ---------- Input table ---------- */

  function renderRows() {
    var body = $('proc-body');
    body.innerHTML = rows.map(function (r, i) {
      var name = r.pid || 'row ' + (i + 1);
      return '<tr>' +
        td(i, 'pid', r, 'Process name of ' + name, 'text') +
        td(i, 'arrival', r, 'Arrival time of ' + name) +
        td(i, 'burst', r, 'Burst time of ' + name) +
        td(i, 'priority', r, 'Priority of ' + name) +
        '<td><select data-row="' + i + '" data-field="queue" aria-label="Queue of ' + esc(name) + '">' +
          S.QUEUE_NAMES.map(function (q, qi) { return '<option value="' + qi + '"' + (String(r.queue) === String(qi) ? ' selected' : '') + '>' + q + '</option>'; }).join('') +
        '</select></td>' +
        '<td><button type="button" class="icon-btn" data-remove="' + i + '" aria-label="Remove ' + esc(name) + '">&times;</button></td></tr>';
    }).join('');
    $('btn-add').disabled = rows.length >= V.LIMITS.maxProcesses;
    markInvalid();
  }
  function td(i, field, r, label) {
    var bad = invalid[i + ':' + field] ? ' aria-invalid="true"' : '';
    return '<td><input class="cell" data-row="' + i + '" data-field="' + field + '" value="' + esc(r[field]) + '"' +
      (field === 'pid' ? '' : ' inputmode="numeric"') + ' autocomplete="off" aria-label="' + esc(label) + '"' + bad + '></td>';
  }
  function markInvalid() { /* attributes are written in td(); kept as a hook for clarity */ }

  function nextPid() {
    var used = {}; rows.forEach(function (r) { used[String(r.pid).trim().toLowerCase()] = true; });
    var k = rows.length + 1;
    while (used['p' + k]) k++;
    return 'P' + k;
  }

  function clearErrors() { invalid = {}; var box = $('error-box'); box.hidden = true; box.innerHTML = ''; $('quantum').removeAttribute('aria-invalid'); }

  function showErrors(errors) {
    invalid = {};
    errors.forEach(function (e) { if (e.row >= 0) invalid[e.row + ':' + e.field] = true; });
    if (errors.some(function (e) { return e.field === 'quantum'; })) $('quantum').setAttribute('aria-invalid', 'true');
    renderRows();
    var box = $('error-box');
    box.innerHTML = '<strong>Fix ' + errors.length + (errors.length === 1 ? ' input' : ' inputs') + ' before running</strong><ul>' +
      errors.map(function (e) { return '<li>' + esc(e.message) + '</li>'; }).join('') + '</ul>';
    box.hidden = false;
  }

  /* ---------- Configuration ---------- */

  function currentMode() { return document.querySelector('input[name="algo"]:checked').value; }

  function setupPolicySelects() {
    [0, 1, 2].forEach(function (i) {
      var sel = $('pol-' + i);
      sel.innerHTML = Object.keys(S.POLICIES).map(function (k) {
        return '<option value="' + k + '"' + (k === DEFAULT_POLICIES[i] ? ' selected' : '') + '>' + S.POLICIES[k] + '</option>';
      }).join('');
    });
  }

  function syncConfigVisibility() {
    var m = currentMode();
    $('cfg-mlq').hidden = m === 'priority';
    $('cfg-priority').hidden = m === 'mlq';
  }

  /* ---------- Running ---------- */

  function run(fromButton) {
    var mode = currentMode();
    var check = V.validateProcesses(rows);
    var errors = check.errors.slice();
    var policies = [0, 1, 2].map(function (i) { return $('pol-' + i).value; });
    var quantum = 2;
    if (mode !== 'priority') {
      var q = V.validateQuantum($('quantum').value);
      errors = errors.concat(q.errors);
      quantum = q.quantum;
    }
    if (errors.length) { showErrors(errors); return; }
    clearErrors();
    renderRows();

    var results = [];
    if (mode !== 'priority') results.push(S.simulate(check.procs, { algorithm: 'mlq', policies: policies, quantum: quantum }));
    if (mode !== 'mlq') results.push(S.simulate(check.procs, { algorithm: 'priority', preemptive: $('preempt').value === 'yes' }));
    drawResults(results, check.procs);
    hasResults = true;
    if (fromButton) {
      var el = $('results');
      el.focus({ preventScroll: true });
      el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    }
  }

  /* ---------- Drawing results ---------- */

  function drawResults(results, procs) {
    stopPlay();
    play.total = Math.max.apply(null, results.map(function (r) { return r.total; }));
    play.t = play.total;

    var html = legendHtml(procs) + playerHtml();
    results.forEach(function (r, i) { html += panelHtml(r, i, procs); });
    if (results.length === 2) html += compareHtml(results[0], results[1]);
    html += notesHtml();
    $('results-body').innerHTML = html;

    panels = results.map(function (r, i) {
      var root = $('results-body').querySelector('[data-panel="' + i + '"]');
      return { res: r, unit: unitFor(r.total), veil: root.querySelector('.veil'), cursor: root.querySelector('.cursor'), readout: root.querySelector('.readout') };
    });
    bindPlayer();
    applyTime(play.t);
  }

  function legendHtml(procs) {
    return '<div class="legend" aria-label="Process colours">' + procs.map(function (p, i) {
      return '<span class="chip" style="--h:' + hueOf(i) + '">' + esc(p.id) + '<small>' + S.QUEUE_NAMES[p.queue] + '</small></span>';
    }).join('') + '</div>';
  }

  function playerHtml() {
    return '<div class="player" role="group" aria-label="Timeline playback">' +
      '<button type="button" class="btn ghost" id="pl-reset">Reset</button>' +
      '<button type="button" class="btn ghost" id="pl-back" aria-label="Step back one time unit">Back</button>' +
      '<button type="button" class="btn" id="pl-play">Play</button>' +
      '<button type="button" class="btn ghost" id="pl-fwd" aria-label="Step forward one time unit">Step</button>' +
      '<input type="range" id="pl-range" min="0" max="' + play.total + '" value="' + play.t + '" aria-label="Current time">' +
      '<span class="clock" id="pl-clock"></span>' +
      '<label>Speed <select id="pl-speed"><option value="600">Slow</option><option value="300" selected>Normal</option><option value="120">Fast</option></select></label>' +
      '</div>';
  }

  function unitFor(total) { return Math.max(4, Math.min(38, Math.floor(920 / total))); }

  function panelHtml(r, index, procs) {
    var unit = unitFor(r.total), idxOf = {};
    procs.forEach(function (p, i) { idxOf[p.id] = i; });
    var bar = r.segments.map(function (s) {
      var w = (s.end - s.start) * unit, len = s.end - s.start;
      if (s.id === null) return '<div class="seg idle" style="width:' + w + 'px" title="CPU idle, ' + s.start + ' to ' + s.end + '">' + (w >= 34 ? 'idle' : '') + '</div>';
      return '<div class="seg" style="width:' + w + 'px;--h:' + hueOf(idxOf[s.id]) + '" title="' + esc(s.id) + ': ' + s.start + ' to ' + s.end + ' (' + len + ' units)">' + (w >= 26 ? esc(s.id) : '') + '</div>';
    }).join('');

    var axis = '', lastLeft = -100;
    var marks = r.segments.map(function (s) { return s.start; }).concat([r.total]);
    marks.forEach(function (m) {
      var left = m * unit;
      if (left - lastLeft >= 24) { axis += '<span style="left:' + left + 'px">' + m + '</span>'; lastLeft = left; }
    });

    var isMLQ = r.algorithm === 'mlq';
    var head = '<th class="l" scope="col">Process</th>' + (isMLQ ? '<th class="l" scope="col">Queue</th>' : '') +
      '<th scope="col">AT</th><th scope="col">BT</th><th scope="col">Priority</th><th scope="col">CT</th><th scope="col">TAT</th><th scope="col">WT</th><th scope="col">RT</th>';
    var body = r.rows.map(function (x) {
      return '<tr><td class="l">' + esc(x.id) + '</td>' + (isMLQ ? '<td class="l">' + S.QUEUE_NAMES[x.queue] + '</td>' : '') +
        '<td>' + x.arrival + '</td><td>' + x.burst + '</td><td>' + x.priority + '</td><td>' + x.ct + '</td><td>' + x.tat + '</td><td>' + x.wt + '</td><td>' + x.rt + '</td></tr>';
    }).join('');
    var m = r.metrics;

    return '<article class="algo" data-panel="' + index + '">' +
      '<h3>' + esc(r.name) + '</h3><p class="sub">' + esc(r.detail) + '</p>' +
      '<div class="gantt-scroll"><div class="gantt" style="width:' + (r.total * unit) + 'px">' +
        '<div class="bar" role="img" aria-label="Gantt chart: ' + esc(r.segments.map(function (s) { return (s.id || 'idle') + ' ' + s.start + ' to ' + s.end; }).join(', ')) + '">' + bar + '</div>' +
        '<div class="veil"></div><div class="cursor"></div>' +
        '<div class="axis">' + axis + '</div></div></div>' +
      '<div class="readout" aria-live="off"></div>' +
      '<dl class="metrics">' +
        metric('Avg waiting time', fmt(m.avgWT, 2)) + metric('Avg turnaround', fmt(m.avgTAT, 2)) + metric('Avg response', fmt(m.avgRT, 2)) +
        metric('CPU utilization', fmt(m.util, 1) + '%') + metric('Throughput', fmt(m.throughput, 3)) + metric('Context switches', m.cs) +
      '</dl>' +
      '<div class="table-wrap"><table class="data"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>' +
      '</article>';
  }
  function metric(label, value) { return '<div><dt>' + label + '</dt><dd>' + value + '</dd></div>'; }

  /* ---------- Comparison ---------- */

  function compareHtml(a, b) {
    var defs = [
      ['Average waiting time', 'avgWT', 2, 'low'], ['Average turnaround time', 'avgTAT', 2, 'low'],
      ['Average response time', 'avgRT', 2, 'low'], ['CPU utilization (%)', 'util', 1, 'high'],
      ['Throughput (processes per unit)', 'throughput', 3, 'high'], ['Context switches', 'cs', 0, 'low']
    ];
    var shortA = 'Multilevel Queue', shortB = 'Priority';
    var rowsHtml = defs.map(function (d) {
      var va = a.metrics[d[1]], vb = b.metrics[d[1]];
      var eq = Math.abs(va - vb) < 1e-9, aWins = d[3] === 'low' ? va < vb : va > vb;
      var who = eq ? 'Tie' : (aWins ? shortA : shortB);
      return '<tr><td class="l">' + d[0] + '</td><td class="' + (!eq && aWins ? 'win' : '') + '">' + fmt(va, d[2]) + '</td><td class="' + (!eq && !aWins ? 'win' : '') + '">' + fmt(vb, d[2]) + '</td><td class="l">' + who + '</td></tr>';
    }).join('');

    var maxWT = Math.max.apply(null, a.rows.concat(b.rows).map(function (r) { return r.wt; }).concat([1]));
    var bars = a.rows.map(function (ra, i) {
      var rb = b.rows[i];
      return '<div class="bar-row"><span class="chip" style="--h:' + hueOf(i) + '">' + esc(ra.id) + '</span><div class="bar-pair">' +
        '<div class="hb a"><i style="width:' + (ra.wt / maxWT * 100) * 0.8 + '%"></i><em>' + ra.wt + '</em></div>' +
        '<div class="hb b"><i style="width:' + (rb.wt / maxWT * 100) * 0.8 + '%"></i><em>' + rb.wt + '</em></div></div></div>';
    }).join('');

    return '<section class="compare" aria-labelledby="h-compare"><h3 id="h-compare">Comparison on the same input</h3>' +
      '<p class="summary">' + summaryText(a, b, shortA, shortB) + '</p>' +
      '<div class="table-wrap"><table class="data"><thead><tr><th class="l" scope="col">Metric</th><th scope="col">' + shortA + '</th><th scope="col">' + shortB + '</th><th class="l" scope="col">Better</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>' +
      '<h3>Waiting time per process</h3>' +
      '<div class="key"><span class="a"><i></i>' + shortA + '</span><span class="b"><i></i>' + shortB + '</span></div>' +
      '<div class="bars">' + bars + '</div></section>';
  }

  function summaryText(a, b, nameA, nameB) {
    function line(label, key) {
      var va = a.metrics[key], vb = b.metrics[key];
      if (Math.abs(va - vb) < 1e-9) return 'Average ' + label + ' is the same for both (' + fmt(va, 2) + ').';
      var w = va < vb ? nameA : nameB;
      return 'Average ' + label + ' is lower with ' + w + ' (' + fmt(Math.min(va, vb), 2) + ' against ' + fmt(Math.max(va, vb), 2) + ').';
    }
    return line('waiting time', 'avgWT') + ' ' + line('turnaround time', 'avgTAT') + ' This holds for the process set above only; a different workload can change the outcome.';
  }

  function notesHtml() {
    return '<details class="notes"><summary>How the numbers are calculated</summary><ul>' +
      '<li>CT, completion time: when the process finishes. TAT = CT - AT. WT = TAT - BT. RT, response time = first CPU start - AT.</li>' +
      '<li>CPU utilization = total burst time / time of the last completion, from time 0.</li>' +
      '<li>Throughput = processes completed / time of the last completion.</li>' +
      '<li>A context switch is counted each time the CPU moves directly from one process to a different one. Starting after idle time is not counted.</li>' +
      '<li>Between queues, a process preempted by a higher queue returns to the front of its own queue. A Round Robin process whose quantum ends goes to the back, after any new arrivals at that moment.</li>' +
      '</ul></details>';
  }

  /* ---------- Playback ---------- */

  function bindPlayer() {
    $('pl-range').addEventListener('input', function (e) { stopPlay(); applyTime(parseInt(e.target.value, 10)); });
    $('pl-reset').addEventListener('click', function () { stopPlay(); applyTime(0); });
    $('pl-back').addEventListener('click', function () { stopPlay(); applyTime(play.t - 1); });
    $('pl-fwd').addEventListener('click', function () { stopPlay(); applyTime(play.t + 1); });
    $('pl-play').addEventListener('click', function () { if (play.timer) stopPlay(); else startPlay(); });
    $('pl-speed').addEventListener('change', function () { if (play.timer) { stopPlay(); startPlay(); } });
  }

  function startPlay() {
    if (play.t >= play.total) applyTime(0);
    var ms = parseInt($('pl-speed').value, 10);
    $('pl-play').textContent = 'Pause';
    play.timer = setInterval(function () {
      if (play.t >= play.total) { stopPlay(); return; }
      applyTime(play.t + 1);
      if (play.t >= play.total) stopPlay();
    }, ms);
  }

  function stopPlay() {
    if (play.timer) { clearInterval(play.timer); play.timer = null; }
    var b = $('pl-play'); if (b) b.textContent = 'Play';
  }

  /** Move the cursor to time t on every drawn chart and refresh the state readouts. */
  function applyTime(t) {
    play.t = Math.max(0, Math.min(play.total, t));
    var range = $('pl-range'), clock = $('pl-clock');
    if (range) range.value = play.t;
    if (clock) clock.textContent = 't = ' + play.t + ' / ' + play.total;
    panels.forEach(function (p) {
      var x = Math.min(play.t, p.res.total) * p.unit;
      p.cursor.style.left = (x - 1) + 'px';
      p.veil.style.width = Math.max(0, p.res.total * p.unit - x) + 'px';
      p.readout.innerHTML = readoutHtml(p.res, play.t);
    });
  }

  function chips(ids, procIndex) {
    if (!ids.length) return '<span class="none">empty</span>';
    return ids.map(function (id) { return '<span class="chip" style="--h:' + hueOf(procIndex[id]) + '">' + esc(id) + '</span>'; }).join('');
  }

  function readoutHtml(r, t) {
    var idx = {}; r.rows.forEach(function (x, i) { idx[x.id] = i; });
    if (t >= r.total) return '<div class="rd-head"><span class="t">t = ' + r.total + '</span><span>All processes finished.</span></div>';
    var tick = r.ticks[t];
    var h = '<div class="rd-head"><span class="t">t = ' + t + '</span><span>CPU: ' + (tick.run ? chips([tick.run], idx) : '<span class="none">idle</span>') + '</span></div>';
    if (r.algorithm === 'mlq') {
      S.QUEUE_NAMES.forEach(function (name, qi) {
        h += '<div class="rd-line"><span class="k">' + name + ' queue</span>' + chips(tick.queues[qi], idx) + '</div>';
      });
    } else {
      h += '<div class="rd-line"><span class="k">Ready queue</span>' + chips(tick.queues[0], idx) + '</div>';
    }
    return h;
  }

  /* ---------- Wiring ---------- */

  function init() {
    setupPolicySelects();
    renderRows();
    syncConfigVisibility();

    $('proc-body').addEventListener('input', function (e) {
      var el = e.target, i = parseInt(el.getAttribute('data-row'), 10), f = el.getAttribute('data-field');
      if (isNaN(i) || !f) return;
      rows[i][f] = el.value;
      el.removeAttribute('aria-invalid'); delete invalid[i + ':' + f];
    });
    $('proc-body').addEventListener('click', function (e) {
      var b = e.target.closest('[data-remove]');
      if (!b) return;
      rows.splice(parseInt(b.getAttribute('data-remove'), 10), 1);
      clearErrors(); renderRows();
    });
    $('btn-add').addEventListener('click', function () {
      if (rows.length >= V.LIMITS.maxProcesses) return;
      rows.push({ pid: nextPid(), arrival: '0', burst: '1', priority: '1', queue: '0' });
      clearErrors(); renderRows();
      var inputs = document.querySelectorAll('#proc-body tr:last-child input'); if (inputs.length) inputs[0].focus();
    });
    $('btn-sample').addEventListener('click', function () {
      rows = SAMPLE.map(function (r) { return Object.assign({}, r); });
      clearErrors(); renderRows();
    });
    $('btn-clear').addEventListener('click', function () { rows = []; clearErrors(); renderRows(); });
    $('quantum').addEventListener('input', function () { this.removeAttribute('aria-invalid'); });

    Array.prototype.forEach.call(document.querySelectorAll('input[name="algo"]'), function (r) {
      r.addEventListener('change', function () { syncConfigVisibility(); if (hasResults) run(false); });
    });
    ['pol-0', 'pol-1', 'pol-2', 'preempt', 'quantum'].forEach(function (id) {
      $(id).addEventListener('change', function () { if (hasResults) run(false); });
    });
    $('btn-run').addEventListener('click', function () { run(true); });

    // Show the sample result straight away so the page is never empty.
    run(false);
  }

  init();
})();
