#!/usr/bin/env node
// Local board for backlog/tasks. Localhost only, GET only, re-reads the task
// files on every request. The columns come from columnOf in backlog-data.mjs,
// the same rule BACKLOG.md uses, so the two cannot disagree.
import { createServer } from 'node:http';
import { readTasks, validateTasks, columnOf, compareTasks, COLUMNS } from './backlog-data.mjs';
import { lanes, epics, LIVE_STATUSES } from './backlog-epics.mjs';

const port = Number(process.env.BACKLOG_PORT || 4321);
const host = '127.0.0.1';

const clientTask = (task) => ({
  id: task.id, title: task.title, priority: task.priority, inProgress: task.status === 'in_progress',
  needs: task.needs || '', waitingOn: task.waiting_on || '',
  status: task.status, dependsOn: Array.isArray(task.depends_on) ? task.depends_on : [], body: task.body || '',
});

function board(tasks) {
  const problems = validateTasks(tasks);
  const live = tasks.filter((task) => LIVE_STATUSES.has(task.status));
  return {
    problems,
    lanes: lanes.map((lane) => {
      const mine = live.filter((task) => task.epic === lane.key);
      return {
        name: lane.label, why: lane.why,
        columns: Object.fromEntries(COLUMNS.map(([column]) => [column, mine.filter((task) => columnOf(task) === column).sort(compareTasks).map(clientTask)])),
      };
    }),
    closed: epics.map((epic) => {
      const mine = tasks.filter((task) => task.epic === epic.key);
      return { label: epic.label, done: mine.filter((task) => task.status === 'done').length, retired: mine.filter((task) => task.status === 'retired').length };
    }).filter((epic) => epic.done + epic.retired > 0),
  };
}

const css = `:root {
  --bg: #faf7f1;
  --surface: #ffffff;
  --sunken: #f1efe8;
  --ink: #0b4c4c;
  --muted: #4f706c;
  --line: #dfe6e2;
  --line-strong: #9cc9c1;
  --accent: #007979;
  --accent-soft: #e3f3ef;
  --p1: #b84c58;
  --p1-soft: #fbecee;
  --p2: #8a6a1f;
  --p2-soft: #fbf3dc;
  --p3: #5d6f6c;
  --p3-soft: #eef1f0;
  --you: #5c7a3a;
  --you-soft: #ebf7dc;
  --citron: #efffa6;
  --font-ui: "IBM Plex Sans", -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --font-id: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #062b2b; --surface: #0b3836; --sunken: #08302f; --ink: #e2f3ef; --muted: #9dbfb9;
    --line: #1c4b48; --line-strong: #2f6c66; --accent: #5fd3c3; --accent-soft: #123f3c;
    --p1: #f0959e; --p1-soft: #3a2228; --p2: #e6c56f; --p2-soft: #3a3220; --p3: #a9bcb8; --p3-soft: #1b3c3a;
    --you: #b6db86; --you-soft: #233a20; --citron: #3d4a17; color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #062b2b; --surface: #0b3836; --sunken: #08302f; --ink: #e2f3ef; --muted: #9dbfb9;
  --line: #1c4b48; --line-strong: #2f6c66; --accent: #5fd3c3; --accent-soft: #123f3c;
  --p1: #f0959e; --p1-soft: #3a2228; --p2: #e6c56f; --p2-soft: #3a3220; --p3: #a9bcb8; --p3-soft: #1b3c3a;
  --you: #b6db86; --you-soft: #233a20; --citron: #3d4a17; color-scheme: dark;
}
* { box-sizing: border-box; }
body { background: var(--bg); color: var(--ink); font: 400 14px/1.5 var(--font-ui); }
.wrap { max-width: 1320px; margin: 0 auto; padding-inline: 20px; padding-block: 28px 64px; display: grid; gap: 28px; }
h1, h2, h3 { margin: 0; text-wrap: balance; }
h1 { font-size: 28px; font-weight: 700; letter-spacing: -0.01em; }
h2 { font-size: 18px; font-weight: 650; }
p { margin: 0; }
.eyebrow { font: 600 11px/1 var(--font-ui); letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.lede { color: var(--muted); max-width: 70ch; }
header { display: grid; gap: 8px; }

/* Summary */
.summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.stat { background: var(--surface); padding: 14px 16px; display: grid; gap: 2px; }
.stat b { font: 600 26px/1.1 var(--font-id); font-variant-numeric: tabular-nums; }
.stat span { color: var(--muted); font-size: 13px; }

/* Controls */
.controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.seg { display: inline-flex; border: 1px solid var(--line-strong); border-radius: 999px; overflow: hidden; }
.seg button { font: 500 13px var(--font-ui); color: var(--ink); background: transparent; border: 0; padding: 6px 14px; cursor: pointer; }
.seg button + button { border-left: 1px solid var(--line-strong); }
.seg button[aria-pressed="true"] { background: var(--accent); color: var(--bg); }
.controls input[type="search"] { font: 400 13px var(--font-ui); color: var(--ink); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 999px; padding: 6px 14px; min-width: 0; flex: 1 1 200px; max-width: 280px; }
.check { display: inline-flex; gap: 6px; align-items: center; font-size: 13px; color: var(--muted); cursor: pointer; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* Timeline */
.timeline { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 16px 20px 20px; display: grid; gap: 14px; }
.tl-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; align-items: baseline; }
.tl-scroll { overflow-x: auto; }
.tl { position: relative; height: 112px; min-width: 620px; margin-inline: 8px; }
.tl-axis { position: absolute; left: 0; right: 0; top: 56px; height: 2px; background: var(--line-strong); }
.tl-tick { position: absolute; top: 50px; width: 2px; height: 14px; background: var(--line-strong); }
.tl-month { position: absolute; top: 70px; font: 500 11px var(--font-id); color: var(--muted); transform: translateX(-50%); white-space: nowrap; }
.tl-ev { position: absolute; top: 0; transform: translateX(-50%); display: grid; justify-items: center; gap: 4px; }
.tl-ev .dot { width: 12px; height: 12px; border-radius: 50%; background: var(--accent); border: 2px solid var(--surface); box-shadow: 0 0 0 1px var(--accent); margin-top: 6px; }
.tl-ev.today { transform: translateX(-6px); justify-items: start; }
.tl-ev.today .dot { background: var(--surface); }
.tl-ev .lbl { font: 600 12px var(--font-id); white-space: nowrap; }
.tl-ev .n { position: absolute; top: 84px; font-size: 12px; color: var(--muted); white-space: nowrap; }
.tl-ev .lbl.alt { order: -1; }

/* Lanes */
.lanes { display: grid; gap: 18px; }
.lane { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
.lane-head { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: baseline; padding: 14px 18px; border-bottom: 1px solid var(--line); }
.lane-head h2 { flex: 0 1 auto; }
.lane-head .why { color: var(--muted); flex: 1 1 320px; min-width: 0; }
.lane-head .count { font: 500 12px var(--font-id); color: var(--muted); white-space: nowrap; }
.cols { display: grid; grid-template-columns: 1fr 1.6fr 1fr 0.9fr; }
.col { padding: 12px 14px 16px; display: grid; align-content: start; gap: 8px; min-width: 0; border-left: 1px solid var(--line); }
.col:first-child { border-left: 0; }
.col.next { background: var(--accent-soft); }
.col.park { background: var(--sunken); }
.col h3 { font: 600 11px/1 var(--font-ui); letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); padding-bottom: 2px; }
.col.empty .none { color: var(--muted); font-size: 13px; opacity: 0.7; }
.then-list { display: grid; gap: 8px; counter-reset: step; }

.card { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 9px 11px; display: grid; gap: 4px; min-width: 0; }
.col.park .card { background: transparent; border-style: dashed; }
.card .top { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.id { font: 600 12px var(--font-id); color: var(--accent); }
.then-list .card .id::before { counter-increment: step; content: counter(step) " · "; color: var(--muted); font-weight: 500; }
.title { font-weight: 550; line-height: 1.35; overflow-wrap: anywhere; }
.note { color: var(--muted); font-size: 12.5px; line-height: 1.4; overflow-wrap: anywhere; }
.chip { font: 600 10.5px/1 var(--font-ui); letter-spacing: 0.03em; padding: 3px 6px; border-radius: 4px; white-space: nowrap; }
.chip.P1 { color: var(--p1); background: var(--p1-soft); }
.chip.P2 { color: var(--p2); background: var(--p2-soft); }
.chip.P3 { color: var(--p3); background: var(--p3-soft); }
.chip.size { color: var(--muted); background: transparent; border: 1px solid var(--line); }
.chip.flag { color: var(--accent); background: var(--accent-soft); }
.chip.you { color: var(--you); background: var(--you-soft); }
.chip.when { color: var(--ink); background: transparent; border: 1px solid var(--line-strong); font-family: var(--font-id); }
.card.dim { display: none; }

/* Leaving + cleanup */
.panel { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px; display: grid; gap: 12px; align-content: start; min-width: 0; }
.panel h2 { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
.panel h2 small { font: 500 12px var(--font-id); color: var(--muted); }
ul.plain { margin: 0; padding-left: 18px; display: grid; gap: 6px; }
ul.plain li { overflow-wrap: anywhere; }
ul.plain code { font: 500 12px var(--font-id); }
.sub { font: 600 12px var(--font-ui); letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
.callout { background: var(--you-soft); color: var(--ink); border-radius: 8px; padding: 10px 12px; font-size: 13px; }
.callout b { color: var(--you); }

@media (max-width: 900px) {
  .cols { grid-template-columns: 1fr; }
  .col { border-left: 0; border-top: 1px solid var(--line); }
  .col:first-child { border-top: 0; }
  .col.empty { display: none; }
}
@media (max-width: 480px) { .wrap { padding-inline: 16px; } h1 { font-size: 24px; } }
@media (prefers-reduced-motion: no-preference) { .seg button { transition: background 0.15s; } }
.closed-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 6px 18px; margin: 0; padding: 0; list-style: none; }
.closed-list li { display: flex; justify-content: space-between; gap: 10px; border-bottom: 1px solid var(--line); padding: 4px 0; }
.closed-list .n { font: 500 12px var(--font-id); color: var(--muted); white-space: nowrap; }
.error { color: var(--p1); }
.live-status { color: var(--muted); font-size: 12px; }
.card { cursor: pointer; }
.card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* Ticket detail */
dialog.detail { width: min(760px, calc(100vw - 32px)); max-width: none; max-height: 85vh; padding: 0; border: 1px solid var(--line-strong); border-radius: 12px; background: var(--surface); color: var(--ink); overflow: hidden; }
dialog.detail[open] { display: flex; flex-direction: column; }
dialog.detail::backdrop { background: var(--ink); opacity: 0.45; }
.d-head { display: flex; gap: 12px; align-items: flex-start; justify-content: space-between; padding: 16px 18px 12px; border-bottom: 1px solid var(--line); }
.d-head h2 { overflow-wrap: anywhere; font-size: 17px; }
.d-close { font: 500 13px var(--font-ui); color: var(--ink); background: transparent; border: 1px solid var(--line-strong); border-radius: 999px; padding: 5px 12px; cursor: pointer; flex: none; }
.d-scroll { overflow: auto; padding: 14px 18px 20px; display: grid; gap: 14px; align-content: start; min-width: 0; }
.d-meta { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 0; font-size: 13px; }
.d-meta dt { color: var(--muted); }
.d-meta dd { margin: 0; overflow-wrap: anywhere; }
.md { display: grid; gap: 10px; min-width: 0; overflow-wrap: anywhere; }
.md h1, .md h2, .md h3 { font-size: 15px; font-weight: 650; text-wrap: balance; }
.md h1 { font-size: 17px; }
.md ul, .md ol { margin: 0; padding-left: 22px; display: grid; gap: 3px; }
.md ul.tasks { list-style: none; padding-left: 4px; }
.md code { font: 500 12px var(--font-id); background: var(--sunken); padding: 1px 4px; border-radius: 4px; }
.md pre { margin: 0; overflow-x: auto; background: var(--sunken); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; }
.md pre code { background: transparent; padding: 0; white-space: pre; }
.md a { color: var(--accent); }
.md .tbl { overflow-x: auto; }
.md table { border-collapse: collapse; font-size: 13px; }
.md th, .md td { border: 1px solid var(--line); padding: 4px 8px; text-align: left; vertical-align: top; }
.md th { background: var(--sunken); }
`;

// Runs in the browser; embedded with toString() so it needs no escaping.
function client(columns) {
  const FLAG_LABEL = 'Needs Shlomi';
  const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtDate = (d) => (isDate(d) ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : d);
  const el = (id) => document.getElementById(id);
  const todayIso = () => { const n = new Date(); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); };
  let data = null;
  let mode = 'all';
  try { mode = localStorage.getItem('board-mode') || 'all'; } catch (e) { /* storage unavailable */ }
  let showPark = true;
  let lastText = '';

  function card(t) {
    const chips = ['<span class="chip ' + esc(t.priority) + '">' + esc(t.priority) + '</span>'];
    if (t.inProgress) chips.push('<span class="chip flag">In progress</span>');
    if (t.needs) chips.push('<span class="chip you">' + FLAG_LABEL + '</span>');
    if (t.waitingOn) chips.push('<span class="chip when">' + esc(fmtDate(t.waitingOn)) + '</span>');
    const note = t.needs ? '<div class="note">' + esc(t.needs) + '</div>' : '';
    const text = (t.id + ' ' + t.title + ' ' + t.needs + ' ' + t.waitingOn + ' ' + t.body).toLowerCase();
    return '<article class="card" tabindex="0" role="button" aria-haspopup="dialog" data-id="' + esc(t.id) + '" data-p="' + esc(t.priority) + '" data-you="' + Boolean(t.needs) + '" data-text="' + esc(text) + '">'
      + '<div class="top"><span class="id">' + esc(t.id) + '</span>' + chips.join('') + '</div>'
      + '<div class="title">' + esc(t.title) + '</div>' + note + '</article>';
  }

  // Small markdown renderer: escape first, then a fixed set of block and inline rules.
  function inline(raw) {
    const stash = [];
    const keep = (html) => '\u0001' + (stash.push(html) - 1) + '\u0001';
    let s = esc(raw);
    s = s.replace(/`([^`]+)`/g, (m, c) => keep('<code>' + c + '</code>'));
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, url) => keep(/^https?:\/\//i.test(url)
      ? '<a href="' + url + '" target="_blank" rel="noopener">' + text + '</a>'
      : text + ' <code>' + url + '</code>'));
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*\s][^*]*)\*/g, '<em>$1</em>');
    return s.replace(/\u0001(\d+)\u0001/g, (m, i) => stash[Number(i)]);
  }

  function markdown(src) {
    const lines = String(src).replace(/\r/g, '').split('\n');
    const out = [];
    const bullet = /^\s*[-*]\s+(.*)$/;
    const numbered = /^\s*\d+[.)]\s+(.*)$/;
    const sep = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
    const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    const startsBlock = (line, next) => /^```/.test(line) || /^#{1,3}\s/.test(line) || bullet.test(line) || numbered.test(line) || (/^\s*\|/.test(line) && next !== undefined && sep.test(next));
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      if (/^```/.test(line)) {
        const code = [];
        for (i++; i < lines.length && !/^```/.test(lines[i]); i++) code.push(lines[i]);
        i++;
        out.push('<pre><code>' + esc(code.join('\n')) + '</code></pre>');
        continue;
      }
      const h = /^(#{1,3})\s+(.*)$/.exec(line);
      if (h) { out.push('<h' + h[1].length + '>' + inline(h[2]) + '</h' + h[1].length + '>'); i++; continue; }
      if (/^\s*\|/.test(line) && i + 1 < lines.length && sep.test(lines[i + 1])) {
        const head = cells(line);
        let html = '<div class="tbl"><table><thead><tr>' + head.map((c) => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>';
        for (i += 2; i < lines.length && /^\s*\|/.test(lines[i]); i++) html += '<tr>' + cells(lines[i]).map((c) => '<td>' + inline(c) + '</td>').join('') + '</tr>';
        out.push(html + '</tbody></table></div>');
        continue;
      }
      if (bullet.test(line) || numbered.test(line)) {
        const ordered = !bullet.test(line);
        const items = [];
        let tasks = false;
        for (; i < lines.length; i++) {
          const m = (ordered ? numbered : bullet).exec(lines[i]);
          if (!m) break;
          const t = /^\[( |x|X)\]\s+(.*)$/.exec(m[1]);
          if (t) { tasks = true; items.push('<li>' + (t[1] === ' ' ? '☐ ' : '☑ ') + inline(t[2]) + '</li>'); } else items.push('<li>' + inline(m[1]) + '</li>');
        }
        const tag = ordered ? 'ol' : 'ul';
        out.push('<' + tag + (tasks ? ' class="tasks"' : '') + '>' + items.join('') + '</' + tag + '>');
        continue;
      }
      const para = [];
      for (; i < lines.length && lines[i].trim() && (!para.length || !startsBlock(lines[i], lines[i + 1])); i++) para.push(lines[i].trim());
      out.push('<p>' + inline(para.join(' ')) + '</p>');
    }
    return out.join('');
  }

  // Detail dialog
  let byId = {};
  let openId = null;
  const dlg = () => el('detail');
  const cardOf = (id) => Array.from(document.querySelectorAll('.card')).find((c) => c.dataset.id === id);

  function fillDetail(t) {
    const meta = [['Status', t.status.replace(/_/g, ' ')]];
    if (t.needs) meta.push(['Needs', t.needs]);
    if (t.waitingOn) meta.push(['Waiting on', isDate(t.waitingOn) ? fmtDate(t.waitingOn) + ' (' + t.waitingOn + ')' : t.waitingOn]);
    if (t.dependsOn.length) meta.push(['Depends on', t.dependsOn.join(', ')]);
    el('dHead').innerHTML = '<div><div class="top"><span class="id">' + esc(t.id) + '</span><span class="chip ' + esc(t.priority) + '">' + esc(t.priority) + '</span></div><h2 id="dTitle">' + esc(t.title) + '</h2></div>'
      + '<button type="button" class="d-close" id="dClose">Close</button>';
    el('dMeta').innerHTML = meta.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('');
    el('dBody').innerHTML = markdown(t.body);
  }

  function openTicket(id) {
    const t = byId[id];
    if (!t || openId === id) return;
    openId = id;
    fillDetail(t);
    el('dScroll').scrollTop = 0;
    if (!dlg().open) dlg().showModal();
    if (location.hash.slice(1) !== id) location.hash = id;
  }

  function syncHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id && byId[id]) openTicket(id);
    else if (!id && dlg().open) dlg().close();
  }

  function renderSummary(all) {
    const n = (c) => all.filter((x) => x.col === c).length;
    el('summary').innerHTML = [
      [all.length, 'live tickets'], [n('next'), 'up next'], [n('then'), 'then, in order'],
      [n('waiting'), 'waiting'], [n('parked'), 'parked'], [all.filter((x) => x.t.needs).length, 'need Shlomi'],
    ].map(([count, label]) => '<div class="stat"><b>' + count + '</b><span>' + label + '</span></div>').join('');
  }

  function renderTimeline(all) {
    const dated = all.filter((x) => isDate(x.t.waitingOn));
    const root = el('tl');
    if (!dated.length) { root.innerHTML = '<span class="note">Nothing is waiting on a date.</span>'; return; }
    const today = todayIso();
    const dates = dated.map((x) => x.t.waitingOn);
    const start = Date.parse(today + 'T00:00:00Z');
    const lo = Math.min(start, Date.parse(dates.slice().sort()[0] + 'T00:00:00Z'));
    const end = Math.max(start, ...dates.map((d) => Date.parse(d + 'T00:00:00Z'))) + 7 * 86400000;
    const span = end - lo;
    const pct = (d) => ((Date.parse(d + 'T00:00:00Z') - lo) / span * 100).toFixed(2) + '%';
    const byDate = {};
    dated.forEach((x) => { (byDate[x.t.waitingOn] = byDate[x.t.waitingOn] || []).push(x.t.id); });
    let html = '<div class="tl-axis"></div>';
    const cursor = new Date(lo);
    cursor.setUTCDate(1);
    for (cursor.setUTCMonth(cursor.getUTCMonth() + 1); cursor.getTime() < end; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
      const iso = cursor.toISOString().slice(0, 10);
      html += '<div class="tl-tick" style="left:' + pct(iso) + '"></div><div class="tl-month" style="left:' + pct(iso) + '">' + cursor.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }) + '</div>';
    }
    html += '<div class="tl-ev today" style="left:' + pct(today) + '"><span class="lbl">Today</span><span class="dot"></span></div>';
    // Dates within a week of each other share one marker, so their labels never overlap.
    const groups = [];
    Object.keys(byDate).sort().forEach((d) => {
      const last = groups[groups.length - 1];
      if (last && Date.parse(d) - Date.parse(last.from) <= 7 * 86400000) { last.to = d; last.ids.push(...byDate[d]); }
      else groups.push({ from: d, to: d, ids: [...byDate[d]] });
    });
    groups.forEach(({ from, to, ids }) => {
      const label = from === to ? fmtDate(from)
        : from.slice(0, 7) === to.slice(0, 7) ? Number(from.slice(8)) + '-' + fmtDate(to) : fmtDate(from) + ' - ' + fmtDate(to);
      html += '<div class="tl-ev" style="left:' + pct(from) + '" title="' + esc(ids.join(', ')) + '"><span class="lbl">' + esc(label) + '</span><span class="dot"></span><span class="n">' + ids.length + (ids.length === 1 ? ' card' : ' cards') + '</span></div>';
    });
    root.innerHTML = html;
  }

  function renderLanes() {
    el('lanes').innerHTML = data.lanes.map((lane) => {
      const total = columns.reduce((sum, [c]) => sum + lane.columns[c].length, 0);
      const work = lane.columns.next.length + lane.columns.then.length;
      const cols = columns.map(([c, label]) => {
        const items = lane.columns[c];
        const body = items.length ? items.map(card).join('') : '<span class="none">Nothing here</span>';
        const inner = c === 'then' && items.length ? '<div class="then-list">' + body + '</div>' : body;
        return '<div class="col ' + (c === 'next' ? 'next' : c === 'parked' ? 'park' : c) + (items.length ? '' : ' empty') + '" data-col="' + c + '"><h3>' + label + '</h3>' + inner + '</div>';
      }).join('');
      return '<section class="lane"><div class="lane-head"><h2>' + esc(lane.name) + '</h2><span class="count">' + work + ' to do · ' + total + ' total</span><p class="why">' + esc(lane.why) + '</p></div><div class="cols">' + cols + '</div></section>';
    }).join('');
  }

  function renderClosed() {
    const done = data.closed.reduce((s, c) => s + c.done, 0);
    const retired = data.closed.reduce((s, c) => s + c.retired, 0);
    el('closedCount').textContent = done + ' done, ' + retired + ' retired';
    el('closed').innerHTML = data.closed.map((c) => '<li><span>' + esc(c.label) + '</span><span class="n">' + c.done + ' done · ' + c.retired + ' retired</span></li>').join('');
  }

  function apply() {
    const s = el('q').value.trim().toLowerCase();
    document.querySelectorAll('.card').forEach((card) => {
      const ok = (mode === 'all' || (mode === 'P1' && card.dataset.p === 'P1') || (mode === 'you' && card.dataset.you === 'true')) && (!s || card.dataset.text.includes(s));
      card.classList.toggle('dim', !ok);
    });
    document.querySelectorAll('.col.park').forEach((col) => { col.hidden = !showPark; });
    document.querySelectorAll('#seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === mode)));
  }

  function render() {
    const all = [];
    data.lanes.forEach((lane) => columns.forEach(([c]) => lane.columns[c].forEach((t) => all.push({ col: c, t }))));
    byId = {};
    all.forEach((x) => { byId[x.t.id] = x.t; });
    renderSummary(all);
    renderTimeline(all);
    renderLanes();
    renderClosed();
    apply();
    if (openId && byId[openId]) {
      const scroller = el('dScroll');
      const top = scroller.scrollTop;
      fillDetail(byId[openId]);
      scroller.scrollTop = top;
    }
  }

  async function refresh() {
    try {
      const response = await fetch('/api/board', { cache: 'no-store' });
      if (!response.ok) throw new Error('The task files could not be read.');
      const text = await response.text();
      const changed = text !== lastText;
      lastText = text;
      data = JSON.parse(text);
      // The board still renders a broken backlog, but says what check:backlog will reject.
      el('error').hidden = !data.problems.length;
      el('error').textContent = data.problems.length ? 'check:backlog would fail: ' + data.problems.join(' ') : '';
      el('live').textContent = 'Updated ' + new Date().toLocaleTimeString();
      if (changed) render();
      syncHash();
    } catch (caught) {
      el('error').hidden = false;
      el('error').textContent = caught.message;
      el('live').textContent = 'Update failed';
    }
  }

  el('seg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    mode = b.dataset.f;
    try { localStorage.setItem('board-mode', mode); } catch (err) { /* storage unavailable */ }
    apply();
  });
  const lanesEl = el('lanes');
  lanesEl.addEventListener('click', (e) => { const c = e.target.closest('.card'); if (c) openTicket(c.dataset.id); });
  lanesEl.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('card')) { e.preventDefault(); openTicket(e.target.dataset.id); }
  });
  dlg().addEventListener('click', (e) => { if (e.target === dlg() || e.target.id === 'dClose') dlg().close(); });
  dlg().addEventListener('close', () => {
    const id = openId;
    openId = null;
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    const c = id && cardOf(id);
    if (c) c.focus();
  });
  window.addEventListener('hashchange', syncHash);
  el('q').addEventListener('input', apply);
  el('showPark').addEventListener('change', (e) => { showPark = e.target.checked; apply(); });
  refresh();
  setInterval(refresh, 2000);
}

function page() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PDkef Board</title>
<style>
${css}</style>
</head>
<body>
<div class="wrap">
  <header>
    <span class="eyebrow">Read-only live view · source: backlog/tasks · <span class="live-status" id="live" aria-live="polite">Connecting…</span></span>
    <h1>PDkef Board</h1>
    <p class="lede">Live work only, in six lanes. Within each lane, "Then, in order" is the real order to do things in.</p>
    <p class="error" id="error" role="alert" hidden></p>
  </header>

  <section class="summary" id="summary" aria-label="Summary"></section>

  <section class="timeline" aria-labelledby="tl-title">
    <div class="tl-head">
      <h2 id="tl-title">What's waiting on a date</h2>
      <span class="note">From today to a week past the last date.</span>
    </div>
    <div class="tl-scroll"><div class="tl" id="tl"></div></div>
  </section>

  <div class="controls" role="group" aria-label="Filter the board">
    <div class="seg" id="seg">
      <button type="button" data-f="all" aria-pressed="true">All</button>
      <button type="button" data-f="P1" aria-pressed="false">P1 only</button>
      <button type="button" data-f="you" aria-pressed="false">Needs Shlomi</button>
    </div>
    <input type="search" id="q" placeholder="Find a ticket or word" aria-label="Find a ticket">
    <label class="check"><input type="checkbox" id="showPark" checked> Show parked</label>
  </div>

  <section class="lanes" id="lanes" aria-label="Pieces of work"></section>

  <section class="panel" aria-labelledby="closed-title">
    <h2 id="closed-title">Closed work <small id="closedCount"></small></h2>
    <ul class="closed-list" id="closed"></ul>
    <p class="note">Done and retired tickets stay in backlog/tasks/ as the record.</p>
  </section>
</div>
<dialog class="detail" id="detail" aria-labelledby="dTitle">
  <div class="d-head" id="dHead"></div>
  <div class="d-scroll" id="dScroll"><dl class="d-meta" id="dMeta"></dl><div class="md" id="dBody"></div></div>
</dialog>
<script>(${client})(${JSON.stringify(COLUMNS.map(([c, label]) => [c, label]))});</script>
</body>
</html>`;
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET') {
    response.writeHead(405, { Allow: 'GET' });
    response.end('Read-only viewer: GET only.');
    return;
  }
  if (request.url === '/api/board') {
    try {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(board(await readTasks())));
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
