/**
 * validate.js — Input validation. Turns raw text from the form into clean numbers,
 * or a list of readable errors that point at the exact cell to fix.
 */
(function (root) {
  'use strict';

  var LIMITS = {
    maxProcesses: 20, maxArrival: 500, maxBurst: 100, maxPriority: 99, maxQuantum: 50, maxIdLength: 8
  };
  var WHOLE = /^\d+$/;

  function parseWhole(text, min, max) {
    var s = String(text == null ? '' : text).trim();
    if (!WHOLE.test(s)) return null;
    var v = parseInt(s, 10);
    return v >= min && v <= max ? v : null;
  }

  /** rows: [{pid, arrival, burst, priority, queue}] as strings. */
  function validateProcesses(rows) {
    var errors = [], procs = [], seen = {};
    if (rows.length === 0) {
      errors.push({ row: -1, field: 'table', message: 'Add at least one process.' });
      return { errors: errors, procs: procs };
    }
    if (rows.length > LIMITS.maxProcesses) {
      errors.push({ row: -1, field: 'table', message: 'Use at most ' + LIMITS.maxProcesses + ' processes.' });
    }
    rows.forEach(function (r, i) {
      var label = 'Row ' + (i + 1) + ', ';
      var id = String(r.pid || '').trim();
      if (!id) errors.push({ row: i, field: 'pid', message: label + 'Process: enter a name such as P1.' });
      else if (id.length > LIMITS.maxIdLength) errors.push({ row: i, field: 'pid', message: label + 'Process: use ' + LIMITS.maxIdLength + ' characters or fewer.' });
      else if (seen[id.toLowerCase()]) errors.push({ row: i, field: 'pid', message: label + 'Process: "' + id + '" is already used. Names must be unique.' });
      seen[id.toLowerCase()] = true;

      var arrival = parseWhole(r.arrival, 0, LIMITS.maxArrival);
      var burst = parseWhole(r.burst, 1, LIMITS.maxBurst);
      var priority = parseWhole(r.priority, 1, LIMITS.maxPriority);
      if (arrival === null) errors.push({ row: i, field: 'arrival', message: label + 'Arrival: enter a whole number from 0 to ' + LIMITS.maxArrival + '.' });
      if (burst === null) errors.push({ row: i, field: 'burst', message: label + 'Burst: enter a whole number from 1 to ' + LIMITS.maxBurst + '.' });
      if (priority === null) errors.push({ row: i, field: 'priority', message: label + 'Priority: enter a whole number from 1 to ' + LIMITS.maxPriority + '.' });

      procs.push({ id: id, arrival: arrival, burst: burst, priority: priority, queue: parseInt(r.queue, 10) || 0 });
    });
    return { errors: errors, procs: procs };
  }

  /** Time quantum is only checked when a Round Robin queue is in use. */
  function validateQuantum(text) {
    var q = parseWhole(text, 1, LIMITS.maxQuantum);
    if (q === null) return { errors: [{ row: -1, field: 'quantum', message: 'Time quantum: enter a whole number from 1 to ' + LIMITS.maxQuantum + '.' }], quantum: null };
    return { errors: [], quantum: q };
  }

  var api = { LIMITS: LIMITS, validateProcesses: validateProcesses, validateQuantum: validateQuantum };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Validator = api;
})(typeof window !== 'undefined' ? window : this);
