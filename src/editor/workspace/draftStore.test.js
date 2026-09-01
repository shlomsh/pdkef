import { describe, expect, it, beforeEach } from 'vitest';
import { MAX_AGE_MS, readDraftMeta } from './draftStore.js';

// readDraftMeta is the one workspace-store piece that never touches IndexedDB -
// it's a synchronous localStorage read, by design (see the file's header
// comment on why the resume card needs it before first paint). The IndexedDB
// half (saveDraft/loadDraft/deleteDraft) has no direct unit coverage in this
// repo; it's exercised through component tests that mock the module instead.
describe('readDraftMeta', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when no hint is set', () => {
    expect(readDraftMeta('sign')).toBeNull();
  });

  it('returns null when the hint is set but no meta was ever written', () => {
    // This is the exact shape an older build (or a pre-preview session, if
    // the meta write hit a quota error) leaves behind: has-draft:sign = '1'
    // with nothing under draft-meta:sign.
    localStorage.setItem('pdf-toolkit:has-draft:sign', '1');
    expect(readDraftMeta('sign')).toBeNull();
  });

  it('returns the parsed meta once both keys are present', () => {
    localStorage.setItem('pdf-toolkit:has-draft:sign', '1');
    localStorage.setItem(
      'pdf-toolkit:draft-meta:sign',
      JSON.stringify({ fileName: 'contract.pdf', savedAt: Date.now(), preview: 'data:image/jpeg;base64,x' }),
    );
    expect(readDraftMeta('sign')).toEqual({
      fileName: 'contract.pdf',
      savedAt: expect.any(Number),
      preview: 'data:image/jpeg;base64,x',
    });
  });

  it('returns null for corrupt JSON instead of throwing', () => {
    localStorage.setItem('pdf-toolkit:has-draft:sign', '1');
    localStorage.setItem('pdf-toolkit:draft-meta:sign', '{not json');
    expect(() => readDraftMeta('sign')).not.toThrow();
    expect(readDraftMeta('sign')).toBeNull();
  });

  it('is scoped per tool', () => {
    localStorage.setItem('pdf-toolkit:has-draft:redact', '1');
    localStorage.setItem(
      'pdf-toolkit:draft-meta:redact',
      JSON.stringify({ fileName: 'scan.pdf', savedAt: Date.now() }),
    );
    expect(readDraftMeta('sign')).toBeNull();
    expect(readDraftMeta('redact')).toEqual({ fileName: 'scan.pdf', savedAt: expect.any(Number) });
  });

  it('hides and clears expired metadata using the shared retention policy', () => {
    localStorage.setItem('pdf-toolkit:has-draft:sign', '1');
    localStorage.setItem(
      'pdf-toolkit:draft-meta:sign',
      JSON.stringify({ fileName: 'old-contract.pdf', savedAt: Date.now() - MAX_AGE_MS }),
    );

    expect(readDraftMeta('sign')).toBeNull();
    expect(localStorage.getItem('pdf-toolkit:has-draft:sign')).toBeNull();
    expect(localStorage.getItem('pdf-toolkit:draft-meta:sign')).toBeNull();
  });
});
