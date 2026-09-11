// Guards for the backlog validator (ARCH-12). Fixtures are inline and
// deliberately malformed, so these tests do not move when tickets are added;
// the one assertion against the real backlog/tasks/ is the same check CI runs.
import { describe, expect, it } from 'vitest';
import { parseTask, validateTasks, readTasks } from '../../scripts/backlog-data.mjs';
import { epics, isEpicActive } from '../../scripts/backlog-epics.mjs';

const registry = [{ key: 'alpha', label: 'Alpha', heading: 'Alpha' }, { key: 'beta', label: 'Beta', heading: 'Beta' }];

function task(id, overrides = {}, file = `${id}.md`) {
  const front = {
    id, title: `Task ${id}`, status: 'open', priority: 'P2', epic: 'alpha', phase: 'near-term', depends_on: [], ...overrides,
  };
  const lines = Object.entries(front).map(([key, value]) => `${key}: ${Array.isArray(value) ? `[${value.map((v) => `"${v}"`).join(', ')}]` : `"${value}"`}`);
  return parseTask(`---\n${lines.join('\n')}\n---\n\n# ${id}\n\n## Scope and acceptance\n\nBody.\n`, file);
}

describe('validateTasks', () => {
  it('accepts a well-formed set with cross-epic dependencies', () => {
    const tasks = [task('A-01'), task('B-01', { epic: 'beta', depends_on: ['A-01'] })];
    expect(validateTasks(tasks, registry)).toEqual([]);
  });

  it('names the file when the filename and id disagree', () => {
    const errors = validateTasks([task('A-01', {}, 'A-02.md')], registry);
    expect(errors).toEqual([expect.stringMatching(/^A-02\.md: filename does not match id "A-01"/)]);
  });

  it('rejects an id that is not PREFIX-NN', () => {
    expect(validateTasks([task('a1', {}, 'a1.md')], registry)).toEqual([expect.stringContaining('id "a1" must look like PREFIX-NN')]);
  });

  it('rejects duplicate ids and says where the other copy is', () => {
    const errors = validateTasks([task('A-01'), task('A-01', {}, 'dup.md')], registry);
    expect(errors).toContainEqual(expect.stringMatching(/dup\.md: duplicate id "A-01" \(also in A-01\.md\)/));
  });

  it('rejects unsupported status, priority, epic and phase values by name', () => {
    const errors = validateTasks([task('A-01', { status: 'wip', priority: 'P0', epic: 'gamma', phase: 'someday' })], registry);
    expect(errors).toEqual([
      expect.stringContaining('unsupported status "wip"'),
      expect.stringContaining('unsupported priority "P0"'),
      expect.stringContaining('epic "gamma" is not registered'),
      expect.stringContaining('unsupported phase "someday"'),
    ]);
  });

  it('allows a task with no phase at all', () => {
    const noPhase = task('A-01');
    delete noPhase.phase;
    expect(validateTasks([noPhase], registry)).toEqual([]);
  });

  it('rejects a dependency on a task that does not exist', () => {
    expect(validateTasks([task('A-01', { depends_on: ['Z-99'] })], registry)).toEqual([expect.stringContaining('A-01.md: depends on "Z-99", which does not exist')]);
  });

  it('rejects a self-dependency', () => {
    expect(validateTasks([task('A-01', { depends_on: ['A-01'] })], registry)).toEqual([expect.stringContaining('A-01.md: depends on itself')]);
  });

  it('rejects a dependency cycle and prints the loop', () => {
    const tasks = [task('A-01', { depends_on: ['A-02'] }), task('A-02', { depends_on: ['A-03'] }), task('A-03', { depends_on: ['A-01'] })];
    expect(validateTasks(tasks, registry)).toEqual(['Dependency cycle: A-01 -> A-02 -> A-03 -> A-01.']);
  });

  it('rejects a depends_on that is not a list', () => {
    const bad = task('A-01');
    bad.depends_on = 'A-02';
    expect(validateTasks([bad], registry)).toEqual([expect.stringContaining('depends_on must be a list')]);
  });
});

describe('parseTask', () => {
  it('requires front matter and the five required fields', () => {
    expect(() => parseTask('# no front matter', 'x.md')).toThrow('x.md must start with YAML front matter.');
    expect(() => parseTask('---\nid: "A-01"\ntitle: "t"\n---\nbody', 'x.md')).toThrow('x.md is missing required status.');
  });

  it('reads quoted list items without their quotes', () => {
    expect(task('A-01', { depends_on: ['B-01', 'B-02'] }).depends_on).toEqual(['B-01', 'B-02']);
  });
});

describe('isEpicActive', () => {
  it('is false once every task is done or retired, and true while one can still move', () => {
    const history = [task('A-01', { status: 'done' }), task('A-02', { status: 'retired' })];
    expect(isEpicActive('alpha', history)).toBe(false);
    expect(isEpicActive('alpha', [...history, task('A-03', { status: 'blocked' })])).toBe(true);
  });
});

describe('the committed backlog', () => {
  it('validates against the shared epic registry', async () => {
    expect(validateTasks(await readTasks(), epics)).toEqual([]);
  });
});
