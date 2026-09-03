#!/usr/bin/env node
import { createServer } from 'node:http';
import { readTasks } from './backlog-data.mjs';

const port = Number(process.env.BACKLOG_PORT || 4321);
const host = '127.0.0.1';
const lanes = {
  'sign-tool-architecture': 'Sign tool architecture',
  'editor-architecture': 'Editor architecture',
  'fonts-and-script-support': 'Fonts and script support',
};
const statusLabels = { open: 'Open', in_progress: 'In progress', blocked: 'Blocked', done: 'Done', retired: 'Retired' };

function clientTask(task) {
  const detail = task.body.replace(/^#.*\n+## Scope and acceptance\n+/s, '').replace(/\n+/g, ' ').replace(/\*\*|`|~~/g, '').trim();
  return { id: task.id, title: task.title, priority: task.priority, status: task.status, statusLabel: statusLabels[task.status], lane: lanes[task.epic] || task.epic, detail };
}

function page() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PDKEF backlog</title>
  <style>
    :root { color-scheme: light dark; --surface: light-dark(#ffffff, #1d1f24); --page: light-dark(#f5f6f8, #121315); --text: light-dark(#202124, #f3f4f6); --muted: light-dark(#5f6368, #b8bcc5); --border: light-dark(#d9dde3, #3a3e47); --p1: light-dark(#b42318, #fb8b8b); --p2: light-dark(#b54708, #f8b06a); --p3: light-dark(#175cd3, #87b9ff); }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--page); color: var(--text); font-family: ui-sans-serif, system-ui, sans-serif; }
    main { max-width: 1600px; margin: 0 auto; padding: 28px; }
    h1, h2, h3 { margin: 0; font-weight: 650; }
    h1 { font-size: clamp(1.45rem, 2.5vw, 2.1rem); } h2 { font-size: 1.1rem; margin: 28px 0 12px; } h3 { font-size: .95rem; }
    p { margin: 0; }
    .topline, .legend, .controls, .selected-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
    .topline { justify-content: space-between; gap: 18px; }
    .source-note, .ticket-state, .count, .empty { color: var(--muted); font-size: .88rem; }
    .live { color: var(--muted); font-size: .78rem; }
    .controls { margin: 22px 0 10px; }
    .filter { border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 999px; padding: 8px 12px; cursor: pointer; }
    .filter[aria-pressed="true"] { background: var(--text); color: var(--surface); border-color: var(--text); }
    .legend { color: var(--muted); font-size: .88rem; }
    .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; flex: none; }
    .P1 { background: var(--p1); } .P2 { background: var(--p2); } .P3 { background: var(--p3); }
    .selected { margin: 22px 0 26px; padding: 18px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
    .selected-label { color: var(--muted); font-size: .82rem; margin-bottom: 5px; } .selected h2 { margin: 0 0 8px; }
    .selected-meta { color: var(--muted); font-size: .9rem; margin-bottom: 10px; } .selected-detail { line-height: 1.5; }
    .lanes { display: grid; gap: 32px; } .columns { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px; }
    .column-heading { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin: 0 0 9px; }
    .stack { display: grid; gap: 10px; }
    .ticket { appearance: none; width: 100%; min-width: 0; padding: 13px; color: var(--text); border: 1px solid var(--border); border-radius: 10px; background: var(--surface); text-align: left; cursor: pointer; }
    .ticket:hover { border-color: var(--muted); } .ticket:focus-visible, .filter:focus-visible { outline: 3px solid var(--p3); outline-offset: 2px; }
    .ticket-header { display: flex; justify-content: space-between; gap: 8px; align-items: center; color: var(--muted); font-size: .82rem; }
    .ticket-title { display: block; margin: 9px 0 7px; font-weight: 600; line-height: 1.35; overflow-wrap: anywhere; }
    .empty { padding: 10px 0; } .error { color: var(--p1); margin-top: 10px; }
    @media (max-width: 1120px) { .columns { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 560px) { main { padding: 18px 16px; } .columns { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <div class="topline"><h1>PDKEF backlog</h1><p class="source-note">Read-only live view · source: backlog/tasks</p><p class="live" id="live-status" aria-live="polite">Connecting…</p></div>
    <div class="controls" aria-label="Filter by priority">
      <button class="filter" type="button" data-priority="all" aria-pressed="true">All priorities</button>
      <button class="filter" type="button" data-priority="P1" aria-pressed="false">P1</button>
      <button class="filter" type="button" data-priority="P2" aria-pressed="false">P2</button>
      <button class="filter" type="button" data-priority="P3" aria-pressed="false">P3</button>
    </div>
    <div class="legend" aria-label="Priority colors"><span><i class="dot P1" aria-hidden="true"></i> P1 requirement, fidelity, or release risk</span><span><i class="dot P2" aria-hidden="true"></i> P2 reliability and maintainability</span><span><i class="dot P3" aria-hidden="true"></i> P3 optional expansion</span></div>
    <section class="selected" aria-live="polite"><p class="selected-label">Selected task</p><h2 id="selected-title">Loading…</h2><div class="selected-meta" id="selected-meta"></div><p class="selected-detail" id="selected-detail"></p></section>
    <p class="error" id="error" role="alert" hidden></p>
    <div class="lanes" id="lanes"></div>
  </main>
  <script>
    const lanes = ['Sign tool architecture', 'Editor architecture', 'Fonts and script support'];
    const columns = [['open', 'Open'], ['in_progress', 'In progress'], ['blocked', 'Blocked'], ['done', 'Done'], ['retired', 'Retired']];
    const laneRoot = document.getElementById('lanes');
    const selectedTitle = document.getElementById('selected-title');
    const selectedMeta = document.getElementById('selected-meta');
    const selectedDetail = document.getElementById('selected-detail');
    const liveStatus = document.getElementById('live-status');
    const error = document.getElementById('error');
    let activePriority = 'all';
    let tasks = [];
    let selectedId = 'SIGN-05';
    function esc(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
    function selectTask(task) { if (!task) return; selectedId = task.id; selectedTitle.textContent = task.id + ' · ' + task.title; selectedMeta.innerHTML = '<span><i class="dot ' + task.priority + '" aria-hidden="true"></i> ' + esc(task.priority) + '</span><span>' + esc(task.statusLabel) + '</span><span>' + esc(task.lane) + '</span>'; selectedDetail.textContent = task.detail; }
    function card(task) { return '<button class="ticket" type="button" data-ticket="' + esc(task.id) + '" aria-label="Show ' + esc(task.id + ': ' + task.title) + '"><span class="ticket-header"><span>' + esc(task.id) + '</span><i class="dot ' + esc(task.priority) + '" aria-label="' + esc(task.priority) + '"></i></span><span class="ticket-title">' + esc(task.title) + '</span><span class="ticket-state">' + esc(task.statusLabel) + '</span></button>'; }
    function render() { const visible = tasks.filter((task) => activePriority === 'all' || task.priority === activePriority); laneRoot.innerHTML = lanes.map((lane) => '<section><h2>' + lane + '</h2><div class="columns">' + columns.map(([status, label]) => { const items = visible.filter((task) => task.lane === lane && task.status === status); return '<section aria-label="' + lane + ', ' + label + '"><div class="column-heading"><h3>' + label + '</h3><span class="count">' + items.length + '</span></div><div class="stack">' + (items.map(card).join('') || '<p class="empty">No tasks</p>') + '</div></section>'; }).join('') + '</div></section>').join(''); selectTask(tasks.find((task) => task.id === selectedId) || tasks[0]); }
    async function refresh() { try { const response = await fetch('/api/tasks', { cache: 'no-store' }); if (!response.ok) throw new Error('The task files could not be read.'); tasks = await response.json(); error.hidden = true; liveStatus.textContent = 'Updated ' + new Date().toLocaleTimeString(); render(); } catch (caught) { error.hidden = false; error.textContent = caught.message; liveStatus.textContent = 'Update failed'; } }
    document.addEventListener('click', (event) => { const filter = event.target.closest('[data-priority]'); if (filter) { activePriority = filter.dataset.priority; document.querySelectorAll('[data-priority]').forEach((button) => button.setAttribute('aria-pressed', String(button === filter))); render(); return; } const ticket = event.target.closest('[data-ticket]'); if (ticket) selectTask(tasks.find((item) => item.id === ticket.dataset.ticket)); });
    refresh(); setInterval(refresh, 2000);
  </script>
</body>
</html>`;
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET') {
    response.writeHead(405, { Allow: 'GET' });
    response.end('Read-only viewer: GET only.');
    return;
  }
  if (request.url === '/api/tasks') {
    try {
      const tasks = (await readTasks()).map(clientTask);
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(tasks));
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  if (request.url === '/' || request.url === '/index.html' || request.url === '/backlog/tasks' || request.url === '/backlog/tasks/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(page());
    return;
  }
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Not found.');
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Stop the existing backlog viewer or choose another port with BACKLOG_PORT=...`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
server.listen(port, host, () => console.log(`Read-only backlog board: http://${host}:${port}/backlog/tasks`));
