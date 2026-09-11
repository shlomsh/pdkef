#!/usr/bin/env node
// Writes BACKLOG.md and TODO.md from backlog/tasks/*.md. With --check it
// validates the task files and exits non-zero if either generated view is
// stale, without writing anything; CI runs that mode (ARCH-12).
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTasks, validateTasks } from './backlog-data.mjs';
import { epics, statuses, isEpicActive } from './backlog-epics.mjs';

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backlogPath = resolve(projectDirectory, 'BACKLOG.md');
const todoPath = resolve(projectDirectory, 'TODO.md');
const contextPath = resolve(projectDirectory, 'backlog/reference/migrated-todo-context.md');
const REGENERATE = 'npm run generate:backlog';

function link(task) {
  return `[${task.id}](backlog/tasks/${task.id}.md) · ${task.title}`;
}

function table(tasks) {
  if (!tasks.length) return '_None._\n';
  return ['| ID | Priority | Task |', '| --- | --- | --- |', ...tasks.map((task) => `| ${task.id} | ${task.priority} | ${link(task)} |`), ''].join('\n');
}

function epicSection(epic, tasks, visibleStatuses) {
  const groups = visibleStatuses.map(([status, statusLabel]) => {
    const items = tasks.filter((task) => task.epic === epic.key && task.status === status);
    return `### ${statusLabel}\n\n${table(items)}`;
  }).join('\n');
  return `## ${epic.label}\n\n${groups}`;
}

export function summary(tasks) {
  const active = epics.filter((epic) => isEpicActive(epic.key, tasks));
  const closed = epics.filter((epic) => !isEpicActive(epic.key, tasks));
  const sections = active.map((epic) => epicSection(epic, tasks, statuses)).join('\n');
  // A closed epic has only done/retired tasks, so its open/in-progress/blocked
  // tables would all read "_None._" - list what it shipped and nothing else.
  const history = closed.length
    ? `\n# Closed epics\n\nEvery task in these epics is done or retired. They collapse here so the board above is only live work; the task files keep the full record.\n\n${closed.map((epic) => epicSection(epic, tasks, statuses.filter(([status]) => status === 'done' || status === 'retired'))).join('\n')}`
    : '';
  return `<!-- GENERATED FILE: edit backlog/tasks/*.md, then run ${REGENERATE} -->

# Backlog

The canonical backlog is the task-file collection in [backlog/tasks/](backlog/tasks/). This summary is generated and read-only.

${sections}${history}`;
}

function slug(heading) {
  return heading
    .replace(/^#+\s+/, '')
    .replace(/[~`*]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

export function compatibilityIndex(tasks, context) {
  const reserved = new Set(['Open work', ...epics.map((epic) => epic.heading)]);
  const references = context.split('\n').filter((line) => /^#{2,3}\s+/.test(line)).map((line) => line.replace(/^#+\s+/, '')).filter((heading) => !reserved.has(heading));
  return `<!-- GENERATED COMPATIBILITY INDEX: edit backlog/tasks/*.md, then run ${REGENERATE} -->

# TODO

> The former monolithic TODO is now a generated index. The only editable task records are in [backlog/tasks/](backlog/tasks/).

## Open work

See [BACKLOG.md](BACKLOG.md) for the generated status view.

${epics.map((epic) => `## ${epic.heading}\n\n${table(tasks.filter((task) => task.epic === epic.key))}`).join('\n\n')}

## Migrated context and history

The prose, decisions, and supporting evidence formerly interleaved with tickets live in [backlog/reference/migrated-todo-context.md](backlog/reference/migrated-todo-context.md). It is reference material, not a task tracker.

${references.map((heading) => `### ${heading}\n\nSee [migrated context](backlog/reference/migrated-todo-context.md#${slug(heading)}).`).join('\n\n')}
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
  const context = await readFile(contextPath, 'utf8');
  const generated = [[backlogPath, summary(tasks)], [todoPath, compatibilityIndex(tasks, context)]];
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
