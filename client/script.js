/* ══════════════════════════════════════════════════════════════
   CPU Scheduling Simulator v2.0 — script.js
   Full-Stack Edition: Auth + Backend API + Socket.IO
   Client-side algorithms kept as instant fallback
══════════════════════════════════════════════════════════════ */
"use strict";

// ════════════════════════════════════════════════════════
// 1.  CONSTANTS & STATE
// ════════════════════════════════════════════════════════
// ── Backend wiring ─────────────────────────────────────────
// Configured in index.html via `window.CPUSIM_API`.
//   ""                     → standalone static demo, everything runs in the browser
//   "/"                    → full-stack, backend served from the same origin (Express)
//   "https://api.host.com" → full-stack, remote backend
const RAW_API = (typeof window !== 'undefined' && typeof window.CPUSIM_API === 'string')
  ? window.CPUSIM_API.trim() : '';
const BACKEND_ENABLED = RAW_API !== '';
const API = RAW_API === '/' ? '' : RAW_API.replace(/\/+$/, '');

const COLORS = ['#00e5a0','#00b8ff','#ff6b35','#c084fc','#ffcc00','#ff4466','#22d3ee','#fb923c','#a3e635','#e879f9'];

const ALGO_INFO = {
  fcfs:         { name:'FCFS — First Come First Serve',         body:'Executes processes in arrival order. Simple but can cause the convoy effect where short jobs wait behind long ones.' },
  sjf:          { name:'SJF — Shortest Job First (NP)',         body:'Selects the shortest available burst time. Optimal average waiting time for a static batch but requires advance knowledge of burst times.' },
  srtf:         { name:'SRTF — Shortest Remaining Time First',  body:'Preemptive SJF. Preempts if a newcomer has a shorter remaining burst. Gives theoretically optimal average waiting time.' },
  rr:           { name:'Round Robin',                           body:'Each process runs for a fixed quantum in turn. Fairness and responsiveness depend heavily on quantum size.' },
  priority:     { name:'Priority Scheduling (Non-Preemptive)',  body:'Highest-priority (lowest number) process runs to completion. Low-priority processes may starve without aging.' },
  priority_pre: { name:'Priority Scheduling (Preemptive)',      body:'Higher-priority arrivals immediately preempt the running process. Very responsive but high context-switch overhead.' }
};

// App state
let processes   = [];
let results     = [];
let ganttData   = [];
let simRunning  = false;
let paused      = false;
let stepQueue   = [];
let stepIdx     = 0;
let animTimer   = null;
let soundEnabled= false;
let editTarget  = null;

// Auth state
let authToken   = localStorage.getItem('cpusim_token') || null;
let currentUser = JSON.parse(localStorage.getItem('cpusim_user') || 'null');
let lastSimData = null; // holds last run result for saving

// Socket.IO
let socket = null;

// ════════════════════════════════════════════════════════
// 2.  INIT
// ════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  applyBackendMode();
  initTheme();
  initLoader();
  initClock();
  initCPUMeter();
  initTyping();
  initScrollReveal();
  initKeyboard();
  initSpeedSlider();
  initSocket();
  updateAuthUI();
  renderTable();
  setupModalBackdrops();
});

/* ── Hide every server-dependent control when running as the standalone demo ── */
function applyBackendMode() {
  if (BACKEND_ENABLED) return;
  ['authNav','userNav','socketStatus','backendModeRow'].forEach(id => {
    document.getElementById(id)?.classList.add('hidden');
  });
  document.querySelectorAll('.auth-only, .admin-only').forEach(el => el.classList.add('hidden'));
  const cb = document.getElementById('useBackend');
  if (cb) cb.checked = false;
}

function initLoader() {
  setTimeout(() => document.getElementById('loader').classList.add('hidden'), 1600);
}

function initTheme() {
  const saved = localStorage.getItem('cpusim_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  document.getElementById('themeToggle').textContent = saved === 'dark' ? '☀' : '☾';
}

document.getElementById('themeToggle').addEventListener('click', () => {
  const cur  = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('cpusim_theme', next);
  document.getElementById('themeToggle').textContent = next === 'dark' ? '☀' : '☾';
});

document.getElementById('fullscreenBtn').addEventListener('click', () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
});

document.getElementById('soundToggle').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  document.getElementById('soundToggle').style.color = soundEnabled ? 'var(--accent)' : '';
  showToast(soundEnabled ? 'Sound ON' : 'Sound OFF');
});

function initClock() {
  const el = document.getElementById('liveClock');
  const tick = () => { el.textContent = new Date().toLocaleTimeString(); };
  tick(); setInterval(tick, 1000);
}

// ════════════════════════════════════════════════════════
// 3.  SOCKET.IO
// ════════════════════════════════════════════════════════
function initSocket() {
  if (!BACKEND_ENABLED) return;
  // The Socket.IO client is served by the backend, so load it from there.
  const s = document.createElement('script');
  s.src = (API || '') + '/socket.io/socket.io.js';
  s.onload = connectSocket;
  s.onerror = () => console.warn('Socket.IO client unavailable — real-time updates disabled');
  document.head.appendChild(s);
}

function connectSocket() {
  if (typeof io === 'undefined') return;
  try {
    socket = io(API || undefined, { transports: ['websocket','polling'] });
    const indicator = document.getElementById('socketStatus');

    socket.on('connect', () => {
      indicator.classList.add('connected');
      if (currentUser) socket.emit('join:user', currentUser.id);
    });

    socket.on('disconnect', () => indicator.classList.remove('connected'));

    socket.on('notification', (data) => {
      showNotifBanner(data.message, data.type || 'info');
    });

    socket.on('simulation:complete', (data) => {
      // Another user or tab ran a simulation — show subtle notification
      if (data.userId && currentUser && data.userId !== currentUser.id) {
        showToast('Live: another user just ran a simulation');
      }
    });

    socket.on('queue:update', (data) => {
      // Real-time queue state from server during step mode
      updateQueueChips(data);
    });
  } catch {
    console.warn('Socket.IO not available — running offline');
  }
}

// ════════════════════════════════════════════════════════
// 4.  AUTH
// ════════════════════════════════════════════════════════
function updateAuthUI() {
  if (!BACKEND_ENABLED) return; // standalone demo — auth UI stays hidden
  const isAuth  = !!authToken;
  const isAdmin = currentUser?.role === 'admin';

  document.getElementById('authNav').classList.toggle('hidden',  isAuth);
  document.getElementById('userNav').classList.toggle('hidden', !isAuth);

  if (currentUser) {
    document.getElementById('userChip').textContent = currentUser.username;
  }

  // Show/hide auth-only sections
  document.querySelectorAll('.auth-only').forEach(el => el.classList.toggle('hidden', !isAuth));
  document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', !isAdmin));

  if (isAuth) {
    loadSavedSims();
    if (isAdmin) loadAdminStats();
  }
}

/* ── Open / close auth modal ── */
function openAuthModal(tab = 'login') {
  switchAuthTab(tab);
  document.getElementById('authModal').classList.remove('hidden');
}
function closeAuthModal() { document.getElementById('authModal').classList.add('hidden'); }

function switchAuthTab(tab) {
  document.getElementById('loginForm').classList.toggle('hidden', tab !== 'login');
  document.getElementById('registerForm').classList.toggle('hidden', tab !== 'register');
  document.getElementById('tabLogin').classList.toggle('active', tab === 'login');
  document.getElementById('tabRegister').classList.toggle('active', tab !== 'login');
}

/* ── Register ── */
async function register() {
  const username = document.getElementById('regUsername').value.trim();
  const email    = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const errEl    = document.getElementById('registerError');
  errEl.textContent = '';

  if (!username) { errEl.textContent = 'Username is required.'; return; }
  if (username.length < 3) { errEl.textContent = 'Username must be at least 3 characters.'; return; }

  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(com|net|org|edu|gov|io|co)$/;
  if (!email) { errEl.textContent = 'Email is required.'; return; }
  if (!emailRegex.test(email)) { errEl.textContent = 'Invalid email! Use format: user@gmail.com'; return; }

  if (!password) { errEl.textContent = 'Password is required.'; return; }
  if (password.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; return; }

  try {
    const res  = await apiFetch('/api/auth/register', 'POST', { username, email, password });
    authToken   = res.token;
    currentUser = res.user;
    localStorage.setItem('cpusim_token', authToken);
    localStorage.setItem('cpusim_user',  JSON.stringify(currentUser));
    closeAuthModal();
    updateAuthUI();
    showToast(`Welcome, ${currentUser.username}! 🎉`, 'success');
    if (socket) socket.emit('join:user', currentUser.id);
  } catch (err) { errEl.textContent = err.message; }
}

/* ── Login ── */
async function login() {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl    = document.getElementById('loginError');
  errEl.textContent = '';

  if (!email || !password) { errEl.textContent = 'Email and password required.'; return; }

  try {
    const res  = await apiFetch('/api/auth/login', 'POST', { email, password });
    authToken   = res.token;
    currentUser = res.user;
    localStorage.setItem('cpusim_token', authToken);
    localStorage.setItem('cpusim_user',  JSON.stringify(currentUser));
    closeAuthModal();
    updateAuthUI();
    showToast(`Welcome back, ${currentUser.username}!`, 'success');
    if (socket) socket.emit('join:user', currentUser.id);
  } catch (err) { errEl.textContent = err.message; }
}

/* ── Logout ── */
function logout() {
  authToken = null; currentUser = null;
  localStorage.removeItem('cpusim_token');
  localStorage.removeItem('cpusim_user');
  updateAuthUI();
  showToast('Logged out');
}

// ════════════════════════════════════════════════════════
// 5.  API HELPER
// ════════════════════════════════════════════════════════
async function apiFetch(endpoint, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(API + endpoint, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await res.json();
  if (!data.success) throw new Error(data.message || data.errors?.[0]?.msg || 'Request failed');
  return data;
}

// ════════════════════════════════════════════════════════
// 6.  PROCESS MANAGEMENT
// ════════════════════════════════════════════════════════
function colorForIdx(i) { return COLORS[i % COLORS.length]; }

function addProcess() {
  const pid        = document.getElementById('inPid').value.trim();
  const arrival    = parseInt(document.getElementById('inArrival').value);
  const burst      = parseInt(document.getElementById('inBurst').value);
  const priorityIn = document.getElementById('inPriority').value.trim();
  const priority   = priorityIn === '' ? 1 : parseInt(priorityIn); // priority is optional, defaults to 1
  const errEl      = document.getElementById('inputError');

  if (!pid)                               { errEl.textContent = 'Process ID is required.'; return; }
  if (!/^[A-Za-z0-9_-]{1,6}$/.test(pid))  { errEl.textContent = 'Process ID: 1–6 letters, digits, "-" or "_" only.'; return; }
  if (isNaN(arrival) || arrival < 0)      { errEl.textContent = 'Arrival Time must be ≥ 0.'; return; }
  if (isNaN(burst)   || burst   < 1)      { errEl.textContent = 'Burst Time must be ≥ 1.'; return; }
  if (isNaN(priority)|| priority < 1)     { errEl.textContent = 'Priority must be ≥ 1.'; return; }
  if (processes.some(p => p.pid === pid)) { errEl.textContent = `"${pid}" already exists.`; return; }

  errEl.textContent = '';
  processes.push({ pid, arrival, burst, priority, color: colorForIdx(processes.length), status: 'waiting' });
  renderTable(); clearInputs(); playSound('add'); showToast(`${pid} added`);
}

function clearInputs() {
  ['inPid','inArrival','inBurst','inPriority'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('inputError').textContent = '';
}

function clearAll() {
  if (!processes.length) return;
  if (!confirm('Clear all processes?')) return;
  processes = []; results = []; ganttData = [];
  renderTable(); renderResults([]); renderGantt([]);
  clearStats(); clearQueues();
  showToast('All cleared');
}

function deleteProcess(pid) { processes = processes.filter(p => p.pid !== pid); renderTable(); }

function openEdit(pid) {
  const p = processes.find(x => x.pid === pid); if (!p) return;
  editTarget = pid;
  document.getElementById('editArrival').value  = p.arrival;
  document.getElementById('editBurst').value    = p.burst;
  document.getElementById('editPriority').value = p.priority;
  document.getElementById('editModal').classList.remove('hidden');
}

function saveEdit() {
  const p  = processes.find(x => x.pid === editTarget); if (!p) return;
  const a  = parseInt(document.getElementById('editArrival').value);
  const b  = parseInt(document.getElementById('editBurst').value);
  const pr = parseInt(document.getElementById('editPriority').value);
  if (isNaN(a)||a<0||isNaN(b)||b<1||isNaN(pr)||pr<1) { showToast('Invalid values','warn'); return; }
  p.arrival = a; p.burst = b; p.priority = pr;
  closeModal('editModal'); renderTable(); showToast(`${editTarget} updated`);
}

function generateRandom() {
  processes = [];
  const n = 5 + Math.floor(Math.random() * 4);
  for (let i = 0; i < n; i++) {
    processes.push({
      pid: `P${i+1}`, arrival: Math.floor(Math.random()*8),
      burst: 1 + Math.floor(Math.random()*9), priority: 1 + Math.floor(Math.random()*6),
      color: colorForIdx(i), status: 'waiting'
    });
  }
  renderTable(); showToast(`${n} random processes generated`);
}

function renderTable() {
  const tbody = document.getElementById('procTableBody');
  document.getElementById('procCount').textContent = `${processes.length} process${processes.length!==1?'es':''}`;
  if (!processes.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No processes added yet.</td></tr>'; return;
  }
  tbody.innerHTML = processes.map(p => `
    <tr>
      <td><span class="pid-chip" style="background:${p.color}">${p.pid}</span></td>
      <td>${p.arrival}</td><td>${p.burst}</td><td>${p.priority}</td>
      <td><span class="status-chip status-${p.status}">${p.status}</span></td>
      <td>
        <button class="action-btn" onclick="openEdit('${p.pid}')">✎</button>
        <button class="action-btn del" onclick="deleteProcess('${p.pid}')">✕</button>
      </td>
    </tr>`).join('');
}

// ════════════════════════════════════════════════════════
// 7.  ALGORITHM SELECTOR
// ════════════════════════════════════════════════════════
function onAlgoChange() {
  const v = document.getElementById('algoSelect').value;
  document.getElementById('rrConfig').classList.toggle('hidden', v !== 'rr');
}

function showAlgoInfo() {
  const v = document.getElementById('algoSelect').value;
  const info = ALGO_INFO[v];
  document.getElementById('modalTitle').textContent = info.name;
  document.getElementById('modalBody').textContent  = info.body;
  document.getElementById('algoModal').classList.remove('hidden');
}

// ════════════════════════════════════════════════════════
// 8.  SIMULATION — dispatches to backend or client-side
// ════════════════════════════════════════════════════════
async function runSimulation() {
  if (!processes.length) { showToast('Add at least one process first.','warn'); return; }
  if (simRunning) return;

  const algo    = document.getElementById('algoSelect').value;
  const quantum = parseInt(document.getElementById('quantum').value) || 2;
  const useBack = BACKEND_ENABLED && document.getElementById('useBackend').checked && authToken;

  let schedule, res;

  if (useBack) {
    // ── Backend API ──
    try {
      showToast('Sending to backend...'); 
      const data = await apiFetch('/api/simulations/run', 'POST', {
        algorithm: algo, processes: processes.map(({pid,arrival,burst,priority,color}) => ({pid,arrival,burst,priority,color})), quantum
      });
      schedule = data.data.schedule;
      res      = data.data.results;
      showToast('Results from server ✓','success');
    } catch (err) {
      showToast(`Backend error: ${err.message} — falling back to client`,'warn');
      ({ schedule, results: res } = dispatch(algo, processes, quantum));
    }
  } else {
    // ── Client-side (instant) ──
    ({ schedule, results: res } = dispatch(algo, processes, quantum));
  }

  ganttData = schedule; results = res;
  processes.forEach(p => p.status = 'done');
  renderTable();
  lastSimData = { algo, quantum, processes: [...processes], results: res, gantt: schedule };

  if (document.getElementById('stepMode').checked) {
    startStepMode(schedule, res);
  } else {
    animateSimulation(schedule, res);
  }
  scrollToSection('gantt');
  playSound('run');
}

// ════════════════════════════════════════════════════════
// 9.  CLIENT-SIDE ALGORITHMS (fallback / offline)
// ════════════════════════════════════════════════════════
function cloneProcs(procs) {
  return procs.map((p,i)=>({...p,color:p.color||colorForIdx(i),remaining:p.burst,firstRun:-1,completion:0}));
}
function mergeSegs(sched){
  if(!sched.length) return [];
  const out=[{...sched[0]}];
  for(let i=1;i<sched.length;i++){
    const last=out[out.length-1];
    if(sched[i].pid===last.pid&&sched[i].start===last.end) last.end=sched[i].end;
    else out.push({...sched[i]});
  }
  return out;
}
function buildResults(ps,schedule){
  const colored=schedule.map(s=>{const p=ps.find(x=>x.pid===s.pid);return{...s,color:p?p.color:'#888'};});
  const results=ps.map(p=>({pid:p.pid,arrival:p.arrival,burst:p.burst,priority:p.priority||1,color:p.color,completion:p.completion,turnaround:p.completion-p.arrival,waiting:p.completion-p.arrival-p.burst,response:p.firstRun-p.arrival}));
  return{schedule:colored,results};
}
function runFCFS(procs){const ps=cloneProcs(procs).sort((a,b)=>a.arrival-b.arrival);const sc=[];let t=0;for(const p of ps){if(t<p.arrival)t=p.arrival;p.firstRun=t;sc.push({pid:p.pid,start:t,end:t+p.burst});t+=p.burst;p.completion=t;}return buildResults(ps,sc);}
function runSJF(procs){const ps=cloneProcs(procs);const sc=[];let t=0;const done=new Set();while(done.size<ps.length){const av=ps.filter(p=>p.arrival<=t&&!done.has(p.pid));if(!av.length){t++;continue;}av.sort((a,b)=>a.burst-b.burst||a.arrival-b.arrival);const p=av[0];if(p.firstRun<0)p.firstRun=t;sc.push({pid:p.pid,start:t,end:t+p.burst});t+=p.burst;p.completion=t;done.add(p.pid);}return buildResults(ps,sc);}
function runSRTF(procs){const ps=cloneProcs(procs);const sc=[];let t=0,lp=null,ss=0;const done=new Set();while(done.size<ps.length){const av=ps.filter(p=>p.arrival<=t&&!done.has(p.pid));if(!av.length){if(lp!==null){sc.push({pid:lp,start:ss,end:t});lp=null;}t++;continue;}av.sort((a,b)=>a.remaining-b.remaining||a.arrival-b.arrival);const p=av[0];if(p.firstRun<0)p.firstRun=t;if(p.pid!==lp){if(lp!==null)sc.push({pid:lp,start:ss,end:t});ss=t;lp=p.pid;}p.remaining--;t++;if(p.remaining===0){p.completion=t;done.add(p.pid);}}if(lp!==null)sc.push({pid:lp,start:ss,end:t});return buildResults(ps,mergeSegs(sc));}
function runRR(procs,q){const ps=cloneProcs(procs).sort((a,b)=>a.arrival-b.arrival);const sc=[];let t=0;const queue=[],enq=new Set(),done=new Set();let i=0;while(i<ps.length&&ps[i].arrival<=t){queue.push(ps[i]);enq.add(ps[i].pid);i++;}while(done.size<ps.length){if(!queue.length){t=ps[i].arrival;while(i<ps.length&&ps[i].arrival<=t){queue.push(ps[i]);enq.add(ps[i].pid);i++;}continue;}const p=queue.shift();if(p.firstRun<0)p.firstRun=t;const run=Math.min(p.remaining,q);sc.push({pid:p.pid,start:t,end:t+run});t+=run;p.remaining-=run;while(i<ps.length&&ps[i].arrival<=t){if(!enq.has(ps[i].pid)){queue.push(ps[i]);enq.add(ps[i].pid);}i++;}if(p.remaining===0){p.completion=t;done.add(p.pid);}else queue.push(p);}return buildResults(ps,sc);}
function runPriority(procs){const ps=cloneProcs(procs);const sc=[];let t=0;const done=new Set();while(done.size<ps.length){const av=ps.filter(p=>p.arrival<=t&&!done.has(p.pid));if(!av.length){t++;continue;}av.sort((a,b)=>a.priority-b.priority||a.arrival-b.arrival);const p=av[0];if(p.firstRun<0)p.firstRun=t;sc.push({pid:p.pid,start:t,end:t+p.burst});t+=p.burst;p.completion=t;done.add(p.pid);}return buildResults(ps,sc);}
function runPriorityPre(procs){const ps=cloneProcs(procs);const sc=[];let t=0,lp=null,ss=0;const done=new Set();while(done.size<ps.length){const av=ps.filter(p=>p.arrival<=t&&!done.has(p.pid));if(!av.length){if(lp!==null){sc.push({pid:lp,start:ss,end:t});lp=null;}t++;continue;}av.sort((a,b)=>a.priority-b.priority||a.arrival-b.arrival);const p=av[0];if(p.firstRun<0)p.firstRun=t;if(p.pid!==lp){if(lp!==null)sc.push({pid:lp,start:ss,end:t});ss=t;lp=p.pid;}p.remaining--;t++;if(p.remaining===0){p.completion=t;done.add(p.pid);}}if(lp!==null)sc.push({pid:lp,start:ss,end:t});return buildResults(ps,mergeSegs(sc));}
function dispatch(algo,procs,quantum=2){switch(algo){case'fcfs':return runFCFS(procs);case'sjf':return runSJF(procs);case'srtf':return runSRTF(procs);case'rr':return runRR(procs,quantum);case'priority':return runPriority(procs);case'priority_pre':return runPriorityPre(procs);default:return runFCFS(procs);}}

function computeStats(res,schedule){
  const n=res.length;
  const awt=res.reduce((s,r)=>s+r.waiting,0)/n;
  const atat=res.reduce((s,r)=>s+r.turnaround,0)/n;
  const art=res.reduce((s,r)=>s+r.response,0)/n;
  const totalBurst=res.reduce((s,r)=>s+r.burst,0);
  const makespan=Math.max(...schedule.map(s=>s.end));
  return{awt,atat,art,cpuUtil:totalBurst/makespan*100,throughput:n/makespan,n};
}

// ════════════════════════════════════════════════════════
// 10. ANIMATION ENGINE
// ════════════════════════════════════════════════════════
function animateSimulation(schedule, res) {
  simRunning = true; setCPUUsage(80 + Math.random()*15); clearQueues();
  updateQueueChips({ ready: res.map(r=>r.pid) });
  let i = 0;
  const delay = getAnimDelay();
  const play  = () => {
    if (i >= schedule.length) { finishSimulation(schedule, res); return; }
    highlightRunning(schedule[i].pid);
    renderGantt(ganttData.slice(0, i+1));
    i++;
    animTimer = setTimeout(play, delay);
  };
  play();
}

function startStepMode(schedule, res) {
  stepQueue=schedule; stepIdx=0; simRunning=true; paused=true;
  document.getElementById('stepControls').classList.remove('hidden');
  updateQueueChips({ ready: res.map(r=>r.pid) });
  showToast('Step mode: click ⏭ to step forward');
  setCPUUsage(0);
}

function stepForward() {
  if (!simRunning) return;
  if (stepIdx >= stepQueue.length) { finishSimulation(stepQueue, results); return; }
  highlightRunning(stepQueue[stepIdx].pid);
  renderGantt(ganttData.slice(0, stepIdx+1));
  stepIdx++;
  if (stepIdx >= stepQueue.length) finishSimulation(stepQueue, results);
}

function togglePause() {
  paused = !paused;
  document.getElementById('pauseBtn').textContent = paused ? '▶ Resume' : '⏸ Pause';
  if (!paused) autoStep();
}

function autoStep() {
  if (paused || !simRunning) return;
  stepForward();
  if (simRunning) animTimer = setTimeout(autoStep, getAnimDelay());
}

function highlightRunning(pid) {
  const p = processes.find(x => x.pid === pid);
  document.getElementById('runningQueue').innerHTML =
    `<span class="q-chip" style="background:${p?p.color:'#888'}">${pid}</span>`;
}

function updateQueueChips(data) {
  if (data.ready) {
    document.getElementById('readyQueue').innerHTML = data.ready.map(pid => {
      const p = processes.find(x=>x.pid===pid);
      return `<span class="q-chip" style="background:${p?p.color:'#888'}">${pid}</span>`;
    }).join('');
  }
}

function finishSimulation(schedule, res) {
  simRunning=false; paused=false; setCPUUsage(0);
  document.getElementById('stepControls').classList.add('hidden');
  document.getElementById('pauseBtn').textContent = '⏸ Pause';
  renderGantt(schedule);
  renderResults(res);
  const stats = computeStats(res, schedule);
  renderStats(stats);
  drawCharts(res);
  document.getElementById('doneQueue').innerHTML = res.map(r=>{
    const p=processes.find(x=>x.pid===r.pid);
    return `<span class="q-chip" style="background:${p?p.color:'#888'}">${r.pid}</span>`;
  }).join('');
  document.getElementById('runningQueue').innerHTML='';
  document.getElementById('readyQueue').innerHTML='';
  showToast('Simulation complete! ✓','success'); playSound('done');
}

function clearQueues(){['readyQueue','runningQueue','doneQueue'].forEach(id=>document.getElementById(id).innerHTML='');}

function resetSim(){
  clearTimeout(animTimer); animTimer=null; simRunning=false; paused=false; stepIdx=0;
  document.getElementById('stepControls').classList.add('hidden');
  processes.forEach(p=>p.status='waiting'); renderTable();
  renderGantt([]); renderResults([]); clearStats(); clearQueues(); setCPUUsage(0);
  showToast('Reset');
}

function getAnimDelay(){const v=parseInt(document.getElementById('speedSlider').value);return{1:900,2:550,3:320,4:160,5:60}[v]||320;}

// ════════════════════════════════════════════════════════
// 11. GANTT CHART
// ════════════════════════════════════════════════════════
function renderGantt(schedule){
  const wrap=document.getElementById('ganttWrap');
  if(!schedule||!schedule.length){wrap.innerHTML='<div class="gantt-placeholder">Run a simulation to see the Gantt chart</div>';return;}
  const PX=54,BAR_H=48;
  const makespan=Math.max(...schedule.map(s=>s.end));
  const full=[];let t=Math.min(...schedule.map(s=>s.start));
  for(const s of schedule){if(s.start>t)full.push({pid:'idle',start:t,end:s.start,color:'#1e2330'});full.push(s);t=s.end;}
  const ticks=[];for(let i=0;i<=makespan;i++){if(makespan<=20||i%Math.ceil(makespan/20)===0)ticks.push(i);}
  const blocksHTML=full.map(s=>{
    const w=(s.end-s.start)*PX;
    if(s.pid==='idle')return`<div class="gantt-idle" style="width:${w}px" title="Idle [${s.start}–${s.end}]">idle</div>`;
    const label=w>36?s.pid:'';
    return`<div class="gantt-block" style="width:${w}px;background:${s.color}" title="${s.pid} [${s.start}–${s.end}]">${label}</div>`;
  }).join('');
  const ticksHTML=ticks.map(t=>`<div class="gantt-tick" style="left:${t*PX}px">${t}</div>`).join('');
  wrap.innerHTML=`<div class="gantt-inner" style="min-width:${makespan*PX+80}px;position:relative;">
    <div class="gantt-bar-row" style="gap:2px;align-items:stretch;">${blocksHTML}</div>
    <div class="gantt-time-row" style="position:relative;height:24px;margin-top:4px;">${ticksHTML}</div>
  </div>`;
  wrap.querySelectorAll('.gantt-block,.gantt-idle').forEach((b,i)=>{
    b.style.opacity='0';b.style.transform='scaleX(0)';b.style.transformOrigin='left';
    b.style.transition=`opacity .25s ease ${i*30}ms,transform .25s ease ${i*30}ms`;
    requestAnimationFrame(()=>{b.style.opacity='1';b.style.transform='scaleX(1)';});
  });
}

// ════════════════════════════════════════════════════════
// 12. RESULTS TABLE
// ════════════════════════════════════════════════════════
function renderResults(res){
  const tbody=document.getElementById('resultTableBody');
  if(!res||!res.length){tbody.innerHTML='<tr class="empty-row"><td colspan="7">No results yet.</td></tr>';return;}
  const minWT=Math.min(...res.map(r=>r.waiting)),maxWT=Math.max(...res.map(r=>r.waiting));
  tbody.innerHTML=res.map(r=>{
    const cls=r.waiting===minWT?'val-good':r.waiting===maxWT?'val-bad':'';
    return`<tr>
      <td><span class="pid-chip" style="background:${r.color}">${r.pid}</span></td>
      <td>${r.arrival}</td><td>${r.burst}</td><td>${r.completion}</td>
      <td>${r.turnaround}</td><td class="${cls}">${r.waiting}</td><td>${r.response}</td>
    </tr>`;
  }).join('');
}

// ════════════════════════════════════════════════════════
// 13. STATISTICS
// ════════════════════════════════════════════════════════
function renderStats(s){
  animateCounter('statAWT',s.awt.toFixed(2));
  animateCounter('statATAT',s.atat.toFixed(2));
  animateCounter('statART',s.art.toFixed(2));
  animateCounter('statCPU',s.cpuUtil.toFixed(1)+'%');
  animateCounter('statTP',s.throughput.toFixed(3));
  animateCounter('statNP',s.n);
  setCPUUsage(s.cpuUtil);
}
function clearStats(){['statAWT','statATAT','statART','statCPU','statTP','statNP'].forEach(id=>document.getElementById(id).textContent='—');setCPUUsage(0);}
function animateCounter(id,target){
  const el=document.getElementById(id);const num=parseFloat(target);if(isNaN(num)){el.textContent=target;return;}
  const suf=target.toString().replace(/[\d.]/g,'');let cur=0;const steps=30,inc=num/steps;let st=0;
  const tick=()=>{st++;cur=st>=steps?num:cur+inc;el.textContent=cur.toFixed(typeof target==='number'?0:target.includes('%')?1:2)+suf;if(st<steps)requestAnimationFrame(tick);};tick();
}

// ════════════════════════════════════════════════════════
// 14. CANVAS CHARTS
// ════════════════════════════════════════════════════════
function drawCharts(res){
  drawBarChart('chartWT',res.map(r=>r.pid),res.map(r=>r.waiting),'Waiting',res.map(r=>r.color));
  drawBarChart('chartTAT',res.map(r=>r.pid),res.map(r=>r.turnaround),'Turnaround',res.map(r=>r.color));
}
function drawBarChart(id,labels,values,title,colors){
  const canvas=document.getElementById(id);if(!canvas)return;
  const ctx=canvas.getContext('2d');const isDark=document.documentElement.getAttribute('data-theme')!=='light';
  const W=canvas.offsetWidth||canvas.width,H=canvas.offsetHeight||canvas.height;
  canvas.width=W;canvas.height=H;ctx.clearRect(0,0,W,H);
  const bg=isDark?'#13161e':'#fff';ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
  const pL=44,pR=16,pT=24,pB=40,cW=W-pL-pR,cH=H-pT-pB;
  const max=Math.max(...values,1);const bW=Math.floor(cW/values.length)-4;
  const tc=isDark?'#8892a4':'#4a5568';
  for(let i=0;i<=4;i++){const y=pT+cH*(1-i/4);ctx.strokeStyle=isDark?'#1e2330':'#e5e7eb';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(pL,y);ctx.lineTo(pL+cW,y);ctx.stroke();ctx.fillStyle=tc;ctx.font='10px Space Mono,monospace';ctx.textAlign='right';ctx.fillText((max*i/4).toFixed(1),pL-4,y+4);}
  let prog=0;
  const anim=()=>{
    ctx.fillStyle=bg;ctx.fillRect(pL,pT,cW,cH);
    for(let i=0;i<=4;i++){const y=pT+cH*(1-i/4);ctx.strokeStyle=isDark?'#1e2330':'#e5e7eb';ctx.beginPath();ctx.moveTo(pL,y);ctx.lineTo(pL+cW,y);ctx.stroke();}
    values.forEach((v,i)=>{
      const x=pL+i*(bW+4)+2,bH=(v/max)*cH*Math.min(prog,1),y=pT+cH-bH;
      ctx.fillStyle=colors[i]||'#00e5a0';ctx.beginPath();
      if(typeof ctx.roundRect==='function')ctx.roundRect(x,y,bW,bH,4);else ctx.rect(x,y,bW,bH);
      ctx.fill();
      if(prog>=1){ctx.fillStyle=isDark?'#e8ecf4':'#1a1f2e';ctx.font='bold 10px Space Mono,monospace';ctx.textAlign='center';ctx.fillText(v,x+bW/2,y-4);}
      ctx.fillStyle=tc;ctx.font='10px Space Mono,monospace';ctx.textAlign='center';ctx.fillText(labels[i],x+bW/2,pT+cH+16);
    });
    if(prog<1){prog+=0.06;requestAnimationFrame(anim);}
  };anim();
}

// ════════════════════════════════════════════════════════
// 15. COMPARISON MODE
// ════════════════════════════════════════════════════════
async function compareAll(){
  if(!processes.length){showToast('Add processes first','warn');return;}
  const quantum=parseInt(document.getElementById('quantum').value)||2;
  const useBack=BACKEND_ENABLED&&document.getElementById('useBackend').checked&&authToken;
  let rows;

  if(useBack){
    try{
      const data=await apiFetch('/api/simulations/compare','POST',{processes:processes.map(({pid,arrival,burst,priority,color})=>({pid,arrival,burst,priority,color})),quantum});
      rows=data.data.map(r=>({label:r.label||r.algo,awt:r.awt,atat:r.atat,art:r.art,cpu:r.cpuUtil,tp:r.throughput}));
    }catch{
      rows=clientCompare(quantum);
    }
  }else{
    rows=clientCompare(quantum);
  }

  const best=rows.reduce((b,r)=>r.awt<b.awt?r:b,rows[0]);
  document.getElementById('compareBody').innerHTML=rows.map(r=>{
    const cls=r===best?'best-row':'';
    return`<tr class="${cls}">
      <td>${r.label||r.algo}${r===best?'<span class="best"> ★</span>':''}</td>
      <td ${r===best?'class="best"':''}>${r.awt.toFixed(2)}</td>
      <td>${r.atat.toFixed(2)}</td><td>${r.art.toFixed(2)}</td>
      <td>${r.cpu.toFixed(1)}%</td><td>${r.tp.toFixed(3)}</td>
    </tr>`;
  }).join('');
  document.getElementById('compareNote').textContent=`★ Best (lowest Avg WT): ${best.label||best.algo}`;
  document.getElementById('compareCard').style.display='';
  document.getElementById('compareGraphCard').style.display='';
  drawBarChart('chartCompare',rows.map(r=>(r.label||r.algo).split(' ')[0]),rows.map(r=>+r.awt.toFixed(2)),'Avg WT',['#00e5a0','#00b8ff','#ff6b35','#c084fc','#ffcc00','#ff4466']);
  scrollToSection('compare');showToast('Comparison complete!');
}

function clientCompare(quantum){
  const algos=[{key:'fcfs',label:'FCFS'},{key:'sjf',label:'SJF (NP)'},{key:'srtf',label:'SRTF'},{key:'rr',label:`RR (q=${quantum})`},{key:'priority',label:'Priority (NP)'},{key:'priority_pre',label:'Priority (Pre)'}];
  return algos.map(a=>{const{schedule,results:res}=dispatch(a.key,processes,quantum);const s=computeStats(res,schedule);return{label:a.label,awt:s.awt,atat:s.atat,art:s.art,cpu:s.cpuUtil,tp:s.throughput};});
}

// ════════════════════════════════════════════════════════
// 16. SAVE / LOAD SIMULATIONS
// ════════════════════════════════════════════════════════
function saveCurrentSim(){
  if(!lastSimData){showToast('Run a simulation first','warn');return;}
  if(!authToken){openAuthModal('login');return;}
  document.getElementById('simName').value='';
  document.getElementById('saveModal').classList.remove('hidden');
}

async function confirmSave(){
  const name=document.getElementById('simName').value.trim()||'Untitled Simulation';
  closeModal('saveModal');
  try{
    const stats=computeStats(lastSimData.results,lastSimData.gantt);
    await apiFetch('/api/simulations/save','POST',{
      name,algorithm:lastSimData.algo,quantum:lastSimData.quantum,
      processes:lastSimData.processes.map(({pid,arrival,burst,priority,color})=>({pid,arrival,burst,priority,color})),
      results:lastSimData.results,gantt:lastSimData.gantt,stats
    });
    showToast(`"${name}" saved to cloud ✓`,'success');
    loadSavedSims();
  }catch(err){showToast(err.message,'warn');}
}

async function loadSavedSims(){
  if(!authToken)return;
  try{
    const data=await apiFetch('/api/simulations');
    const tbody=document.getElementById('savedSimsBody');
    if(!data.data||!data.data.length){
      tbody.innerHTML='<tr class="empty-row"><td colspan="7">No saved simulations yet.</td></tr>';return;
    }
    tbody.innerHTML=data.data.map(s=>`
      <tr>
        <td>${s.name}</td>
        <td><span class="badge" style="font-size:.7rem">${s.algorithm.toUpperCase()}</span></td>
        <td>${s.stats?.awt?.toFixed(2)||'—'}</td>
        <td>${s.stats?.atat?.toFixed(2)||'—'}</td>
        <td>${s.stats?.cpuUtil?.toFixed(1)||'—'}%</td>
        <td>${new Date(s.createdAt).toLocaleDateString()}</td>
        <td>
          <button class="action-btn" onclick="loadSim('${s._id}')">▶ Load</button>
          <button class="action-btn del" onclick="deleteSim('${s._id}')">✕</button>
        </td>
      </tr>`).join('');
  }catch{}
}

async function loadSim(id){
  try{
    const data=await apiFetch(`/api/simulations/${id}`);
    const sim=data.data;
    processes=sim.processes.map((p,i)=>({...p,color:p.color||colorForIdx(i),status:'done'}));
    results=sim.results; ganttData=sim.gantt;
    renderTable(); renderGantt(sim.gantt); renderResults(sim.results);
    if(sim.stats) renderStats(sim.stats);
    drawCharts(sim.results);
    document.getElementById('algoSelect').value=sim.algorithm; onAlgoChange();
    scrollToSection('gantt'); showToast(`"${sim.name}" loaded ✓`,'success');
  }catch(err){showToast(err.message,'warn');}
}

async function deleteSim(id){
  if(!confirm('Delete this simulation?'))return;
  try{await apiFetch(`/api/simulations/${id}`,'DELETE');showToast('Deleted');loadSavedSims();}
  catch(err){showToast(err.message,'warn');}
}

// ════════════════════════════════════════════════════════
// 17. ADMIN DASHBOARD
// ════════════════════════════════════════════════════════
async function loadAdminStats(){
  try{
    const data=await apiFetch('/api/analytics/stats');
    const d=data.data;
    document.getElementById('adminUsers').textContent=d.totalUsers;
    document.getElementById('adminSims').textContent=d.totalSims;
    document.getElementById('adminActive').textContent=d.recentUsers;
    document.getElementById('adminMostUsed').textContent=(d.mostUsed||'—').toUpperCase();
    // Draw algo usage chart
    const labels=Object.keys(d.algoTotals||{});
    const values=Object.values(d.algoTotals||{});
    if(labels.length) drawBarChart('chartAdminAlgo',labels,values,'Usage',COLORS);
  }catch{}
}

// ════════════════════════════════════════════════════════
// 18. EXPORT
// ════════════════════════════════════════════════════════
function exportJSON(){
  if(!results.length){showToast('Run a simulation first','warn');return;}
  const algo=document.getElementById('algoSelect').value;
  const stats=computeStats(results,ganttData);
  const blob=new Blob([JSON.stringify({algorithm:algo,timestamp:new Date().toISOString(),processes:processes.map(({pid,arrival,burst,priority})=>({pid,arrival,burst,priority})),results,gantt:ganttData,stats},null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`cpusim_${algo}_${Date.now()}.json`;a.click();URL.revokeObjectURL(a.href);
  showToast('JSON exported');
}

function exportCSV(){
  if(!results.length){showToast('Run a simulation first','warn');return;}
  const header='PID,Arrival,Burst,Priority,Completion,Turnaround,Waiting,Response';
  const rows=results.map(r=>`${r.pid},${r.arrival},${r.burst},${r.priority||1},${r.completion},${r.turnaround},${r.waiting},${r.response}`);
  const blob=new Blob([[header,...rows].join('\n')],{type:'text/csv'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`cpusim_${Date.now()}.csv`;a.click();URL.revokeObjectURL(a.href);
  showToast('CSV exported');
}

function exportPDF(){ window.print(); }

// ════════════════════════════════════════════════════════
// 19. CPU METER CANVAS
// ════════════════════════════════════════════════════════
let cpuUsage=0,cpuTarget=0;
function initCPUMeter(){
  const c=document.getElementById('cpuMeterCanvas');if(!c)return;
  const ctx=c.getContext('2d');
  const draw=()=>{
    cpuUsage+=(cpuTarget-cpuUsage)*.05;
    ctx.clearRect(0,0,120,120);const cx=60,cy=60,r=48;
    const s=-Math.PI*.75,e=s+Math.PI*1.5;
    ctx.beginPath();ctx.arc(cx,cy,r,s,e);ctx.strokeStyle='#1e2330';ctx.lineWidth=8;ctx.lineCap='round';ctx.stroke();
    const p=s+Math.PI*1.5*(cpuUsage/100);ctx.beginPath();ctx.arc(cx,cy,r,s,p);
    const g=ctx.createLinearGradient(cx-r,cy,cx+r,cy);g.addColorStop(0,'#00e5a0');g.addColorStop(1,'#00b8ff');
    ctx.strokeStyle=g;ctx.lineWidth=8;ctx.stroke();
    ctx.font='bold 18px Syne,sans-serif';ctx.fillStyle='#e8ecf4';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(Math.round(cpuUsage)+'%',cx,cy);requestAnimationFrame(draw);
  };draw();
}
function setCPUUsage(pct){cpuTarget=pct;}

// ════════════════════════════════════════════════════════
// 20. TYPING ANIMATION
// ════════════════════════════════════════════════════════
function initTyping(){
  const el=document.getElementById('heroTitle');const text=el.textContent;el.textContent='';el.classList.add('typing-cursor');
  let i=0;const type=()=>{if(i<text.length){el.textContent+=text[i++];setTimeout(type,55);}else{setTimeout(()=>el.classList.remove('typing-cursor'),800);}};
  setTimeout(type,1800);
}

// ════════════════════════════════════════════════════════
// 21. SCROLL REVEAL
// ════════════════════════════════════════════════════════
function initScrollReveal(){
  document.querySelectorAll('.card,.stat-card,.algo-learn-card,.section-header').forEach(el=>el.classList.add('scroll-reveal'));
  const obs=new IntersectionObserver((entries)=>entries.forEach(e=>{
    if(e.isIntersecting){e.target.classList.add('revealed');obs.unobserve(e.target);}
  }),{threshold:.08});
  document.querySelectorAll('.scroll-reveal').forEach(el=>obs.observe(el));
}

// ════════════════════════════════════════════════════════
// 22. KEYBOARD SHORTCUTS
// ════════════════════════════════════════════════════════
function initKeyboard(){
  document.addEventListener('keydown',e=>{
    if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;
    if(e.ctrlKey&&e.key==='r'){e.preventDefault();runSimulation();}
    if(e.ctrlKey&&e.key==='g'){e.preventDefault();generateRandom();}
    if(e.ctrlKey&&e.key==='c'){e.preventDefault();compareAll();}
    if(e.ctrlKey&&e.key==='e'){e.preventDefault();exportJSON();}
  });
}

// ════════════════════════════════════════════════════════
// 23. SPEED SLIDER
// ════════════════════════════════════════════════════════
function initSpeedSlider(){
  const sl=document.getElementById('speedSlider'),lb=document.getElementById('speedLabel');
  const labels=['','Very Slow','Slow','Normal','Fast','Very Fast'];
  lb.textContent=labels[sl.value];
  sl.addEventListener('input',()=>{lb.textContent=labels[sl.value];});
}

// ════════════════════════════════════════════════════════
// 24. UTILITY
// ════════════════════════════════════════════════════════
function scrollToSection(id){const el=document.getElementById(id);if(el)el.scrollIntoView({behavior:'smooth',block:'start'});}

function closeModal(id){document.getElementById(id).classList.add('hidden');}

function setupModalBackdrops(){
  ['authModal','algoModal','editModal','saveModal'].forEach(id=>{
    document.getElementById(id)?.addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal(id);});
  });
}

function closeAuthModal(){closeModal('authModal');}

let toastTimer=null;
function showToast(msg,type='info'){
  let toast=document.getElementById('toast');
  if(!toast){toast=document.createElement('div');toast.id='toast';Object.assign(toast.style,{position:'fixed',bottom:'2rem',left:'50%',transform:'translateX(-50%)',background:'var(--card)',border:'1px solid var(--border2)',color:'var(--text)',fontFamily:'var(--font-mono)',fontSize:'.82rem',padding:'.6em 1.4em',borderRadius:'var(--radius-sm)',zIndex:'9000',transition:'opacity .3s,transform .3s',whiteSpace:'nowrap',boxShadow:'0 4px 20px rgba(0,0,0,.4)',pointerEvents:'none'});document.body.appendChild(toast);}
  const colors={warn:'var(--warn)',success:'var(--success)',info:'var(--border2)'};
  toast.style.borderColor=colors[type]||colors.info;toast.textContent=msg;
  toast.style.opacity='1';toast.style.transform='translateX(-50%) translateY(0)';
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toast.style.opacity='0';toast.style.transform='translateX(-50%) translateY(8px)';},2400);
}

function showNotifBanner(msg,type='info'){
  const el=document.getElementById('notifBanner');
  el.textContent=msg;el.className='notif-banner '+type;
  setTimeout(()=>el.classList.add('hidden'),4000);
}

let audioCtx=null;
function playSound(type){
  if(!soundEnabled)return;
  if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();
  const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();
  osc.connect(gain);gain.connect(audioCtx.destination);
  osc.frequency.value={add:440,run:660,done:880}[type]||440;
  osc.type='sine';gain.gain.setValueAtTime(.12,audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+.18);
  osc.start();osc.stop(audioCtx.currentTime+.18);
}
