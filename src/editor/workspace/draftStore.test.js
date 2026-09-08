import { describe, expect, it, beforeEach, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { MAX_AGE_MS, MAX_RECENT_FILES, attachDraftPreview, readDraftMeta, readRecentFiles, saveDraft, sourceIdForBytes, subscribeToDraftChanges } from './draftStore.js';

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

describe('readRecentFiles', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps only the six newest valid entries', () => {
    const now = Date.now();
    localStorage.setItem('pdf-toolkit:recent-files', JSON.stringify(Array.from({ length: 8 }, (_, index) => ({
      id: `file-${index}`,
      tool: 'sign',
      fileName: `file-${index}.pdf`,
      savedAt: now - index,
    }))));

    const files = readRecentFiles();
    expect(files).toHaveLength(MAX_RECENT_FILES);
    expect(files.map((file) => file.fileName)).toEqual([
      'file-0.pdf', 'file-1.pdf', 'file-2.pdf', 'file-3.pdf', 'file-4.pdf', 'file-5.pdf',
    ]);
  });

  it('removes expired entries without disturbing valid recent files', () => {
    const now = Date.now();
    localStorage.setItem('pdf-toolkit:recent-files', JSON.stringify([
      { id: 'current', tool: 'redact', fileName: 'current.pdf', savedAt: now },
      { id: 'old', tool: 'sign', fileName: 'old.pdf', savedAt: now - MAX_AGE_MS },
    ]));

    expect(readRecentFiles().map((file) => file.fileName)).toEqual(['current.pdf']);
    expect(JSON.parse(localStorage.getItem('pdf-toolkit:recent-files'))).toHaveLength(1);
  });

  it('keeps the newest entry when iOS recreates a same-named document with a different byte hash', () => {
    const now = Date.now();
    localStorage.setItem('pdf-toolkit:recent-files', JSON.stringify([
      { id: 'sha256:older-version', tool: 'sign', fileName: 'תעודת זהות.pdf', savedAt: now - 1_000 },
      { id: 'sha256:ios-copy', tool: 'sign', fileName: 'תעודת זהות.pdf', savedAt: now },
      { id: 'sha256:another-file', tool: 'sign', fileName: 'approval.pdf', savedAt: now - 2_000 },
    ]));

    expect(readRecentFiles().map((file) => file.id)).toEqual([
      'sha256:ios-copy',
      'sha256:another-file',
    ]);
    expect(JSON.parse(localStorage.getItem('pdf-toolkit:recent-files')).map((file) => file.id)).toEqual([
      'sha256:ios-copy',
      'sha256:another-file',
    ]);
  });
});

// attachDraftPreview closes the window where a draft exists with no thumbnail.
// The page-1 preview renders behind a dynamic pdf.js import, so it cannot sit in
// front of the first autosave, and it used to reach storage only as a side
// effect of the *next* save - which never comes if the visitor opens a document
// and then changes nothing. See useDraftPersistence.js.
describe('attachDraftPreview', () => {
  const meta = (name = 'contract.pdf', savedAt = Date.now()) =>
    JSON.stringify({ fileName: name, savedAt });

  beforeEach(() => {
    localStorage.clear();
  });

  it('adds a preview to metadata that has none', () => {
    localStorage.setItem('pdf-toolkit:has-draft:sign', '1');
    localStorage.setItem('pdf-toolkit:draft-meta:sign', meta());

    expect(attachDraftPreview('sign', 'data:image/jpeg;base64,x')).toBe(true);
    expect(readDraftMeta('sign')).toEqual({
      fileName: 'contract.pdf',
      savedAt: expect.any(Number),
      preview: 'data:image/jpeg;base64,x',
    });
  });

  it('leaves the rest of the metadata alone', () => {
    // Recent, not a fixed epoch literal: readDraftMeta applies the 14-day
    // retention on read, so a hardcoded timestamp makes this assert nothing
    // once it ages past MAX_AGE_MS - it just reads back null.
    const savedAt = Date.now() - 60_000;
    localStorage.setItem('pdf-toolkit:has-draft:sign', '1');
    localStorage.setItem('pdf-toolkit:draft-meta:sign', meta('lease.pdf', savedAt));

    attachDraftPreview('sign', 'data:image/jpeg;base64,y');
    expect(readDraftMeta('sign')).toEqual({
      fileName: 'lease.pdf',
      savedAt,
      preview: 'data:image/jpeg;base64,y',
    });
  });

  // The guard that matters most. A preview resolving after the draft was
  // cleared - Replace file, or expiry - must not write metadata back, or the
  // home page would offer to resume a document that no longer exists.
  it('does not resurrect metadata for a draft that has been cleared', () => {
    expect(attachDraftPreview('sign', 'data:image/jpeg;base64,x')).toBe(false);
    expect(localStorage.getItem('pdf-toolkit:draft-meta:sign')).toBeNull();
    expect(localStorage.getItem('pdf-toolkit:has-draft:sign')).toBeNull();
  });

  it('does not write to an expired draft', () => {
    localStorage.setItem('pdf-toolkit:has-draft:sign', '1');
    localStorage.setItem('pdf-toolkit:draft-meta:sign', meta('old.pdf', Date.now() - MAX_AGE_MS));

    expect(attachDraftPreview('sign', 'data:image/jpeg;base64,x')).toBe(false);
    expect(readDraftMeta('sign')).toBeNull();
  });

  it('is scoped per tool', () => {
    localStorage.setItem('pdf-toolkit:has-draft:redact', '1');
    localStorage.setItem('pdf-toolkit:draft-meta:redact', meta('scan.pdf'));

    expect(attachDraftPreview('sign', 'data:image/jpeg;base64,x')).toBe(false);
    expect(attachDraftPreview('redact', 'data:image/jpeg;base64,x')).toBe(true);
    expect(readDraftMeta('redact').preview).toBe('data:image/jpeg;base64,x');
  });

  it('ignores an empty preview rather than clearing an existing one', () => {
    localStorage.setItem('pdf-toolkit:has-draft:sign', '1');
    localStorage.setItem(
      'pdf-toolkit:draft-meta:sign',
      JSON.stringify({ fileName: 'contract.pdf', savedAt: Date.now(), preview: 'data:image/jpeg;base64,keep' }),
    );

    expect(attachDraftPreview('sign', '')).toBe(false);
    expect(readDraftMeta('sign').preview).toBe('data:image/jpeg;base64,keep');
  });

  it('survives corrupt metadata without throwing', () => {
    localStorage.setItem('pdf-toolkit:has-draft:sign', '1');
    localStorage.setItem('pdf-toolkit:draft-meta:sign', '{not json');

    expect(() => attachDraftPreview('sign', 'data:image/jpeg;base64,x')).not.toThrow();
    expect(attachDraftPreview('sign', 'data:image/jpeg;base64,x')).toBe(false);
  });
});

describe('draft source and cross-tab coordination boundaries', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('crypto', webcrypto);
  });

  it('uses a content address instead of a filename or document id for source bytes', async () => {
    const one = new TextEncoder().encode('same PDF bytes').buffer;
    const two = new TextEncoder().encode('same PDF bytes').buffer;
    const id = await sourceIdForBytes(one);

    expect(id).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(await sourceIdForBytes(two)).toBe(id);
    expect(await sourceIdForBytes(new TextEncoder().encode('different PDF').buffer)).not.toBe(id);
  });

  it('does not persist when binary storage is unavailable', async () => {
    expect(await saveDraft('sign', { fileBytes: new ArrayBuffer(1) })).toBe(false);
  });

  it('reports only a revision and policy for another tab, never draft data', () => {
    const changes = [];
    const stop = subscribeToDraftChanges('sign', (change) => changes.push(change));
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'pdf-toolkit:draft-change:sign',
      newValue: JSON.stringify({
        kind: 'saved', revision: 7, updatedAt: 123, writerId: 'another-tab',
        fileName: 'private.pdf', sourceId: 'document-123', elements: [{ text: 'secret' }],
      }),
    }));
    stop();

    expect(changes).toEqual([{ revision: 7, kind: 'saved', conflictPolicy: 'last-writer-wins' }]);
    expect(JSON.stringify(changes)).not.toContain('private.pdf');
    expect(JSON.stringify(changes)).not.toContain('secret');
  });
});
