import { describe, expect, it } from 'vitest';
import {
  initialSignLifecycleState,
  signLifecycleReducer,
  type SignLifecycleAction,
  type SignLifecycleState,
} from './signState.ts';

const made = { blob: new Blob(['x']), name: 'a_signed.pdf', revision: 3 };
const run = (state: SignLifecycleState, action: SignLifecycleAction) => signLifecycleReducer(state, action);
const withState = (patch: Partial<SignLifecycleState>): SignLifecycleState => ({ ...initialSignLifecycleState(), ...patch });

describe('signLifecycleReducer', () => {
  it('starts idle and empty', () => {
    expect(initialSignLifecycleState()).toEqual({
      status: 'idle', errorDetail: null, progress: 0, announcement: '', needsUnlock: null, signedExport: null, handoffFailed: false,
    });
  });

  it('LOAD_STATUS_CHANGED sets only the status', () => {
    const next = run(withState({ announcement: 'hi' }), { type: 'LOAD_STATUS_CHANGED', status: 'loading' });
    expect(next).toEqual(withState({ status: 'loading', announcement: 'hi' }));
  });

  it('NEEDS_UNLOCK_FOUND records the kind without touching status', () => {
    const next = run(withState({ status: 'loading' }), { type: 'NEEDS_UNLOCK_FOUND', kind: 'needs-password' });
    expect(next.needsUnlock).toBe('needs-password');
    expect(next.status).toBe('loading');
  });

  it('DOCUMENT_OPENED resets protection, error and progress', () => {
    const next = run(withState({ needsUnlock: 'needs-password', errorDetail: 'x', progress: 0.5, status: 'editing' }), { type: 'DOCUMENT_OPENED' });
    expect(next).toEqual(withState({ status: 'editing' }));
  });

  it('ANNOUNCED sets the message', () => {
    expect(run(initialSignLifecycleState(), { type: 'ANNOUNCED', message: 'm' }).announcement).toBe('m');
  });

  it('EXPORT_RETIRED drops the signed export and the hand-off failure', () => {
    const next = run(withState({ signedExport: made, handoffFailed: true, status: 'editing' }), { type: 'EXPORT_RETIRED' });
    expect(next).toEqual(withState({ status: 'editing' }));
  });

  it('EXPORT_INTERRUPTED returns to editing with the message', () => {
    const next = run(withState({ status: 'signing', progress: 0.4 }), { type: 'EXPORT_INTERRUPTED', announcement: 'changed' });
    expect(next).toEqual(withState({ status: 'editing', progress: 0, announcement: 'changed' }));
  });

  it('EXPORT_STARTED is one transition into signing', () => {
    const next = run(withState({ status: 'editing', errorDetail: 'old', progress: 0.9 }), { type: 'EXPORT_STARTED', announcement: 'writing' });
    expect(next).toEqual(withState({ status: 'signing', announcement: 'writing' }));
  });

  it('EXPORT_PROGRESSED sets progress', () => {
    expect(run(initialSignLifecycleState(), { type: 'EXPORT_PROGRESSED', progress: 0.25 }).progress).toBe(0.25);
  });

  it('EXPORT_FINISHED returns to editing, optionally holding the export and message', () => {
    const base = withState({ status: 'signing', signedExport: made, announcement: 'a' });
    expect(run(base, { type: 'EXPORT_FINISHED' })).toEqual(withState({ status: 'editing', signedExport: made, announcement: 'a' }));
    const other = { ...made, name: 'b.pdf' };
    expect(run(base, { type: 'EXPORT_FINISHED', signedExport: other, announcement: 'b' }))
      .toEqual(withState({ status: 'editing', signedExport: other, announcement: 'b' }));
    expect(run(base, { type: 'EXPORT_FINISHED', signedExport: null }).signedExport).toBeNull();
  });

  it('EXPORT_FAILED keeps the editor and shows the detail', () => {
    const next = run(withState({ status: 'signing' }), { type: 'EXPORT_FAILED', detail: 'd', announcement: 'stopped d' });
    expect(next).toEqual(withState({ status: 'editing', errorDetail: 'd', announcement: 'stopped d' }));
  });

  it('EXPORT_NEEDS_UNLOCK reports owner-restricted without an error detail', () => {
    const next = run(withState({ status: 'signing' }), { type: 'EXPORT_NEEDS_UNLOCK', announcement: 'locked' });
    expect(next).toEqual(withState({ status: 'editing', needsUnlock: 'owner-restricted', announcement: 'locked' }));
  });

  it('EXPORT_ERROR_CLEARED clears only the detail', () => {
    expect(run(withState({ errorDetail: 'x', status: 'editing' }), { type: 'EXPORT_ERROR_CLEARED' })).toEqual(withState({ status: 'editing' }));
  });

  it('EXPORT_DELIVERED sets the export (or null) and the message', () => {
    expect(run(initialSignLifecycleState(), { type: 'EXPORT_DELIVERED', signedExport: made, announcement: 'ok' }))
      .toEqual(withState({ signedExport: made, announcement: 'ok' }));
    expect(run(withState({ signedExport: made }), { type: 'EXPORT_DELIVERED', signedExport: null, announcement: 'ok' }).signedExport).toBeNull();
  });

  it('HANDOFF_REQUESTED clears the failure and adopts a ready export only when there is one', () => {
    const base = withState({ handoffFailed: true, signedExport: made });
    expect(run(base, { type: 'HANDOFF_REQUESTED', ready: null })).toEqual(withState({ signedExport: made }));
    const other = { ...made, name: 'b.pdf' };
    expect(run(base, { type: 'HANDOFF_REQUESTED', ready: other }).signedExport).toBe(other);
  });

  it('HANDOFF_FAILED flags the quiet line', () => {
    expect(run(initialSignLifecycleState(), { type: 'HANDOFF_FAILED' }).handoffFailed).toBe(true);
  });
});

describe('an action that changes nothing', () => {
  // The separate useState setters this reducer replaced skipped the render on an unchanged value.
  it('returns the same state, so the island does not re-render', () => {
    const state = withState({ announcement: 'Saved', progress: 0.5 });
    expect(run(state, { type: 'ANNOUNCED', message: 'Saved' })).toBe(state);
    expect(run(state, { type: 'EXPORT_PROGRESSED', progress: 0.5 })).toBe(state);
  });
});
