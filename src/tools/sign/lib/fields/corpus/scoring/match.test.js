import { describe, expect, it } from 'vitest';
import { FIELD_KINDS } from '../../fieldTypes.ts';
import { KIND_GROUPS } from './match.js';

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
