import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { epics, lanes, statuses, priorities, HORIZONS, LIVE_STATUSES } from './backlog-epics.mjs';

// fileURLToPath rather than `new URL(...).pathname`: the pathname form leaves a
// checkout under a directory with a space as `%20`, and readdir then fails on a
// path that does not exist (ARCH-12). And from import.meta.url directly rather
// than via `new URL('..', import.meta.url)`: under Vitest's jsdom environment
// the global URL resolves that against http://localhost:3000/, not the file.
const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const taskDirectory = resolve(projectDirectory, 'backlog/tasks');

const ID_PATTERN = /^[A-Z]+-\d{2,}$/;
// phase and legacy_state are listed so they get their own migration message below.
const KNOWN_FIELDS = new Set(['id', 'title', 'status', 'priority', 'epic', 'horizon', 'order', 'depends_on', 'waiting_on', 'needs', 'phase', 'legacy_state']);
const INTERNAL_FIELDS = new Set(['file', 'body']);

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === '[]') return [];
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1).split(',').map((item) => item.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '')).filter(Boolean);
  }
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\(["\\])/g, '$1');
  }
  return trimmed.replace(/^'|'$/g, '');
}

export function parseTask(markdown, path = 'task') {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`${path} must start with YAML front matter.`);
  const metadata = {};
  for (const line of match[1].split('\n').filter(Boolean)) {
    const separator = line.indexOf(':');
    if (separator < 1) throw new Error(`${path} has invalid front matter: ${line}`);
    const key = line.slice(0, separator).trim();
    if (Object.hasOwn(metadata, key)) throw new Error(`${path} sets "${key}" twice.`);
    metadata[key] = parseScalar(line.slice(separator + 1));
  }
  for (const field of ['id', 'title', 'status', 'priority', 'epic']) {
    if (!metadata[field]) throw new Error(`${path} is missing required ${field}.`);
  }
  return { ...metadata, file: path, body: match[2].trim() };
}

export async function readTasks() {
  const names = (await readdir(taskDirectory)).filter((name) => name.endsWith('.md')).sort();
  const tasks = await Promise.all(names.map(async (name) => parseTask(await readFile(resolve(taskDirectory, name), 'utf8'), name)));
  return tasks.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

// Structural checks only: shape, enums, references. Which statuses may depend
// on which is a workflow rule the team has not agreed, so it is not encoded
// (ARCH-12's note). Returns messages, each naming the task at fault.
export function validateTasks(tasks, registry = epics) {
  const errors = [];
  const statusKeys = new Set(statuses.map(([status]) => status));
  const byId = new Map();

  for (const task of tasks) {
    const where = task.file || task.id;
    if (!ID_PATTERN.test(task.id)) errors.push(`${where}: id "${task.id}" must look like PREFIX-NN.`);
    if (task.file && task.file !== `${task.id}.md`) errors.push(`${where}: filename does not match id "${task.id}" (expected ${task.id}.md).`);
    if (byId.has(task.id)) errors.push(`${where}: duplicate id "${task.id}" (also in ${byId.get(task.id).file || 'another task'}).`);
    else byId.set(task.id, task);
    if (!statusKeys.has(task.status)) errors.push(`${where}: unsupported status "${task.status}" (one of ${[...statusKeys].join(', ')}).`);
    if (!priorities.includes(task.priority)) errors.push(`${where}: unsupported priority "${task.priority}" (one of ${priorities.join(', ')}).`);
    const registered = registry.find((epic) => epic.key === task.epic);
    if (!registered) errors.push(`${where}: epic "${task.epic}" is not registered in scripts/backlog-epics.mjs.`);
    else if (registered.closed && LIVE_STATUSES.has(task.status)) errors.push(`${where}: ${task.status} tickets cannot sit in the closed epic "${task.epic}"; move it to one of the six lanes (${lanes.map((lane) => lane.key).join(', ')}).`);
    for (const key of Object.keys(task)) {
      if (!KNOWN_FIELDS.has(key) && !INTERNAL_FIELDS.has(key)) errors.push(`${where}: unknown field "${key}" (fields: ${[...KNOWN_FIELDS].slice(0, 10).join(', ')}).`);
    }
    if (task.phase !== undefined) errors.push(`${where}: "phase" was removed; it became "horizon" (now | next | later).`);
    if (task.legacy_state !== undefined) errors.push(`${where}: "legacy_state" was removed; delete the line.`);
    const needsHorizon = task.status === 'open' || task.status === 'in_progress';
    if (task.horizon === undefined) {
      if (needsHorizon) errors.push(`${where}: ${task.status} ticket needs a horizon (one of ${HORIZONS.join(', ')}).`);
    } else if (!needsHorizon) errors.push(`${where}: horizon is only for open and in_progress tickets, not ${task.status}.`);
    else if (!HORIZONS.includes(task.horizon)) errors.push(`${where}: unsupported horizon "${task.horizon}" (one of ${HORIZONS.join(', ')}).`);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(task.waiting_on ?? '')) && !isDate(task.waiting_on)) errors.push(`${where}: waiting_on "${task.waiting_on}" is not a real date.`);
    if (task.status === 'blocked' && !task.waiting_on) errors.push(`${where}: blocked ticket needs waiting_on (an ISO date or short text).`);
    else if (task.status !== 'blocked' && task.waiting_on !== undefined) errors.push(`${where}: waiting_on is only for blocked tickets, not ${task.status}.`);
    if (task.order !== undefined && !/^[1-9]\d*$/.test(String(task.order))) errors.push(`${where}: order "${task.order}" must be a positive integer.`);
    if (task.needs !== undefined && (typeof task.needs !== 'string' || !task.needs.trim())) errors.push(`${where}: needs must be a non-empty string.`);
    if (task.depends_on !== undefined && !Array.isArray(task.depends_on)) errors.push(`${where}: depends_on must be a list.`);
  }

  for (const task of tasks) {
    const where = task.file || task.id;
    for (const dependency of Array.isArray(task.depends_on) ? task.depends_on : []) {
      if (dependency === task.id) errors.push(`${where}: depends on itself.`);
      else if (!byId.has(dependency)) errors.push(`${where}: depends on "${dependency}", which does not exist.`);
    }
  }

  // Cycle detection over resolved edges only; missing targets are reported above.
  const state = new Map();
  const visit = (id, path) => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'active') {
      const cycle = path.slice(path.indexOf(id)).concat(id);
      errors.push(`Dependency cycle: ${cycle.join(' -> ')}.`);
      return;
    }
    state.set(id, 'active');
    const task = byId.get(id);
    for (const dependency of Array.isArray(task?.depends_on) ? task.depends_on : []) {
      if (dependency !== id && byId.has(dependency)) visit(dependency, path.concat(id));
    }
    state.set(id, 'done');
  };
  for (const id of byId.keys()) visit(id, []);

  return [...new Set(errors)];
}

// Board columns, shared by BACKLOG.md, TODO.md and the local board so the three
// views cannot disagree. Returns null for done and retired tickets.
export const COLUMNS = [
  ['next', 'Up next'],
  ['then', 'Then, in order'],
  ['waiting', 'Waiting'],
  ['parked', 'Parked'],
];

export function columnOf(task) {
  if (task.status === 'in_progress') return 'next';
  if (task.status === 'blocked') return 'waiting';
  if (task.status !== 'open') return null;
  return { now: 'next', next: 'then', later: 'parked' }[task.horizon] ?? null;
}

// order ascending (missing last), then priority, then id.
export function compareTasks(a, b) {
  const orderOf = (task) => (task.order === undefined ? Infinity : Number(task.order));
  return (orderOf(a) - orderOf(b)) || a.priority.localeCompare(b.priority) || a.id.localeCompare(b.id, undefined, { numeric: true });
}

// A real calendar date in ISO form: 2026-02-30 and 2026-13-01 are not.
export function isDate(value) {
  const text = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
}
