import { describe, expect, it } from 'vitest';
import { FIELD_KINDS } from '../../fieldTypes.ts';
import { KIND_GROUPS, greedyMatch } from './match.js';

/**
 * FORM-23: `KIND_GROUPS` used to be one of three independent kind lists
 * (beside `formCells.js`'s output kinds and `candidates.js`'s `KINDS`), with
 * nothing to notice a kind added to `fieldTypes.ts`'s `FIELD_KINDS` and
 * forgotten here. Deriving `KIND_GROUPS` mechanically from `FIELD_KINDS`
 * would change matching behaviour - `signature` and `select` must stay
 * self-match-only, and `unknown` is handled by `kindsCompatible`'s own
 * special case, not by a group - so this checks coverage instead of
 * generating the groups.
 */
describe('KIND_GROUPS accounts for every kind in FIELD_KINDS', () => {
  it('groups or deliberately excludes every kind, with nothing left unaccounted for', () => {
    const grouped = new Set(KIND_GROUPS.flatMap((group) => [...group]));
    // Kinds that intentionally sit in no group: `kindsCompatible` already
    // matches these to themselves (`a === b`) and, for `unknown`, to
    // anything (its own special case) - a group would be redundant for the
    // first two and wrong for the third.
    const selfOnly = new Set(['signature', 'select', 'unknown']);
    const accounted = [...new Set([...grouped, ...selfOnly])].sort();
    expect(accounted).toEqual([...FIELD_KINDS].sort());
  });
});

describe('greedyMatch claims pairs from the best IoU down, one-to-one', () => {
  const box = (id, x, y = 0, width = 10, height = 10) => ({
    id,
    pageIndex: 0,
    kind: 'text',
    bounds: { x, y, width, height },
  });
  const ids = (m) => m.matches.map((p) => `${p.t.id}-${p.c.id}`);

  // T1 overlaps C1 exactly (IoU 1) and C2 partly (about 0.54); T2 overlaps C1
  // only a little (1/3) and C2 not enough to count. Best first gives T1-C1;
  // starting from the worst pair would hand C1 to T2 and leave T1 with C2.
  const targets = [box('T1', 0), box('T2', -5)];
  const candidates = [box('C1', 0), box('C2', 3)];

  it('takes the highest-scoring pair first, not the lowest', () => {
    const r = greedyMatch(targets, candidates, 0.3);
    expect(ids(r)).toEqual(['T1-C1']);
    expect(r.misses.map((t) => t.id)).toEqual(['T2']);
    expect(r.falsePositives.map((c) => c.id)).toEqual(['C2']);
  });

  it('matches a target once even when a second candidate also overlaps it', () => {
    const r = greedyMatch([box('T1', 0)], candidates, 0.3);
    expect(ids(r)).toEqual(['T1-C1']);
    expect(r.falsePositives.map((c) => c.id)).toEqual(['C2']);
  });

  it('counts a pair exactly at the IoU threshold as a match', () => {
    // 10x10 inside 10x20: inter 100, union 200, IoU exactly 0.5.
    const r = greedyMatch([box('T1', 0)], [box('C1', 0, 0, 10, 20)], 0.5);
    expect(ids(r)).toEqual(['T1-C1']);
  });
});
