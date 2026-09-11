import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { epics, statuses, priorities, phases } from './backlog-epics.mjs';

// fileURLToPath rather than `new URL(...).pathname`: the pathname form leaves a
// checkout under a directory with a space as `%20`, and readdir then fails on a
// path that does not exist (ARCH-12). And from import.meta.url directly rather
// than via `new URL('..', import.meta.url)`: under Vitest's jsdom environment
// the global URL resolves that against http://localhost:3000/, not the file.
const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const taskDirectory = resolve(projectDirectory, 'backlog/tasks');

const ID_PATTERN = /^[A-Z]+-\d{2,}$/;

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === '[]') return [];
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1).split(',').map((item) => item.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '')).filter(Boolean);
  }
  return trimmed.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
}

export function parseTask(markdown, path = 'task') {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`${path} must start with YAML front matter.`);
  const metadata = Object.fromEntries(match[1].split('\n').filter(Boolean).map((line) => {
    const separator = line.indexOf(':');
    if (separator < 1) throw new Error(`${path} has invalid front matter: ${line}`);
    return [line.slice(0, separator).trim(), parseScalar(line.slice(separator + 1))];
  }));
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
  const epicKeys = new Set(registry.map((epic) => epic.key));
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
    if (!epicKeys.has(task.epic)) errors.push(`${where}: epic "${task.epic}" is not registered in scripts/backlog-epics.mjs.`);
    if (task.phase !== undefined && !phases.includes(task.phase)) errors.push(`${where}: unsupported phase "${task.phase}" (one of ${phases.join(', ')}).`);
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
