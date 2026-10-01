#!/usr/bin/env node
// Writes BACKLOG.md and TODO.md from backlog/tasks/*.md. With --check it
// validates the task files and exits non-zero if either generated view is
// stale, without writing anything; CI runs that mode (ARCH-12).
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTasks, validateTasks, columnOf, compareTasks, isDate, COLUMNS } from './backlog-data.mjs';
import { lanes, closedEpics, LIVE_STATUSES } from './backlog-epics.mjs';

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backlogPath = resolve(projectDirectory, 'BACKLOG.md');
const todoPath = resolve(projectDirectory, 'TODO.md');
const REGENERATE = 'npm run generate:backlog';

const cell = (text) => String(text).replace(/\|/g, '\\|');
const link = (task) => `[${task.id}](backlog/tasks/${task.id}.md) · ${cell(task.title)}`;

function noteOf(task) {
  const parts = [];
  if (task.status === 'in_progress') parts.push('In progress');
  if (task.waiting_on) parts.push(`Waiting on ${task.waiting_on}`);
  if (task.needs) parts.push(`Needs Shlomi: ${task.needs}`);
  return cell(parts.join('. '));
}

function table(tasks) {
  return ['| ID | P | Task | Note |', '| --- | --- | --- | --- |', ...tasks.map((task) => `| ${task.id} | ${task.priority} | ${link(task)} | ${noteOf(task)} |`), ''].join('\n');
}

const live = (tasks) => tasks.filter((task) => LIVE_STATUSES.has(task.status));
const inColumn = (tasks, laneKey, column) => live(tasks).filter((task) => task.epic === laneKey && columnOf(task) === column).sort(compareTasks);

export function summary(tasks) {
  const all = live(tasks);
  const count = (column) => all.filter((task) => columnOf(task) === column).length;
  const counts = `${all.length} live: ${count('next')} up next, ${count('then')} then, ${count('waiting')} waiting, ${count('parked')} parked.`;
  const sections = lanes.map((lane) => {
    const groups = COLUMNS.map(([column, label]) => {
      const items = inColumn(tasks, lane.key, column);
      return items.length ? `### ${label}\n\n${table(items)}` : '';
    }).filter(Boolean).join('\n');
    return `## ${lane.label}\n\n${lane.why}\n\n${groups || '_Nothing live._\n'}`;
  }).join('\n');
  const closed = closedEpics.map((epic) => {
    const mine = tasks.filter((task) => task.epic === epic.key);
    const done = mine.filter((task) => task.status === 'done').length;
    const retired = mine.filter((task) => task.status === 'retired').length;
    return mine.length ? `- ${epic.label}: ${done} done, ${retired} retired` : '';
  }).filter(Boolean).join('\n');
  return `<!-- GENERATED FILE: edit backlog/tasks/*.md, then run ${REGENERATE} -->

# Backlog

The canonical backlog is the task-file collection in [backlog/tasks/](backlog/tasks/). This view is generated and read-only. ${counts}

${sections}
# Closed work

Done and retired tickets are not listed. Their files stay in [backlog/tasks/](backlog/tasks/) as the record.

${closed}
`;
}

const bullet = (task) => `- [${task.id}](backlog/tasks/${task.id}.md) ${task.priority} · ${task.title}${task.status === 'in_progress' ? ' (in progress)' : ''}`;

export function todoView(tasks) {
  const upNext = lanes.map((lane) => {
    const items = inColumn(tasks, lane.key, 'next');
    return items.length ? `### ${lane.label}\n\n${items.map(bullet).join('\n')}` : '';
  }).filter(Boolean).join('\n\n');
  const waiting = live(tasks).filter((task) => columnOf(task) === 'waiting');
  const dated = waiting.filter((task) => isDate(task.waiting_on)).sort((a, b) => a.waiting_on.localeCompare(b.waiting_on) || compareTasks(a, b));
  const undated = waiting.filter((task) => !isDate(task.waiting_on)).sort(compareTasks);
  const waitingLine = (task) => `- ${task.waiting_on}: [${task.id}](backlog/tasks/${task.id}.md) · ${task.title}`;
  const needs = live(tasks).filter((task) => task.needs).sort(compareTasks);
  return `<!-- GENERATED FILE: edit backlog/tasks/*.md, then run ${REGENERATE} -->

# TODO

What is next across the board. Every lane, with its full order, is in [BACKLOG.md](BACKLOG.md).

## Up next

${upNext || '_Nothing is up next._'}

## Waiting, by date

${[...dated, ...undated].map(waitingLine).join('\n') || '_Nothing is waiting._'}

## Needs Shlomi

${needs.map((task) => `- [${task.id}](backlog/tasks/${task.id}.md) · ${task.needs}`).join('\n') || '_Nothing._'}

See [BACKLOG.md](BACKLOG.md) for every lane.
`;
}

async function main() {
  const check = process.argv.includes('--check');
  const tasks = await readTasks();
  const errors = validateTasks(tasks);
  if (errors.length) {
    console.error(`Backlog validation failed (${errors.length}):\n${errors.map((error) => `  - ${error}`).join('\n')}`);
    process.exit(1);
  }
  const generated = [[backlogPath, summary(tasks)], [todoPath, todoView(tasks)]];
  if (check) {
    const stale = [];
    for (const [path, content] of generated) {
      const current = await readFile(path, 'utf8').catch(() => '');
      if (current !== content) stale.push(path.slice(projectDirectory.length));
    }
    if (stale.length) {
      console.error(`Generated backlog views are stale: ${stale.join(', ')}. Run \`${REGENERATE}\` and commit the result.`);
      process.exit(1);
    }
    console.log(`Backlog valid: ${tasks.length} task files, BACKLOG.md and TODO.md current.`);
    return;
  }
  for (const [path, content] of generated) await writeFile(path, content);
  console.log(`Generated BACKLOG.md and TODO.md from ${tasks.length} canonical task files.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
