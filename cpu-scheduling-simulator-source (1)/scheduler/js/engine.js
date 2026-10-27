/**
 * engine.js — Scheduling engine (pure logic, no DOM access).
 *
 * Both algorithms run on the same discrete-time engine: the CPU is advanced one
 * time unit at a time, so preemption (by a higher queue, by a higher priority,
 * or by an expired Round Robin quantum) is handled the same way everywhere.
 *
 *   Algorithm 1 - Multilevel Queue (MLQ): 3 queues (System > Interactive > Batch),
 *                 each with its own policy. A ready process in a higher queue
 *                 always preempts a lower queue (fixed-priority between queues).
 *   Algorithm 2 - Priority Scheduling: one ready set, smaller number = higher
 *                 priority, non-preemptive or preemptive.
 */
(function (root) {
  'use strict';

  var QUEUE_NAMES = ['System', 'Interactive', 'Batch'];
  var POLICIES = {
    FCFS: 'FCFS',
    RR: 'Round Robin',
    PRIORITY: 'Priority',
    PRIORITY_P: 'Priority (preemptive)'
  };

  /** Ordering used by every priority decision: priority, then arrival, then input order. */
  function byPriority(a, b) {
    return a.priority - b.priority || a.arrival - b.arrival || a.idx - b.idx;
  }

  /** Index of the process a queue's policy would pick next. */
  function pickIndex(queue, policy) {
    if (policy === 'PRIORITY' || policy === 'PRIORITY_P') {
      var best = 0;
      for (var i = 1; i < queue.length; i++) {
        if (byPriority(queue[i], queue[best]) < 0) best = i;
      }
      return best;
    }
    return 0; // FCFS and RR take the head of the queue
  }

  /**
   * Run one simulation.
   * @param {Array}  input   [{id, arrival, burst, priority, queue}] with numeric fields
   * @param {Object} config  {algorithm:'mlq'|'priority', policies:[p0,p1,p2], quantum, preemptive}
   */
  function simulate(input, config) {
    var isMLQ = config.algorithm === 'mlq';
    var procs = input.map(function (p, i) {
      return { id: p.id, arrival: p.arrival, burst: p.burst, priority: p.priority,
               queue: p.queue, idx: i, remaining: p.burst, start: null, ct: null };
    });
    var n = procs.length;
    var queues = isMLQ ? [[], [], []] : [[]];
    var qOf = function (p) { return isMLQ ? p.queue : 0; };
    var policyOf = function (qi) {
      if (isMLQ) return config.policies[qi];
      return config.preemptive ? 'PRIORITY_P' : 'PRIORITY';
    };
    var arrivals = procs.slice().sort(function (a, b) { return a.arrival - b.arrival || a.idx - b.idx; });

    var t = 0, done = 0, ai = 0, running = null, slice = 0;
    var ticks = []; // ticks[t] = state while the CPU works during [t, t+1)

    while (done < n) {
      // 1. Admit processes that have arrived by time t.
      while (ai < n && arrivals[ai].arrival <= t) {
        queues[qOf(arrivals[ai])].push(arrivals[ai]);
        ai++;
      }

      // 2. Decide whether the running process must give up the CPU.
      if (running) {
        var rq = qOf(running), pol = policyOf(rq), preempt = false, toFront = false;
        for (var h = 0; h < rq; h++) {
          if (queues[h].length) { preempt = true; toFront = true; break; } // higher queue ready
        }
        if (!preempt && pol === 'RR' && slice >= config.quantum) preempt = true; // quantum used up
        if (!preempt && pol === 'PRIORITY_P' && queues[rq].length) {
          var cand = queues[rq][pickIndex(queues[rq], pol)];
          if (cand.priority < running.priority) preempt = true; // strictly higher priority arrived
        }
        if (preempt) {
          if (toFront) queues[rq].unshift(running); else queues[rq].push(running);
          running = null;
        }
      }

      // 3. Dispatch from the highest non-empty queue.
      if (!running) {
        for (var qi = 0; qi < queues.length; qi++) {
          if (queues[qi].length) {
            running = queues[qi].splice(pickIndex(queues[qi], policyOf(qi)), 1)[0];
            slice = 0;
            break;
          }
        }
      }

      // 4. Record the state and execute one time unit.
      ticks.push({
        run: running ? running.id : null,
        queues: queues.map(function (q) { return q.map(function (p) { return p.id; }); })
      });
      if (running) {
        if (running.start === null) running.start = t;
        running.remaining--;
        slice++;
        if (running.remaining === 0) { running.ct = t + 1; done++; running = null; }
      }
      t++;
    }

    return buildResult(procs, ticks, t, config, isMLQ);
  }

  /** Merge per-tick records into Gantt segments, then compute all metrics. */
  function buildResult(procs, ticks, total, config, isMLQ) {
    var segments = [];
    ticks.forEach(function (tk, time) {
      var last = segments[segments.length - 1];
      if (last && last.id === tk.run) last.end = time + 1;
      else segments.push({ id: tk.run, start: time, end: time + 1 });
    });

    // Context switch = CPU moves directly from one process to a different one.
    var cs = 0, prev = null;
    segments.forEach(function (s) {
      if (s.id === null) { prev = null; return; }
      if (prev !== null && prev !== s.id) cs++;
      prev = s.id;
    });

    var rows = procs.map(function (p) {
      var tat = p.ct - p.arrival;
      return { id: p.id, queue: p.queue, arrival: p.arrival, burst: p.burst, priority: p.priority,
               ct: p.ct, tat: tat, wt: tat - p.burst, rt: p.start - p.arrival };
    });
    var avg = function (key) {
      return rows.reduce(function (s, r) { return s + r[key]; }, 0) / rows.length;
    };
    var busy = rows.reduce(function (s, r) { return s + r.burst; }, 0);

    return {
      algorithm: config.algorithm,
      name: isMLQ ? 'Multilevel Queue Scheduling' : 'Priority Scheduling',
      detail: isMLQ ? describeMLQ(config) : (config.preemptive ? 'Preemptive' : 'Non-preemptive') + ', smaller number = higher priority',
      total: total, ticks: ticks, segments: segments, rows: rows,
      metrics: {
        avgWT: avg('wt'), avgTAT: avg('tat'), avgRT: avg('rt'),
        util: busy / total * 100, throughput: rows.length / total, cs: cs
      }
    };
  }

  function describeMLQ(config) {
    return QUEUE_NAMES.map(function (name, i) {
      var p = config.policies[i];
      return name + ': ' + POLICIES[p] + (p === 'RR' ? ' (q = ' + config.quantum + ')' : '');
    }).join(', ');
  }

  var api = { QUEUE_NAMES: QUEUE_NAMES, POLICIES: POLICIES, simulate: simulate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Scheduler = api;
})(typeof window !== 'undefined' ? window : this);
