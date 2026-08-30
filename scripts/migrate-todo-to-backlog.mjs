#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const todoPath = resolve(projectDirectory, 'TODO.md');
const backlogDirectory = resolve(projectDirectory, 'backlog');
const taskDirectory = resolve(backlogDirectory, 'tasks');
const referencePath = resolve(backlogDirectory, 'reference', 'migrated-todo-context.md');

function yaml(value) {
  return JSON.stringify(value);
}

function cleanMarkdown(value) {
  return value
    .replace(/!?(?:\[([^\]]*)\])\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*|__|~~|\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleFrom(description) {
  const match = description.match(/\*\*([^*]+)\*\*/);
  return cleanMarkdown(match?.[1] || description.split('. ')[0]).replace(/\.$/, '');
}

function statusFrom(value) {
  const normalized = value.toLowerCase();
  if (normalized.includes('retired')) return 'retired';
  if (normalized.includes('blocked')) return 'blocked';
  if (normalized.startsWith('done') || normalized.startsWith('landed')) return 'done';
  if (normalized.startsWith('in progress')) return 'in_progress';
  return 'open';
}

function priorityFrom(value) {
  if (value.includes('P1')) return 'P1';
  if (value.includes('P2')) return 'P2';
  return 'P3';
}

function epicFrom(id) {
  if (id.startsWith('ARCH-')) return 'editor-architecture';
  if (id.startsWith('FONT-')) return 'fonts-and-script-support';
  return 'sign-tool-architecture';
}

function phaseFrom(value) {
  return cleanMarkdown(value.replace(/\bP[123]\b/g, '').replace(/^\s*\/\s*/, ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'unspecified';
}

const dependencies = { 'ARCH-02': ['SIGN-05'], 'FONT-04': ['FONT-02'] };

function parseTickets(markdown) {
  const tickets = [];
  for (const line of markdown.split('\n')) {
    const match = line.match(/^\|\s*((?:SIGN|ARCH|FONT)-\d+)\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*(.+?)(?:\|\s*)?$/);
    if (!match) continue;
    const [, id, priority, legacyState, description] = match;
    tickets.push({ id, title: titleFrom(description), status: statusFrom(legacyState), priority: priorityFrom(priority), epic: epicFrom(id), phase: phaseFrom(priority), depends_on: dependencies[id] || [], legacy_state: cleanMarkdown(legacyState), description: description.trim() });
  }
  return tickets;
}

function taskFile(ticket) {
  return [
    '---',
    `id: ${yaml(ticket.id)}`,
    `title: ${yaml(ticket.title)}`,
    `status: ${yaml(ticket.status)}`,
    `priority: ${yaml(ticket.priority)}`,
    `epic: ${yaml(ticket.epic)}`,
    `phase: ${yaml(ticket.phase)}`,
    `depends_on: [${ticket.depends_on.map(yaml).join(', ')}]`,
    `legacy_state: ${yaml(ticket.legacy_state)}`,
    '---',
    '',
    `# ${ticket.id} · ${ticket.title}`,
    '',
    '## Scope and acceptance',
    '',
    ticket.description,
    '',
  ].join('\n');
}

function referenceFile(markdown) {
  let previousWasTicketHeader = false;
  const context = markdown.split('\n').filter((line) => {
    const isTicket = /^\|\s*(?:SIGN|ARCH|FONT)-\d+\s*\|/.test(line);
    const isTicketHeader = /^\|\s*ID\s*\|.*(?:Task, owner|Task, and dependency)/.test(line);
    const isTicketDivider = previousWasTicketHeader && /^\|\s*-+\s*\|/.test(line);
    previousWasTicketHeader = isTicketHeader;
    return !isTicket && !isTicketHeader && !isTicketDivider;
  }).join('\n').trim();
  const adjustedLinks = context.replaceAll('](./', '](../../');
  return ['# Migrated TODO context', '', '> This is non-actionable supporting context migrated from the former monolithic `TODO.md`. Canonical task state and acceptance criteria live only in `backlog/tasks/`.', '', adjustedLinks, ''].join('\n');
}

try {
  await access(taskDirectory, constants.F_OK);
  throw new Error('backlog/tasks already exists; refusing to overwrite canonical task files.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const originalTodo = await readFile(todoPath, 'utf8');
const tickets = parseTickets(originalTodo);
if (tickets.length !== 36) throw new Error(`Expected 36 tracked tickets, found ${tickets.length}.`);

await mkdir(taskDirectory, { recursive: true });
await mkdir(dirname(referencePath), { recursive: true });
await Promise.all(tickets.map((ticket) => writeFile(resolve(taskDirectory, `${ticket.id}.md`), taskFile(ticket))));
await writeFile(referencePath, referenceFile(originalTodo));
console.log(`Migrated ${tickets.length} canonical task files into ${taskDirectory}`);
