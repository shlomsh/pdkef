import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectDirectory = resolve(new URL('..', import.meta.url).pathname);
export const taskDirectory = resolve(projectDirectory, 'backlog/tasks');

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === '[]') return [];
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1).split(',').map((item) => item.trim()).filter(Boolean);
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
  return { ...metadata, body: match[2].trim() };
}

export async function readTasks() {
  const names = (await readdir(taskDirectory)).filter((name) => name.endsWith('.md')).sort();
  const tasks = await Promise.all(names.map(async (name) => parseTask(await readFile(resolve(taskDirectory, name), 'utf8'), name)));
  return tasks.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}
