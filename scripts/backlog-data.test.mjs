// Guards for the backlog validator (ARCH-12). Fixtures are inline and
// deliberately malformed, so these tests do not move when tickets are added;
// the one assertion against the real backlog/tasks/ is the same check CI runs.
import { describe, expect, it } from 'vitest';
import { parseTask, validateTasks, readTasks, columnOf, compareTasks } from './backlog-data.mjs';
import { epics, lanes, closedEpics, HORIZONS } from './backlog-epics.mjs';

const registry = [{ key: 'alpha', label: 'Alpha' }, { key: 'beta', label: 'Beta' }, { key: 'old', label: 'Old', closed: true }];

function task(id, overrides = {}, file = `${id}.md`) {
  const front = {
    id, title: `Task ${id}`, status: 'open', priority: 'P2', epic: 'alpha', horizon: 'next', depends_on: [], ...overrides,
  };
  const lines = Object.entries(front).filter(([, value]) => value !== undefined).map(([key, value]) => `${key}: ${Array.isArray(value) ? `[${value.map((v) => `"${v}"`).join(', ')}]` : `"${value}"`}`);
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

  it('rejects unsupported status, priority, epic and horizon values by name', () => {
    const errors = validateTasks([task('A-01', { status: 'wip', priority: 'P0', epic: 'gamma', horizon: 'someday' })], registry);
    expect(errors).toEqual([
      expect.stringContaining('unsupported status "wip"'),
      expect.stringContaining('unsupported priority "P0"'),
      expect.stringContaining('epic "gamma" is not registered'),
      expect.stringContaining('horizon is only for open and in_progress tickets, not wip'),
    ]);
    expect(validateTasks([task('A-01', { horizon: 'someday' })], registry)).toEqual([expect.stringContaining('unsupported horizon "someday" (one of now, next, later)')]);
  });

  it('requires a horizon on open and in_progress tickets', () => {
    expect(validateTasks([task('A-01', { horizon: undefined })], registry)).toEqual([expect.stringContaining('A-01.md: open ticket needs a horizon')]);
    expect(validateTasks([task('A-01', { status: 'in_progress', horizon: undefined })], registry)).toEqual([expect.stringContaining('in_progress ticket needs a horizon')]);
  });

  it('forbids a horizon on blocked, done and retired tickets', () => {
    for (const status of ['blocked', 'done', 'retired']) {
      const extra = status === 'blocked' ? { waiting_on: '2026-10-08' } : {};
      const epic = status === 'blocked' ? 'alpha' : 'old';
      expect(validateTasks([task('A-01', { status, epic, horizon: 'now', ...extra })], registry)).toEqual([expect.stringContaining(`horizon is only for open and in_progress tickets, not ${status}`)]);
    }
  });

  it('requires waiting_on on blocked tickets and forbids it elsewhere', () => {
    expect(validateTasks([task('A-01', { status: 'blocked', horizon: undefined })], registry)).toEqual([expect.stringContaining('blocked ticket needs waiting_on')]);
    expect(validateTasks([task('A-01', { status: 'blocked', horizon: undefined, waiting_on: 'Shlomi' })], registry)).toEqual([]);
    expect(validateTasks([task('A-01', { waiting_on: '2026-10-08' })], registry)).toEqual([expect.stringContaining('waiting_on is only for blocked tickets, not open')]);
    expect(validateTasks([task('A-01', { status: 'done', epic: 'old', horizon: undefined, waiting_on: 'x' })], registry)).toEqual([expect.stringContaining('waiting_on is only for blocked tickets, not done')]);
  });

  it('rejects a waiting_on that looks like a date but is not one', () => {
    const blocked = (waiting_on) => task('A-01', { status: 'blocked', horizon: undefined, waiting_on });
    expect(validateTasks([blocked('2026-13-45')], registry)).toEqual([expect.stringContaining('"2026-13-45" is not a real date')]);
    expect(validateTasks([blocked('2026-02-30')], registry)).toEqual([expect.stringContaining('"2026-02-30" is not a real date')]);
    expect(validateTasks([blocked('2028-02-29')], registry)).toEqual([]);
  });

  it('rejects an unknown field, so a typo in an optional key is not silently ignored', () => {
    expect(validateTasks([task('A-01', { ordre: '1' })], registry)).toEqual([expect.stringContaining('unknown field "ordre"')]);
  });

  it('accepts only a positive integer order', () => {
    expect(validateTasks([task('A-01', { order: 3 })], registry)).toEqual([]);
    for (const order of ['0', '-1', '1.5', 'first']) {
      expect(validateTasks([task('A-01', { order })], registry)).toEqual([expect.stringContaining(`order "${order}" must be a positive integer`)]);
    }
  });

  it('requires needs to be a non-empty string when present', () => {
    expect(validateTasks([task('A-01', { needs: 'A check on your iPhone' })], registry)).toEqual([]);
    expect(validateTasks([task('A-01', { needs: '' })], registry)).toEqual([expect.stringContaining('needs must be a non-empty string')]);
  });

  it('rejects phase and legacy_state and says what replaced them', () => {
    expect(validateTasks([task('A-01', { phase: 'near-term' })], registry)).toEqual([expect.stringContaining('"phase" was removed; it became "horizon" (now | next | later)')]);
    expect(validateTasks([task('A-01', { legacy_state: 'Open' })], registry)).toEqual([expect.stringContaining('"legacy_state" was removed')]);
  });

  it('rejects a live ticket in a closed epic and names the lanes, but lets history stay', () => {
    for (const status of ['open', 'in_progress', 'blocked']) {
      const extra = status === 'blocked' ? { horizon: undefined, waiting_on: 'x' } : {};
      const errors = validateTasks([task('A-01', { status, epic: 'old', ...extra })], registry);
      expect(errors).toEqual([expect.stringContaining(`${status} tickets cannot sit in the closed epic "old"; move it to one of the six lanes (`)]);
    }
    expect(validateTasks([task('A-01', { status: 'done', epic: 'old', horizon: undefined })], registry)).toEqual([]);
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

  it('rejects a key set twice instead of keeping the last one', () => {
    expect(() => parseTask('---\nid: "A-01"\nid: "A-02"\n---\nbody', 'x.md')).toThrow('x.md sets "id" twice.');
  });

  it('unescapes quotes inside a double-quoted value', () => {
    expect(task('A-01', { title: 'The \\"Scanned\\" footer' }).title).toBe('The "Scanned" footer');
  });

  it('reads quoted list items without their quotes', () => {
    expect(task('A-01', { depends_on: ['B-01', 'B-02'] }).depends_on).toEqual(['B-01', 'B-02']);
  });
});

describe('the registry', () => {
  it('has the six lanes in order, every legacy epic closed, and no key twice', () => {
    expect(lanes.map((lane) => lane.key)).toEqual(['redact', 'sign-fill-mode', 'form-detection', 'robustness', 'search-and-languages', 'polish']);
    expect(lanes.every((lane) => lane.why)).toBe(true);
    expect(closedEpics.length).toBeGreaterThan(0);
    expect(closedEpics.every((epic) => epic.closed)).toBe(true);
    expect(new Set(epics.map((epic) => epic.key)).size).toBe(epics.length);
    expect(HORIZONS).toEqual(['now', 'next', 'later']);
  });
});

describe('board columns', () => {
  it('puts in-progress and now in Up next, next in Then, blocked in Waiting, later in Parked', () => {
    expect(columnOf(task('A-01', { horizon: 'now' }))).toBe('next');
    expect(columnOf(task('A-01', { status: 'in_progress', horizon: 'later' }))).toBe('next');
    expect(columnOf(task('A-01', { horizon: 'next' }))).toBe('then');
    expect(columnOf(task('A-01', { status: 'blocked', horizon: undefined, waiting_on: 'x' }))).toBe('waiting');
    expect(columnOf(task('A-01', { horizon: 'later' }))).toBe('parked');
    expect(columnOf(task('A-01', { status: 'done', horizon: undefined }))).toBe(null);
  });

  it('sorts by order (missing last), then priority, then id', () => {
    const sorted = [task('A-03', { priority: 'P3' }), task('A-02', { priority: 'P1' }), task('A-10', { order: 2 }), task('A-09', { order: 1 }), task('A-01', { priority: 'P1' })].sort(compareTasks);
    expect(sorted.map((t) => t.id)).toEqual(['A-09', 'A-10', 'A-01', 'A-02', 'A-03']);
  });
});

describe('the committed backlog', () => {
  it('validates against the shared epic registry', async () => {
    expect(validateTasks(await readTasks(), epics)).toEqual([]);
  });
});
