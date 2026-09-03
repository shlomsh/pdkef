#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readTasks } from './backlog-data.mjs';

const projectDirectory = resolve(new URL('..', import.meta.url).pathname);
const backlogPath = resolve(projectDirectory, 'BACKLOG.md');
const todoPath = resolve(projectDirectory, 'TODO.md');
const contextPath = resolve(projectDirectory, 'backlog/reference/migrated-todo-context.md');

const epics = [
  ['sign-tool-architecture', 'Sign tool architecture'],
  ['editor-architecture', 'Editor architecture'],
  ['fonts-and-script-support', 'Fonts and script support'],
];
const statuses = [
  ['open', 'Open'],
  ['in_progress', 'In progress'],
  ['blocked', 'Blocked'],
  ['done', 'Done'],
  ['retired', 'Retired'],
];

function link(task) {
  return `[${task.id}](backlog/tasks/${task.id}.md) · ${task.title}`;
}

function table(tasks) {
  if (!tasks.length) return '_None._\n';
  return ['| ID | Priority | Task |', '| --- | --- | --- |', ...tasks.map((task) => `| ${task.id} | ${task.priority} | ${link(task)} |`), ''].join('\n');
}

function summary(tasks) {
  const sections = epics.map(([key, label]) => {
    const groups = statuses.map(([status, statusLabel]) => {
      const items = tasks.filter((task) => task.epic === key && task.status === status);
      return `### ${statusLabel}\n\n${table(items)}`;
    }).join('\n');
    return `## ${label}\n\n${groups}`;
  }).join('\n');
  return `<!-- GENERATED FILE: edit backlog/tasks/*.md, then run node scripts/generate-backlog.mjs -->

# Backlog

The canonical backlog is the task-file collection in [backlog/tasks/](backlog/tasks/). This summary is generated and read-only.

${sections}`;
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

function compatibilityIndex(tasks, context) {
  const reserved = new Set(['Open work', 'Sign Tool architecture review (2026-08-28)', 'Editor module boundaries (architecture)', 'Internationalization: fonts for scripts beyond Hebrew/Latin']);
  const references = context.split('\n').filter((line) => /^#{2,3}\s+/.test(line)).map((line) => line.replace(/^#+\s+/, '')).filter((heading) => !reserved.has(heading));
  return `<!-- GENERATED COMPATIBILITY INDEX: edit backlog/tasks/*.md, then run node scripts/generate-backlog.mjs -->

# TODO

> The former monolithic TODO is now a generated index. The only editable task records are in [backlog/tasks/](backlog/tasks/).

## Open work

See [BACKLOG.md](BACKLOG.md) for the generated status view.

## Sign Tool architecture review (2026-08-28)

${table(tasks.filter((task) => task.epic === 'sign-tool-architecture'))}

## Editor module boundaries (architecture)

${table(tasks.filter((task) => task.epic === 'editor-architecture'))}

## Internationalization: fonts for scripts beyond Hebrew/Latin

${table(tasks.filter((task) => task.epic === 'fonts-and-script-support'))}

## Migrated context and history

The prose, decisions, and supporting evidence formerly interleaved with tickets live in [backlog/reference/migrated-todo-context.md](backlog/reference/migrated-todo-context.md). It is reference material, not a task tracker.

${references.map((heading) => `### ${heading}\n\nSee [migrated context](backlog/reference/migrated-todo-context.md#${slug(heading)}).`).join('\n\n')}
`;
}

const tasks = await readTasks();
const context = await readFile(contextPath, 'utf8');
await writeFile(backlogPath, summary(tasks));
await writeFile(todoPath, compatibilityIndex(tasks, context));
console.log(`Generated BACKLOG.md and TODO.md from ${tasks.length} canonical task files.`);
