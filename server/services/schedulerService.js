// ══════════════════════════════════════════════════════════════
//   services/schedulerService.js
//   Backend Scheduling Engine — all 6 algorithms
// ══════════════════════════════════════════════════════════════
"use strict";

const COLORS = [
  '#00e5a0','#00b8ff','#ff6b35','#c084fc',
  '#ffcc00','#ff4466','#22d3ee','#fb923c','#a3e635','#e879f9'
];

function colorForIdx(i) { return COLORS[i % COLORS.length]; }

/* ── Deep clone processes with scheduling fields ── */
function cloneProcs(procs) {
  return procs.map((p, i) => ({
    ...p,
    color:     p.color || colorForIdx(i),
    remaining: p.burst,
    firstRun:  -1,
    completion: 0
  }));
}

/* ── Merge consecutive same-PID blocks ── */
function mergeSegments(sched) {
  if (!sched.length) return [];
  const out = [{ ...sched[0] }];
  for (let i = 1; i < sched.length; i++) {
    const last = out[out.length - 1];
    if (sched[i].pid === last.pid && sched[i].start === last.end) {
      last.end = sched[i].end;
    } else {
      out.push({ ...sched[i] });
    }
  }
  return out;
}

/* ── Attach color + build result rows ── */
function buildResults(ps, schedule) {
  const colored = schedule.map(s => {
    const p = ps.find(x => x.pid === s.pid);
    return { ...s, color: p ? p.color : '#888' };
  });
  const results = ps.map(p => ({
    pid:        p.pid,
    arrival:    p.arrival,
    burst:      p.burst,
    priority:   p.priority || 1,
    color:      p.color,
    completion: p.completion,
    turnaround: p.completion - p.arrival,
    waiting:    p.completion - p.arrival - p.burst,
    response:   p.firstRun - p.arrival
  }));
  return { schedule: colored, results };
}

/* ── Compute aggregate statistics ── */
function computeStats(results, schedule) {
  const n        = results.length;
  const awt      = results.reduce((s, r) => s + r.waiting, 0) / n;
  const atat     = results.reduce((s, r) => s + r.turnaround, 0) / n;
  const art      = results.reduce((s, r) => s + r.response, 0) / n;
  const totalBurst = results.reduce((s, r) => s + r.burst, 0);
  const makespan   = Math.max(...schedule.map(s => s.end));
  const cpuUtil    = (totalBurst / makespan) * 100;
  const throughput = n / makespan;
  return { awt, atat, art, cpuUtil, throughput, n };
}

// ──────────────────────────────────────────────
//  ALGORITHMS
// ──────────────────────────────────────────────

/** FCFS — First Come First Serve */
function runFCFS(procs) {
  const ps = cloneProcs(procs).sort((a, b) => a.arrival - b.arrival);
  const schedule = [];
  let time = 0;
  for (const p of ps) {
    if (time < p.arrival) time = p.arrival;
    p.firstRun = time;
    schedule.push({ pid: p.pid, start: time, end: time + p.burst });
    time += p.burst;
    p.completion = time;
  }
  return buildResults(ps, schedule);
}

/** SJF Non-Preemptive */
function runSJF(procs) {
  const ps = cloneProcs(procs);
  const schedule = [];
  let time = 0;
  const done = new Set();
  while (done.size < ps.length) {
    const avail = ps.filter(p => p.arrival <= time && !done.has(p.pid));
    if (!avail.length) { time++; continue; }
    avail.sort((a, b) => a.burst - b.burst || a.arrival - b.arrival);
    const p = avail[0];
    if (p.firstRun < 0) p.firstRun = time;
    schedule.push({ pid: p.pid, start: time, end: time + p.burst });
    time += p.burst;
    p.completion = time;
    done.add(p.pid);
  }
  return buildResults(ps, schedule);
}

/** SRTF — Shortest Remaining Time First (Preemptive SJF) */
function runSRTF(procs) {
  const ps = cloneProcs(procs);
  const schedule = [];
  let time = 0, lastPid = null, segStart = 0;
  const done = new Set();
  while (done.size < ps.length) {
    const avail = ps.filter(p => p.arrival <= time && !done.has(p.pid));
    if (!avail.length) {
      // CPU idle — close the running segment so idle time isn't absorbed into it
      if (lastPid !== null) { schedule.push({ pid: lastPid, start: segStart, end: time }); lastPid = null; }
      time++;
      continue;
    }
    avail.sort((a, b) => a.remaining - b.remaining || a.arrival - b.arrival);
    const p = avail[0];
    if (p.firstRun < 0) p.firstRun = time;
    if (p.pid !== lastPid) {
      if (lastPid !== null) schedule.push({ pid: lastPid, start: segStart, end: time });
      segStart = time; lastPid = p.pid;
    }
    p.remaining--;
    time++;
    if (p.remaining === 0) { p.completion = time; done.add(p.pid); }
  }
  if (lastPid !== null) schedule.push({ pid: lastPid, start: segStart, end: time });
  return buildResults(ps, mergeSegments(schedule));
}

/** Round Robin */
function runRR(procs, quantum) {
  const ps = cloneProcs(procs).sort((a, b) => a.arrival - b.arrival);
  const schedule = [];
  let time = 0;
  const queue = [], enqueued = new Set(), done = new Set();
  let i = 0;
  while (i < ps.length && ps[i].arrival <= time) {
    queue.push(ps[i]); enqueued.add(ps[i].pid); i++;
  }
  while (done.size < ps.length) {
    if (!queue.length) {
      time = ps[i].arrival;
      while (i < ps.length && ps[i].arrival <= time) {
        queue.push(ps[i]); enqueued.add(ps[i].pid); i++;
      }
      continue;
    }
    const p = queue.shift();
    if (p.firstRun < 0) p.firstRun = time;
    const run = Math.min(p.remaining, quantum);
    schedule.push({ pid: p.pid, start: time, end: time + run });
    time += run; p.remaining -= run;
    while (i < ps.length && ps[i].arrival <= time) {
      if (!enqueued.has(ps[i].pid)) { queue.push(ps[i]); enqueued.add(ps[i].pid); }
      i++;
    }
    if (p.remaining === 0) { p.completion = time; done.add(p.pid); }
    else queue.push(p);
  }
  return buildResults(ps, schedule);
}

/** Priority Non-Preemptive (lower number = higher priority) */
function runPriority(procs) {
  const ps = cloneProcs(procs);
  const schedule = [];
  let time = 0;
  const done = new Set();
  while (done.size < ps.length) {
    const avail = ps.filter(p => p.arrival <= time && !done.has(p.pid));
    if (!avail.length) { time++; continue; }
    avail.sort((a, b) => a.priority - b.priority || a.arrival - b.arrival);
    const p = avail[0];
    if (p.firstRun < 0) p.firstRun = time;
    schedule.push({ pid: p.pid, start: time, end: time + p.burst });
    time += p.burst; p.completion = time;
    done.add(p.pid);
  }
  return buildResults(ps, schedule);
}

/** Priority Preemptive */
function runPriorityPre(procs) {
  const ps = cloneProcs(procs);
  const schedule = [];
  let time = 0, lastPid = null, segStart = 0;
  const done = new Set();
  while (done.size < ps.length) {
    const avail = ps.filter(p => p.arrival <= time && !done.has(p.pid));
    if (!avail.length) {
      // CPU idle — close the running segment so idle time isn't absorbed into it
      if (lastPid !== null) { schedule.push({ pid: lastPid, start: segStart, end: time }); lastPid = null; }
      time++;
      continue;
    }
    avail.sort((a, b) => a.priority - b.priority || a.arrival - b.arrival);
    const p = avail[0];
    if (p.firstRun < 0) p.firstRun = time;
    if (p.pid !== lastPid) {
      if (lastPid !== null) schedule.push({ pid: lastPid, start: segStart, end: time });
      segStart = time; lastPid = p.pid;
    }
    p.remaining--;
    time++;
    if (p.remaining === 0) { p.completion = time; done.add(p.pid); }
  }
  if (lastPid !== null) schedule.push({ pid: lastPid, start: segStart, end: time });
  return buildResults(ps, mergeSegments(schedule));
}

/* ── Main dispatcher ── */
function dispatch(algo, procs, quantum = 2) {
  switch (algo) {
    case 'fcfs':         return runFCFS(procs);
    case 'sjf':          return runSJF(procs);
    case 'srtf':         return runSRTF(procs);
    case 'rr':           return runRR(procs, quantum);
    case 'priority':     return runPriority(procs);
    case 'priority_pre': return runPriorityPre(procs);
    default:             return runFCFS(procs);
  }
}

/* ── Run all 6 for comparison ── */
function runComparison(procs, quantum = 2) {
  const algos = ['fcfs','sjf','srtf','rr','priority','priority_pre'];
  const labels = {
    fcfs: 'FCFS', sjf: 'SJF (NP)', srtf: 'SRTF',
    rr: `Round Robin (q=${quantum})`,
    priority: 'Priority (NP)', priority_pre: 'Priority (Pre)'
  };
  return algos.map(algo => {
    const { schedule, results } = dispatch(algo, procs, quantum);
    const stats = computeStats(results, schedule);
    return { algo, label: labels[algo], ...stats };
  });
}

module.exports = { dispatch, computeStats, runComparison };
