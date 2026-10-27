import { describe, expect, it } from 'vitest';
import { initialMergeState, mergeReducer, type MergeAction, type MergeState } from './mergeState.ts';

const fresh = () => initialMergeState({ draftHint: false, addPageNumbers: false });
const run = (state: MergeState, ...actions: MergeAction[]) => actions.reduce(mergeReducer, state);

describe('initialMergeState', () => {
  it('holds the empty state back only while a draft is probably there', () => {
    expect(initialMergeState({ draftHint: true, addPageNumbers: false }).status).toBe('checking-draft');
    expect(fresh().status).toBe('ready');
  });

  it('carries the remembered page-numbers choice', () => {
    expect(initialMergeState({ draftHint: false, addPageNumbers: true }).addPageNumbers).toBe(true);
  });
});

describe('draft check', () => {
  it('follows what the draft hook reports', () => {
    const checking = initialMergeState({ draftHint: true, addPageNumbers: false });
    const settled = run(checking, { type: 'DRAFT_CHECK_SETTLED', isRestoring: false, draftSaveState: 'saved' });
    expect(settled).toMatchObject({ status: 'ready', draftSaveState: 'saved' });
  });

  it('releases the hold when the draft module fails to load', () => {
    const checking = initialMergeState({ draftHint: true, addPageNumbers: false });
    expect(run(checking, { type: 'DRAFT_MODULE_FAILED' }).status).toBe('ready');
  });
});

describe('restore', () => {
  it('moves every restore-related field in one action', () => {
    const next = run(fresh(), { type: 'DRAFT_RESTORED', addPageNumbers: true, outputName: 'mine' });
    expect(next).toMatchObject({
      addPageNumbers: true,
      customOutputName: 'mine',
      restoreHydrationComplete: false,
      isRestoredWorkspace: true,
      showPickedUpSentence: true,
    });
  });

  it('finishes hydration and lets the sentence expire independently', () => {
    const next = run(
      fresh(),
      { type: 'DRAFT_RESTORED', addPageNumbers: false, outputName: null },
      { type: 'PICKED_UP_EXPIRED' },
      { type: 'RESTORE_HYDRATED' },
    );
    expect(next).toMatchObject({ restoreHydrationComplete: true, showPickedUpSentence: false, isRestoredWorkspace: true });
  });
});

describe('clearing', () => {
  it('forgets everything that belongs to the current set but keeps the options', () => {
    const dirty = run(
      fresh(),
      { type: 'PAGE_NUMBERS_CHANGED', value: true },
      { type: 'FILES_OFFERED', rejected: ['a.txt'], duplicates: [new File(['x'], 'a.pdf')] },
      { type: 'RENDERED_COUNT_CHANGED', count: 3 },
      { type: 'OUTPUT_RENAMED', name: 'mine' },
      { type: 'RENAMING_CHANGED', renaming: true },
      { type: 'SHORTCUTS_HINT_SHOWN' },
      { type: 'DRAFT_RESTORED', addPageNumbers: true, outputName: 'mine' },
    );
    const cleared = run(dirty, { type: 'WORKSPACE_CLEARED' });
    expect(cleared).toMatchObject({
      rejectedFiles: [],
      duplicates: [],
      renderedCount: 0,
      customOutputName: null,
      isRenamingOutputName: false,
      showShortcutsHint: false,
      showPickedUpSentence: false,
      isRestoredWorkspace: false,
      addPageNumbers: true,
    });
  });

  it('a hand-off marks hydration complete and takes the remembered option', () => {
    const next = run(
      fresh(),
      { type: 'DRAFT_RESTORED', addPageNumbers: true, outputName: null },
      { type: 'HANDOFF_ARRIVED', addPageNumbers: false },
    );
    expect(next).toMatchObject({ restoreHydrationComplete: true, addPageNumbers: false });
  });
});

describe('file offers', () => {
  it('replaces the notices each time, so a clean offer clears them', () => {
    const noisy = run(fresh(), { type: 'FILES_OFFERED', rejected: ['a.txt'], duplicates: [] });
    expect(noisy.rejectedFiles).toEqual(['a.txt']);
    expect(run(noisy, { type: 'FILES_OFFERED', rejected: [], duplicates: [] }).rejectedFiles).toEqual([]);
  });
});

describe('install line and lock probe', () => {
  it('tracks the platform, the prompt and the one-time line', () => {
    const prompt = Object.assign(new Event('beforeinstallprompt'), { prompt: () => Promise.resolve() });
    const offered = run(fresh(), { type: 'PLATFORM_DETECTED', onIos: true }, { type: 'INSTALL_PROMPT_OFFERED', prompt }, { type: 'INSTALL_LINE_SHOWN' });
    expect(offered).toMatchObject({ onIos: true, installPrompt: prompt, showInstallLine: true });
    expect(run(offered, { type: 'INSTALL_PROMPT_USED' }).installPrompt).toBeNull();
  });

  it('stores the probe answer for the file it was asked about', () => {
    const file = new File(['x'], 'a.pdf');
    const probe = { file, kind: null, bytes: null };
    expect(run(fresh(), { type: 'LOCK_PROBED', probe }).lockedProbe).toBe(probe);
  });
});

describe('an action that changes nothing', () => {
  // The separate useState setters this reducer replaced skipped the render on an unchanged value.
  it('returns the same state, so the island does not re-render', () => {
    const state = mergeReducer(fresh(), { type: 'RENDERED_COUNT_CHANGED', count: 4 });
    expect(mergeReducer(state, { type: 'RENDERED_COUNT_CHANGED', count: 4 })).toBe(state);
  });
});
