#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readTasks } from './backlog-data.mjs';

const outputPath = resolve(process.argv[2] || 'todo-kanban.html');

const laneNames = {
  'sign-tool-architecture': 'Sign tool architecture',
  'editor-architecture': 'Editor architecture',
  'fonts-and-script-support': 'Fonts and script support',
};

function boardTickets(tasks) {
  return tasks.map((task) => ({
    id: task.id,
    lane: laneNames[task.epic] || task.epic,
    priority: task.priority,
    state: task.status,
    stateLabel: task.legacy_state || task.status.replace('_', ' '),
    title: task.title,
    detail: task.body.replace(/^#.*\n+## Scope and acceptance\n+/s, '').replace(/\n+/g, ' ').replace(/\*\*|`|~~/g, '').trim(),
  }));
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function pageFor(tickets) {
  const data = JSON.stringify(tickets).replaceAll('<', '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PDKEF backlog</title>
  <style>
    :root { color-scheme: light dark; --surface: light-dark(#ffffff, #1d1f24); --page: light-dark(#f5f6f8, #121315); --text: light-dark(#202124, #f3f4f6); --muted: light-dark(#5f6368, #b8bcc5); --border: light-dark(#d9dde3, #3a3e47); --p1: light-dark(#b42318, #fb8b8b); --p2: light-dark(#b54708, #f8b06a); --p3: light-dark(#175cd3, #87b9ff); --progress: light-dark(#6941c6, #b99cff); --blocked: light-dark(#a15c00, #ffc568); --done: light-dark(#087443, #74d49a); }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--page); color: var(--text); font-family: ui-sans-serif, system-ui, sans-serif; }
    main { max-width: 1600px; margin: 0 auto; padding: 28px; }
    h1, h2, h3 { margin: 0; font-weight: 650; }
    h1 { font-size: clamp(1.45rem, 2.5vw, 2.1rem); }
    h2 { font-size: 1.1rem; margin: 28px 0 12px; }
    h3 { font-size: .95rem; }
    p { margin: 0; }
    .topline, .legend, .controls, .selected-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
    .topline { justify-content: space-between; gap: 18px; }
    .source-note, .ticket-state, .count, .empty { color: var(--muted); font-size: .88rem; }
    .controls { margin: 22px 0 10px; }
    .filter { border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 999px; padding: 8px 12px; cursor: pointer; }
    .filter[aria-pressed="true"] { background: var(--text); color: var(--surface); border-color: var(--text); }
    .legend { color: var(--muted); font-size: .88rem; }
    .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; flex: none; }
    .P1 { background: var(--p1); } .P2 { background: var(--p2); } .P3 { background: var(--p3); }
    .selected { margin: 22px 0 26px; padding: 18px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
    .selected-label { color: var(--muted); font-size: .82rem; margin-bottom: 5px; }
    .selected h2 { margin: 0 0 8px; }
    .selected-meta { color: var(--muted); font-size: .9rem; margin-bottom: 10px; }
    .selected-detail { line-height: 1.5; }
    .lanes { display: grid; gap: 32px; }
    .columns { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
    .column-heading { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin: 0 0 9px; }
    .stack { display: grid; gap: 10px; }
    .ticket { appearance: none; width: 100%; min-width: 0; padding: 13px; color: var(--text); border: 1px solid var(--border); border-radius: 10px; background: var(--surface); text-align: left; cursor: pointer; }
    .ticket:hover { border-color: var(--muted); }
    .ticket:focus-visible, .filter:focus-visible { outline: 3px solid var(--p3); outline-offset: 2px; }
    .ticket-header { display: flex; justify-content: space-between; gap: 8px; align-items: center; color: var(--muted); font-size: .82rem; }
    .ticket-title { display: block; margin: 9px 0 7px; font-weight: 600; line-height: 1.35; overflow-wrap: anywhere; }
    .empty { padding: 10px 0; }
    @media (max-width: 980px) { .columns { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 560px) { main { padding: 18px 16px; } .columns { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <div class="topline"><h1>PDKEF backlog</h1><p class="source-note">Read-only view · generated from backlog/tasks</p></div>
    <div class="controls" aria-label="Filter by priority">
      <button class="filter" type="button" data-priority="all" aria-pressed="true">All priorities</button>
      <button class="filter" type="button" data-priority="P1" aria-pressed="false">P1</button>
      <button class="filter" type="button" data-priority="P2" aria-pressed="false">P2</button>
      <button class="filter" type="button" data-priority="P3" aria-pressed="false">P3</button>
    </div>
    <div class="legend" aria-label="Priority colors"><span><i class="dot P1" aria-hidden="true"></i> P1 requirement, fidelity, or release risk</span><span><i class="dot P2" aria-hidden="true"></i> P2 reliability and maintainability</span><span><i class="dot P3" aria-hidden="true"></i> P3 optional expansion</span></div>
    <section class="selected" aria-live="polite"><p class="selected-label">Selected task</p><h2 id="selected-title"></h2><div class="selected-meta" id="selected-meta"></div><p class="selected-detail" id="selected-detail"></p></section>
    <div class="lanes" id="lanes"></div>
  </main>
  <script>
    const tickets = ${data};
    const lanes = ['Sign tool architecture', 'Editor architecture', 'Fonts and script support'];
    const columns = [['open', 'Open'], ['in_progress', 'In progress'], ['blocked', 'Blocked'], ['done', 'Done'], ['retired', 'Retired']];
    const laneRoot = document.getElementById('lanes');
    const selectedTitle = document.getElementById('selected-title');
    const selectedMeta = document.getElementById('selected-meta');
    const selectedDetail = document.getElementById('selected-detail');
    let priority = 'all';
    const escape = ${escapeHtml.toString()};
    function selectTicket(ticket) {
      selectedTitle.textContent = ticket.id + ' · ' + ticket.title;
      selectedMeta.innerHTML = '<span><i class="dot ' + ticket.priority + '" aria-hidden="true"></i> ' + ticket.priority + '</span><span>' + escape(ticket.stateLabel) + '</span><span>' + escape(ticket.lane) + '</span>';
      selectedDetail.textContent = ticket.detail;
    }
    function card(ticket) {
      return '<button class="ticket" type="button" data-ticket="' + ticket.id + '" aria-label="Show ' + escape(ticket.id + ': ' + ticket.title) + '"><span class="ticket-header"><span>' + escape(ticket.id) + '</span><i class="dot ' + ticket.priority + '" aria-label="' + ticket.priority + '"></i></span><span class="ticket-title">' + escape(ticket.title) + '</span><span class="ticket-state">' + escape(ticket.stateLabel) + '</span></button>';
    }
    function render() {
      const visible = tickets.filter((ticket) => priority === 'all' || ticket.priority === priority);
      laneRoot.innerHTML = lanes.map((lane) => '<section><h2>' + lane + '</h2><div class="columns">' + columns.map(([state, label]) => { const items = visible.filter((ticket) => ticket.lane === lane && ticket.state === state); return '<section aria-label="' + lane + ', ' + label + '"><div class="column-heading"><h3>' + label + '</h3><span class="count">' + items.length + '</span></div><div class="stack">' + (items.map(card).join('') || '<p class="empty">No tasks</p>') + '</div></section>'; }).join('') + '</div></section>').join('');
    }
    document.addEventListener('click', (event) => {
      const filter = event.target.closest('[data-priority]');
      if (filter) { priority = filter.dataset.priority; document.querySelectorAll('[data-priority]').forEach((button) => button.setAttribute('aria-pressed', String(button === filter))); render(); return; }
      const card = event.target.closest('[data-ticket]');
      if (card) selectTicket(tickets.find((ticket) => ticket.id === card.dataset.ticket));
    });
    selectTicket(tickets.find((ticket) => ticket.id === 'SIGN-05') || tickets[0]);
    render();
  </script>
</body>
</html>`;
}

const tickets = boardTickets(await readTasks());
if (tickets.length === 0) throw new Error('No canonical task files were found in backlog/tasks.');
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, pageFor(tickets));
console.log(`Wrote ${tickets.length} read-only tickets to ${outputPath}`);
