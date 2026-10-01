import { describe, expect, it } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  brushKindOf,
  canRedo,
  finishPhaseOf,
  initialRedactState,
  isDirty,
  isFullscreenActive,
  redactReducer,
  restoredNoteVisible,
  type EditCommit,
  type RedactAction,
  type RedactState,
} from './redactState.ts';
import { captureAddedElement, captureElementSnapshots, createActionEntry } from '../../../editor/model/actionHistory.ts';
import { createUpdateEntry } from '../../../editor/model/updateKind.ts';
import type { RedactElement } from '../redactElements.ts';
import type { CheckTerm } from '../check/types.ts';

const INIT = { activeColor: '#ffffff', activeBlurStrength: 0.3, brush: { mode: 'box', size: 12 } } as const;
const fresh = (): RedactState => initialRedactState(INIT);
const run = (state: RedactState, ...actions: RedactAction[]) => actions.reduce(redactReducer, state);

const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
const pdfDocument = { numPages: 3 } as unknown as PDFDocumentProxy;
const blob = new Blob(['y']);

function box(id: string, overrides: Partial<RedactElement> = {}): RedactElement {
  return { id, pageIndex: 0, type: 'blackout', left: 1, top: 2, width: 10, height: 5, ...overrides } as RedactElement;
}

function addCommit(additions: RedactElement[], baseIndex = 0, type = 'ADD_BLACKOUT'): EditCommit<RedactElement> & { type: 'EDIT_COMMITTED' } {
  const entry = createActionEntry<RedactElement>({
    operation: 'add', type, pageIndex: additions[0].pageIndex, description: `Added ${additions.length}`,
    elements: additions.map((el, i) => captureAddedElement(el, baseIndex + i)),
  });
  return { type: 'EDIT_COMMITTED', edit: { kind: 'add', additions }, entry };
}

function load(state = fresh(), over: Partial<Extract<RedactAction, { type: 'FILE_INITIALIZED' }>> = {}): RedactState {
  return redactReducer(state, {
    type: 'FILE_INITIALIZED', file, restored: false, elements: [], past: [], carried: undefined,
    brush: INIT.brush, activeColor: INIT.activeColor, activeBlurStrength: INIT.activeBlurStrength, ...over,
  });
}

describe('initialRedactState', () => {
  it('starts idle and empty, with the preference values it was given', () => {
    const s = initialRedactState({ activeColor: '#123456', activeBlurStrength: 0.6, brush: { mode: 'brush', size: 20 } });
    expect(s.document).toMatchObject({ file: null, status: 'idle', numPages: 0, showWelcomeTip: true, restoredWithWork: false });
    expect(s.edits).toMatchObject({ elements: [], history: { past: [], future: [] }, documentRevision: 0, draftBaselineRevision: 0 });
    expect(s.tool).toMatchObject({ activeStyle: null, toolLocked: false, activeColor: '#123456', activeBlurStrength: 0.6, brush: { mode: 'brush', size: 20 }, drawingState: null });
    expect(s.selection).toEqual({ activeBoxId: null, selectedBoxId: null });
  });
});

describe('loading a file', () => {
  it('FILE_INITIALIZED sets the file and the document-owned settings, and starts clean', () => {
    let s = run(fresh(), { type: 'TOOL_ARMED', tool: 'blur', locked: false }, { type: 'BOX_SELECTED', id: 'b' });
    s = run(s, { type: 'EXPORT_SAVED', saved: { blob, name: 'x' } }, { type: 'EXPORT_CANCELLED', announcement: 'c' });
    s = redactReducer(s, { type: 'FIND_TERM_REMEMBERED', term: { label: 't', source: 'find', finder: (() => []) as never } });
    const el = box('r1');
    s = load(s, {
      restored: true, elements: [el], past: [], carried: { whiteoutColor: '#ff0000' },
      brush: { mode: 'brush', size: 30 }, activeColor: '#ff0000', activeBlurStrength: 0.9,
    });
    expect(s.tool.activeStyle).toBeNull();
    expect(s.selection).toEqual({ activeBoxId: null, selectedBoxId: null });
    expect(s.document).toMatchObject({
      file, pdfDocument: null, numPages: 0, sizedPageCount: 0, errorDetail: null, progress: 0,
      exportCancelled: false, showWelcomeTip: false, restoredWithWork: true,
    });
    expect(s.tool).toMatchObject({ carried: { whiteoutColor: '#ff0000' }, brush: { mode: 'brush', size: 30 }, activeColor: '#ff0000', activeBlurStrength: 0.9 });
    expect(s.edits.elements).toEqual([el]);
    expect(s.edits.history).toEqual({ past: [], future: [] });
    expect(s.finish.findTerms).toEqual([]);
  });

  it('FILE_INITIALIZED for a fresh pick shows the welcome tip and not the restored note', () => {
    const s = load(fresh(), { restored: false, elements: [box('a')] });
    expect(s.document.showWelcomeTip).toBe(true);
    expect(s.document.restoredWithWork).toBe(false);
  });

  it('FILE_INITIALIZED of a restored draft with no boxes is not "restored with work"', () => {
    expect(load(fresh(), { restored: true, elements: [] }).document.restoredWithWork).toBe(false);
  });

  it('FILE_INITIALIZED captures the current revision as the draft baseline and carries the past, with no future', () => {
    let s = run(fresh(), addCommit([box('a')]), addCommit([box('b')], 1));
    expect(s.edits.documentRevision).toBe(2);
    const entry = s.edits.history.past[0];
    s = load(s, { past: [entry] });
    expect(s.edits.draftBaselineRevision).toBe(2);
    expect(s.edits.documentRevision).toBe(2);
    expect(s.edits.history).toEqual({ past: [entry], future: [] });
    expect(isDirty(s)).toBe(false);
  });

  it('FILE_INITIALIZED leaves a locked tool armed (disarmTool never overrode a lock)', () => {
    const s = load(run(fresh(), { type: 'TOOL_ARMED', tool: 'blur', locked: true }));
    expect(s.tool).toMatchObject({ activeStyle: 'blur', toolLocked: true });
  });

  it('FILE_LOAD_STARTED / FILE_LOADED / FILE_LOAD_FAILED move the status', () => {
    expect(redactReducer(fresh(), { type: 'FILE_LOAD_STARTED' }).document.status).toBe('loading');
    expect(redactReducer(fresh(), { type: 'FILE_LOADED' }).document.status).toBe('editing');
    expect(redactReducer(fresh(), { type: 'FILE_LOAD_FAILED' }).document.status).toBe('error');
  });

  it('DOCUMENT_READY sets the pdf.js document and page count, and forgets the last document\'s Find terms', () => {
    const term: CheckTerm = { label: 't', source: 'find', finder: (() => []) as never };
    const s = run(fresh(), { type: 'FIND_TERM_REMEMBERED', term }, { type: 'DOCUMENT_READY', pdfDocument, numPages: 3 });
    expect(s.document).toMatchObject({ pdfDocument, numPages: 3 });
    expect(s.finish.findTerms).toEqual([]);
  });

  it('PAGE_SIZED records how many canvases know their size, and is a no-op when unchanged', () => {
    const s = redactReducer(fresh(), { type: 'PAGE_SIZED', sizedPageCount: 2 });
    expect(s.document.sizedPageCount).toBe(2);
    expect(redactReducer(s, { type: 'PAGE_SIZED', sizedPageCount: 2 })).toBe(s);
  });
});

describe('EDIT_COMMITTED', () => {
  it('add appends the elements, logs one entry, clears the future and advances the revision', () => {
    const s = run(fresh(), addCommit([box('a')]));
    expect(s.edits.elements.map((e) => e.id)).toEqual(['a']);
    expect(s.edits.history.past).toHaveLength(1);
    expect(s.edits.history.future).toEqual([]);
    expect(s.edits.documentRevision).toBe(1);
    expect(isDirty(s)).toBe(true);
  });

  it('a new command clears an existing redo future', () => {
    let s = run(fresh(), addCommit([box('a')]), { type: 'UNDO' });
    expect(canRedo(s)).toBe(true);
    s = run(s, addCommit([box('b')]));
    expect(canRedo(s)).toBe(false);
  });

  it('remove drops the elements, logs one entry and forgets a removed hover and selection only', () => {
    const a = box('a');
    const b = box('b');
    let s = run(fresh(), addCommit([a, b]), { type: 'BOX_HOVERED', id: 'a' }, { type: 'BOX_SELECTED', id: 'a' }, { type: 'BOX_HOVERED', id: 'b' });
    const entry = createActionEntry<RedactElement>({
      operation: 'delete', type: 'DELETE_ELEMENT', pageIndex: 0, description: 'Removed',
      elements: captureElementSnapshots(s.edits.elements, (el) => el.id === 'a'),
    });
    s = redactReducer(s, { type: 'EDIT_COMMITTED', edit: { kind: 'remove', ids: new Set(['a']) }, entry });
    expect(s.edits.elements.map((e) => e.id)).toEqual(['b']);
    expect(s.selection).toEqual({ activeBoxId: 'b', selectedBoxId: null });
    expect(s.edits.history.past[0]).toBe(entry);
    expect(s.edits.documentRevision).toBe(2);
  });

  it('update merges the changes into the named elements only, and logs the entry', () => {
    const a = box('a');
    const b = box('b');
    let s = run(fresh(), addCommit([a, b]));
    const entry = createUpdateEntry(a, { left: 40 }, () => 'Moved');
    s = redactReducer(s, { type: 'EDIT_COMMITTED', edit: { kind: 'update', changesById: new Map([['a', { left: 40 }]]) }, entry });
    expect(s.edits.elements).toEqual([{ ...a, left: 40 }, b]);
    expect(s.edits.history.past[0]).toBe(entry);
  });

  it('an edit with no entry still advances the revision and logs nothing', () => {
    let s = run(fresh(), addCommit([box('a')]));
    s = redactReducer(s, { type: 'EDIT_COMMITTED', edit: { kind: 'update', changesById: new Map([['a', { left: 9 }]]) }, entry: null });
    expect(s.edits.history.past).toHaveLength(1);
    expect(s.edits.documentRevision).toBe(2);
  });
});

describe('UNDO and REDO', () => {
  it('UNDO reverts the newest command, keeps it redoable, bumps the revision and announces it', () => {
    let s = run(fresh(), addCommit([box('a')]), addCommit([box('b')], 1));
    s = redactReducer(s, { type: 'UNDO' });
    expect(s.edits.elements.map((e) => e.id)).toEqual(['a']);
    expect(s.edits.history.past).toHaveLength(1);
    expect(s.edits.history.future).toHaveLength(1);
    expect(s.edits.documentRevision).toBe(3);
    expect(s.view.announcement).toBe('Undid: Added 1');
  });

  it('UNDO with nothing to undo returns the same state', () => {
    const s = fresh();
    expect(redactReducer(s, { type: 'UNDO' })).toBe(s);
  });

  it('two UNDOs in a row act on each other\'s result (key auto-repeat)', () => {
    const s = run(fresh(), addCommit([box('a')]), addCommit([box('b')], 1), { type: 'UNDO' }, { type: 'UNDO' });
    expect(s.edits.elements).toEqual([]);
    expect(s.edits.history.future).toHaveLength(2);
  });

  it('UNDO clears a hover or selection whose box the revert removed, and keeps the others', () => {
    let s = run(fresh(), addCommit([box('a')]), addCommit([box('b')], 1), { type: 'BOX_HOVERED', id: 'b' });
    s = redactReducer(s, { type: 'BOX_SELECTED', id: 'b' });
    s = redactReducer(s, { type: 'UNDO' });
    expect(s.selection).toEqual({ activeBoxId: null, selectedBoxId: null });
    s = run(fresh(), addCommit([box('a')]), addCommit([box('b')], 1), { type: 'BOX_SELECTED', id: 'a' }, { type: 'UNDO' });
    expect(s.selection).toEqual({ activeBoxId: 'a', selectedBoxId: 'a' });
  });

  it('UNDO by entry id reverts that entry from the middle of the stack and drops the future', () => {
    let s = run(fresh(), addCommit([box('a')]), addCommit([box('b')], 1), addCommit([box('c')], 2));
    const middle = s.edits.history.past[1];
    s = redactReducer(s, { type: 'UNDO', entryId: middle.id });
    expect(s.edits.elements.map((e) => e.id).sort()).toEqual(['a', 'c']);
    expect(s.edits.history.future).toEqual([]);
    expect(s.view.announcement).toBe(`Undid: ${middle.description}`);
  });

  it('UNDO by a stale entry id is a silent no-op', () => {
    const s = run(fresh(), addCommit([box('a')]));
    expect(redactReducer(s, { type: 'UNDO', entryId: 'gone' })).toBe(s);
  });

  it('REDO reapplies the most recently undone command, bumps the revision and announces it', () => {
    let s = run(fresh(), addCommit([box('a')]), { type: 'UNDO' });
    const revision = s.edits.documentRevision;
    s = redactReducer(s, { type: 'REDO' });
    expect(s.edits.elements.map((e) => e.id)).toEqual(['a']);
    expect(s.edits.history.future).toEqual([]);
    expect(s.edits.history.past).toHaveLength(1);
    expect(s.edits.documentRevision).toBe(revision + 1);
    expect(s.view.announcement).toBe('Redid: Added 1');
  });

  it('REDO with nothing undone returns the same state', () => {
    const s = fresh();
    expect(redactReducer(s, { type: 'REDO' })).toBe(s);
  });

  it('REDO of a delete clears a selection on the box it removed again', () => {
    let s = run(fresh(), addCommit([box('a')]));
    const entry = createActionEntry<RedactElement>({
      operation: 'delete', type: 'DELETE_ELEMENT', pageIndex: 0, description: 'Removed',
      elements: captureElementSnapshots(s.edits.elements, () => true),
    });
    s = run(s, { type: 'EDIT_COMMITTED', edit: { kind: 'remove', ids: new Set(['a']) }, entry }, { type: 'UNDO' }, { type: 'BOX_SELECTED', id: 'a' }, { type: 'REDO' });
    expect(s.edits.elements).toEqual([]);
    expect(s.selection).toEqual({ activeBoxId: null, selectedBoxId: null });
  });
});

describe('the undo chip', () => {
  it('UNDO_CHIP_SHOWN sets the chip and announces its message with a full stop, replacing an earlier chip', () => {
    let s = redactReducer(fresh(), { type: 'UNDO_CHIP_SHOWN', message: 'Removed the blur box', entryId: 'e1' });
    expect(s.edits.undoAction).toEqual({ message: 'Removed the blur box', entryId: 'e1', extra: undefined });
    expect(s.view.announcement).toBe('Removed the blur box.');
    const extra = { label: 'Every page', onSelect: () => {} };
    s = redactReducer(s, { type: 'UNDO_CHIP_SHOWN', message: 'Second', entryId: 'e2', extra });
    expect(s.edits.undoAction).toEqual({ message: 'Second', entryId: 'e2', extra });
  });

  it('UNDO_CHIP_DISMISSED clears it, and is a no-op when there is none', () => {
    const shown = redactReducer(fresh(), { type: 'UNDO_CHIP_SHOWN', message: 'm', entryId: 'e' });
    expect(redactReducer(shown, { type: 'UNDO_CHIP_DISMISSED' }).edits.undoAction).toBeNull();
    const s = fresh();
    expect(redactReducer(s, { type: 'UNDO_CHIP_DISMISSED' })).toBe(s);
  });
});

describe('the tool', () => {
  it('TOOL_ARMED arms with the given lock', () => {
    expect(redactReducer(fresh(), { type: 'TOOL_ARMED', tool: 'blur', locked: false }).tool).toMatchObject({ activeStyle: 'blur', toolLocked: false });
    expect(redactReducer(fresh(), { type: 'TOOL_ARMED', tool: 'delete', locked: true }).tool).toMatchObject({ activeStyle: 'delete', toolLocked: true });
  });

  it('TOOL_DISARMED disarms and clears the lock; a no-op when already resting', () => {
    const armed = redactReducer(fresh(), { type: 'TOOL_ARMED', tool: 'blur', locked: true });
    expect(redactReducer(armed, { type: 'TOOL_DISARMED' }).tool).toMatchObject({ activeStyle: null, toolLocked: false });
    const s = fresh();
    expect(redactReducer(s, { type: 'TOOL_DISARMED' })).toBe(s);
  });

  it('PLACEMENT_COMMITTED disarms a one-shot tool and keeps a locked one', () => {
    const once = redactReducer(fresh(), { type: 'TOOL_ARMED', tool: 'blur', locked: false });
    expect(redactReducer(once, { type: 'PLACEMENT_COMMITTED' }).tool.activeStyle).toBeNull();
    const locked = redactReducer(fresh(), { type: 'TOOL_ARMED', tool: 'blur', locked: true });
    expect(redactReducer(locked, { type: 'PLACEMENT_COMMITTED' })).toBe(locked);
  });

  it('COLOR_CHOSEN sets the colour and carries it for the document, keeping other carried keys', () => {
    const s = run(fresh(), { type: 'BLUR_STRENGTH_CHOSEN', strength: 0.6 }, { type: 'COLOR_CHOSEN', color: '#ff0000' });
    expect(s.tool.activeColor).toBe('#ff0000');
    expect(s.tool.carried).toEqual({ blurStrength: 0.6, whiteoutColor: '#ff0000' });
  });

  it('BLUR_STRENGTH_CHOSEN sets the strength and carries it', () => {
    const s = redactReducer(fresh(), { type: 'BLUR_STRENGTH_CHOSEN', strength: 0.9 });
    expect(s.tool.activeBlurStrength).toBe(0.9);
    expect(s.tool.carried).toEqual({ blurStrength: 0.9 });
  });

  it('BRUSH_CHOSEN sets the brush and merges its patch into carried', () => {
    const s = run(fresh(), { type: 'COLOR_CHOSEN', color: '#00ff00' }, { type: 'BRUSH_CHOSEN', brush: { mode: 'brush', size: 24 }, carriedPatch: { brushMode: 'brush', brushSize: 24 } });
    expect(s.tool.brush).toEqual({ mode: 'brush', size: 24 });
    expect(s.tool.carried).toEqual({ whiteoutColor: '#00ff00', brushMode: 'brush', brushSize: 24 });
  });

  it('EYEDROPPER_TOGGLED flips and EYEDROPPER_STOPPED turns it off (no-op when already off)', () => {
    const on = redactReducer(fresh(), { type: 'EYEDROPPER_TOGGLED' });
    expect(on.tool.eyedropping).toBe(true);
    expect(redactReducer(on, { type: 'EYEDROPPER_TOGGLED' }).tool.eyedropping).toBe(false);
    expect(redactReducer(on, { type: 'EYEDROPPER_STOPPED' }).tool.eyedropping).toBe(false);
    const off = fresh();
    expect(redactReducer(off, { type: 'EYEDROPPER_STOPPED' })).toBe(off);
  });

  it('DRAW_STARTED records the drawing and deselects; DRAW_ENDED clears it', () => {
    const drawing = { pageIndex: 1, startX: 10, startY: 20, type: 'blackout', color: '#000000' } as const;
    let s = run(fresh(), { type: 'BOX_SELECTED', id: 'a' }, { type: 'DRAW_STARTED', drawing });
    expect(s.tool.drawingState).toEqual(drawing);
    expect(s.selection).toEqual({ activeBoxId: null, selectedBoxId: null });
    s = redactReducer(s, { type: 'DRAW_ENDED' });
    expect(s.tool.drawingState).toBeNull();
    expect(redactReducer(s, { type: 'DRAW_ENDED' })).toBe(s);
  });
});

describe('selection', () => {
  it('BOX_HOVERED sets only the hover target', () => {
    const s = redactReducer(fresh(), { type: 'BOX_HOVERED', id: 'a' });
    expect(s.selection).toEqual({ activeBoxId: 'a', selectedBoxId: null });
    expect(redactReducer(s, { type: 'BOX_HOVERED', id: 'a' })).toBe(s);
  });

  it('BOX_UNHOVERED clears the hover only when it is that box', () => {
    const s = redactReducer(fresh(), { type: 'BOX_HOVERED', id: 'a' });
    expect(redactReducer(s, { type: 'BOX_UNHOVERED', id: 'b' })).toBe(s);
    expect(redactReducer(s, { type: 'BOX_UNHOVERED', id: 'a' }).selection.activeBoxId).toBeNull();
  });

  it('BOX_SELECTED sets both the hover target and the sticky selection', () => {
    const s = redactReducer(fresh(), { type: 'BOX_SELECTED', id: 'a' });
    expect(s.selection).toEqual({ activeBoxId: 'a', selectedBoxId: 'a' });
    expect(redactReducer(s, { type: 'BOX_SELECTED', id: 'a' })).toBe(s);
  });

  it('SELECTION_CLEARED clears both; a no-op when nothing is selected', () => {
    const s = redactReducer(fresh(), { type: 'BOX_SELECTED', id: 'a' });
    expect(redactReducer(s, { type: 'SELECTION_CLEARED' }).selection).toEqual({ activeBoxId: null, selectedBoxId: null });
    const none = fresh();
    expect(redactReducer(none, { type: 'SELECTION_CLEARED' })).toBe(none);
  });

  it('ESCAPED disarms even a locked tool and clears the selection', () => {
    const s = run(fresh(), { type: 'TOOL_ARMED', tool: 'blur', locked: true }, { type: 'BOX_SELECTED', id: 'a' }, { type: 'ESCAPED' });
    expect(s.tool).toMatchObject({ activeStyle: null, toolLocked: false });
    expect(s.selection).toEqual({ activeBoxId: null, selectedBoxId: null });
  });
});

describe('exporting', () => {
  it('EXPORT_STARTED enters the redacting status with a clean slate and announces', () => {
    let s = redactReducer(fresh(), { type: 'EXPORT_FAILED', detail: 'bad', announcement: 'x' });
    s = run(s, { type: 'EXPORT_CANCELLED', announcement: 'c' }, { type: 'REMOVAL_NOTED', note: 'gone' });
    s = redactReducer(s, { type: 'EXPORT_STARTED', announcement: 'Saving…' });
    expect(s.document).toMatchObject({ status: 'redacting', errorDetail: null, exportCancelled: false, progress: 0 });
    expect(s.finish.removedNote).toBeNull();
    expect(s.view.announcement).toBe('Saving…');
  });

  it('EXPORT_PROGRESS records progress', () => {
    const s = redactReducer(fresh(), { type: 'EXPORT_PROGRESS', progress: 0.5 });
    expect(s.document.progress).toBe(0.5);
    expect(redactReducer(s, { type: 'EXPORT_PROGRESS', progress: 0.5 })).toBe(s);
  });

  it('EXPORT_SAVED keeps the bytes for the hand-off before they are delivered, leaving the status alone', () => {
    const saved = { blob, name: 'redacted_a.pdf' };
    const s = run(fresh(), { type: 'EXPORT_STARTED', announcement: 'x' }, { type: 'EXPORT_SAVED', saved });
    expect(s.finish.exportedForHandoff).toBe(saved);
    expect(s.document.status).toBe('redacting');
  });

  it('EXPORT_DELIVERED returns to editing and announces', () => {
    const s = run(fresh(), { type: 'EXPORT_STARTED', announcement: 'x' }, { type: 'EXPORT_DELIVERED', announcement: 'Saved. Download started.' });
    expect(s.document.status).toBe('editing');
    expect(s.view.announcement).toBe('Saved. Download started.');
  });

  it('EXPORT_FAILED returns to editing with the detail, leaving progress as it was', () => {
    const s = run(fresh(), { type: 'EXPORT_STARTED', announcement: 'x' }, { type: 'EXPORT_PROGRESS', progress: 0.4 }, { type: 'EXPORT_FAILED', detail: 'Could not export', announcement: 'stopped' });
    expect(s.document).toMatchObject({ status: 'editing', errorDetail: 'Could not export', progress: 0.4 });
    expect(s.view.announcement).toBe('stopped');
  });

  it('EXPORT_CANCELLED returns to editing, zeroes progress and flags the cancellation', () => {
    const s = run(fresh(), { type: 'EXPORT_STARTED', announcement: 'x' }, { type: 'EXPORT_PROGRESS', progress: 0.4 }, { type: 'EXPORT_CANCELLED', announcement: 'You changed something' });
    expect(s.document).toMatchObject({ status: 'editing', progress: 0, exportCancelled: true });
    expect(s.view.announcement).toBe('You changed something');
  });

  it('EXPORT_ERROR_CLEARED clears the error; a no-op without one', () => {
    const failed = redactReducer(fresh(), { type: 'EXPORT_FAILED', detail: 'bad', announcement: 'x' });
    expect(redactReducer(failed, { type: 'EXPORT_ERROR_CLEARED' }).document.errorDetail).toBeNull();
    const s = fresh();
    expect(redactReducer(s, { type: 'EXPORT_ERROR_CLEARED' })).toBe(s);
  });

  it('SAVED_EXPORT_DISCARDED forgets the saved bytes; a no-op without any', () => {
    const saved = redactReducer(fresh(), { type: 'EXPORT_SAVED', saved: { blob, name: 'n' } });
    expect(redactReducer(saved, { type: 'SAVED_EXPORT_DISCARDED' }).finish.exportedForHandoff).toBeNull();
    const s = fresh();
    expect(redactReducer(s, { type: 'SAVED_EXPORT_DISCARDED' })).toBe(s);
  });
});

describe('the hand-off, Find terms and Remove it', () => {
  it('HANDOFF_FAILED flags it and HANDOFF_STARTED clears it', () => {
    const failed = redactReducer(fresh(), { type: 'HANDOFF_FAILED' });
    expect(failed.finish.handoffFailed).toBe(true);
    expect(redactReducer(failed, { type: 'HANDOFF_STARTED' }).finish.handoffFailed).toBe(false);
    const s = fresh();
    expect(redactReducer(s, { type: 'HANDOFF_STARTED' })).toBe(s);
  });

  it('FIND_TERM_REMEMBERED appends a term and replaces one with the same label', () => {
    const first: CheckTerm = { label: 'email', source: 'find', finder: (() => []) as never };
    const other: CheckTerm = { label: 'phone', source: 'find', finder: (() => []) as never };
    const again: CheckTerm = { label: 'email', source: 'find', finder: (() => []) as never };
    const s = run(fresh(), { type: 'FIND_TERM_REMEMBERED', term: first }, { type: 'FIND_TERM_REMEMBERED', term: other }, { type: 'FIND_TERM_REMEMBERED', term: again });
    expect(s.finish.findTerms).toEqual([other, again]);
  });

  it('REMOVE_STARTED / REMOVE_SETTLED bracket a removal', () => {
    const started = redactReducer(fresh(), { type: 'REMOVE_STARTED' });
    expect(started.finish.removing).toBe(true);
    expect(redactReducer(started, { type: 'REMOVE_SETTLED' }).finish.removing).toBe(false);
  });

  it('EXPORT_SAVED also replaces the saved file after a removal', () => {
    const first = { blob, name: 'n.pdf' };
    const next = { blob: new Blob(['z']), name: 'n.pdf' };
    const s = run(fresh(), { type: 'EXPORT_SAVED', saved: first }, { type: 'EXPORT_SAVED', saved: next });
    expect(s.finish.exportedForHandoff).toBe(next);
  });

  it('REMOVAL_NOTED shows the note and announces the same words', () => {
    const s = redactReducer(fresh(), { type: 'REMOVAL_NOTED', note: 'Removed it.' });
    expect(s.finish.removedNote).toBe('Removed it.');
    expect(s.view.announcement).toBe('Removed it.');
  });

  it('REMOVE_FAILED clears the note and announces why', () => {
    const s = run(fresh(), { type: 'REMOVAL_NOTED', note: 'x' }, { type: 'REMOVE_FAILED', announcement: "I couldn't remove that." });
    expect(s.finish.removedNote).toBeNull();
    expect(s.view.announcement).toBe("I couldn't remove that.");
  });
});

describe('the view', () => {
  it('FULLSCREEN_CHANGED and PSEUDO_FULLSCREEN_CHANGED set their flags; either makes fullscreen active', () => {
    const real = redactReducer(fresh(), { type: 'FULLSCREEN_CHANGED', active: true });
    expect(real.view.isFullscreen).toBe(true);
    expect(isFullscreenActive(real)).toBe(true);
    expect(redactReducer(real, { type: 'FULLSCREEN_CHANGED', active: true })).toBe(real);
    const pseudo = redactReducer(fresh(), { type: 'PSEUDO_FULLSCREEN_CHANGED', active: true });
    expect(pseudo.view.isPseudoFullscreen).toBe(true);
    expect(isFullscreenActive(pseudo)).toBe(true);
    expect(isFullscreenActive(redactReducer(pseudo, { type: 'PSEUDO_FULLSCREEN_CHANGED', active: false }))).toBe(false);
  });

  it('ANNOUNCED sets the live-region text', () => {
    expect(redactReducer(fresh(), { type: 'ANNOUNCED', message: 'Added blur box.' }).view.announcement).toBe('Added blur box.');
  });
});

describe('selectors', () => {
  it('brushKindOf is the armed Blur or Whiteout in brush mode only', () => {
    const brushMode = { type: 'BRUSH_CHOSEN', brush: { mode: 'brush', size: 12 }, carriedPatch: {} } as const;
    expect(brushKindOf(run(fresh(), { type: 'TOOL_ARMED', tool: 'blur', locked: false }))).toBeNull();
    expect(brushKindOf(run(fresh(), brushMode, { type: 'TOOL_ARMED', tool: 'blur', locked: false }))).toBe('blur');
    expect(brushKindOf(run(fresh(), brushMode, { type: 'TOOL_ARMED', tool: 'whiteout', locked: false }))).toBe('whiteout');
    expect(brushKindOf(run(fresh(), brushMode, { type: 'TOOL_ARMED', tool: 'blackout', locked: false }))).toBeNull();
    expect(brushKindOf(run(fresh(), brushMode))).toBeNull();
  });

  it('restoredNoteVisible holds until the first edit', () => {
    const s = load(fresh(), { restored: true, elements: [box('a')] });
    expect(restoredNoteVisible(s)).toBe(true);
    expect(restoredNoteVisible(run(s, addCommit([box('b')], 1)))).toBe(false);
  });

  it('finishPhaseOf follows exporting, saved, cancelled, empty, ready in that order', () => {
    expect(finishPhaseOf(fresh())).toBe('empty');
    const withBox = run(fresh(), addCommit([box('a')]));
    expect(finishPhaseOf(withBox)).toBe('ready');
    expect(finishPhaseOf(run(withBox, { type: 'EXPORT_CANCELLED', announcement: 'c' }))).toBe('cancelled');
    expect(finishPhaseOf(run(withBox, { type: 'EXPORT_STARTED', announcement: 's' }))).toBe('exporting');
    const saved = run(withBox, { type: 'EXPORT_SAVED', saved: { blob, name: 'n' } });
    expect(finishPhaseOf(saved)).toBe('saved');
    expect(finishPhaseOf(run(saved, { type: 'EXPORT_CANCELLED', announcement: 'c' }))).toBe('saved');
  });
});
