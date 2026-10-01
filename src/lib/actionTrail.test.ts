import { beforeEach, describe, expect, it } from 'vitest';
import { recentActions, recordAction, resetActionTrailForTests } from './actionTrail.ts';
import { ACTIONS, MAX_ACTIONS, type ActionName } from './errorReportSchema.ts';

describe('action trail', () => {
  beforeEach(resetActionTrailForTests);

  it('records in order, oldest first', () => {
    recordAction('add_files');
    recordAction('rotate');
    recordAction('export');
    expect(recentActions()).toEqual(['add_files', 'rotate', 'export']);
  });
  it('drops an immediate repeat but keeps a non-adjacent one', () => {
    recordAction('add_files');
    recordAction('add_files');
    expect(recentActions()).toEqual(['add_files']);
    recordAction('clear_all');
    recordAction('add_files');
    expect(recentActions()).toEqual(['add_files', 'clear_all', 'add_files']);
  });
  it('keeps only the last MAX_ACTIONS', () => {
    const twelve = ACTIONS.slice(0, MAX_ACTIONS + 2);
    for (const name of twelve) recordAction(name);
    expect(recentActions()).toEqual(twelve.slice(2));
    expect(recentActions()).toHaveLength(MAX_ACTIONS);
  });
  it('returns a copy', () => {
    recordAction('undo');
    (recentActions() as ActionName[]).push('redo');
    expect(recentActions()).toEqual(['undo']);
  });
  it('reset empties it', () => {
    recordAction('undo');
    resetActionTrailForTests();
    expect(recentActions()).toEqual([]);
  });
  it('accepts every name on the list', () => {
    for (const name of ACTIONS) {
      resetActionTrailForTests();
      recordAction(name);
      expect(recentActions()).toEqual([name]);
    }
  });
});
