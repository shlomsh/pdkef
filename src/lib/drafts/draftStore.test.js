import { describe, expect, it, beforeEach, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
// Installs a global `indexedDB` (and IDBFactory/IDBKeyRange/...) for jsdom,
// which implements everything else this file needs but not IndexedDB itself.
// Only the "saveDraft / loadDraft" describe block below touches IndexedDB;
// every other describe block in this file is pure localStorage and does not
// need this import, but it is a global side-effecting install either way.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import {
  MAX_AGE_MS, MAX_RECENT_FILES, MERGE_DRAFT_MAX_BYTES,
  attachDraftPreview, deleteDraft, loadDraft, readDraftMeta, readRecentFiles,
  saveDraft, sourceIdForBytes, sourceIdForFiles, subscribeToDraftChanges,
} from './draftStore.js';

// readDraftMeta is the one workspace-store piece that never touches IndexedDB -
// it's a synchronous localStorage read, by design (see the file's header
// comment on why the resume card needs it before first paint). The IndexedDB
// half (saveDraft/loadDraft/deleteDraft) is additionally exercised through
// component tests that mock the module; the "saveDraft / loadDraft" describe
// block further down in this file covers it directly, against fake-indexeddb.
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
    localStorage.setItem('pdf-toolkit:workspace:has-draft:sign', '1');
    expect(readDraftMeta('sign')).toBeNull();
  });

  it('returns the parsed meta once both keys are present', () => {
    localStorage.setItem('pdf-toolkit:workspace:has-draft:sign', '1');
    localStorage.setItem(
      'pdf-toolkit:workspace:draft-meta:sign',
      JSON.stringify({ fileName: 'contract.pdf', savedAt: Date.now(), preview: 'data:image/jpeg;base64,x' }),
    );
    expect(readDraftMeta('sign')).toEqual({
      fileName: 'contract.pdf',
      savedAt: expect.any(Number),
      preview: 'data:image/jpeg;base64,x',
    });
  });

  it('returns null for corrupt JSON instead of throwing', () => {
    localStorage.setItem('pdf-toolkit:workspace:has-draft:sign', '1');
    localStorage.setItem('pdf-toolkit:workspace:draft-meta:sign', '{not json');
    expect(() => readDraftMeta('sign')).not.toThrow();
    expect(readDraftMeta('sign')).toBeNull();
  });

  it('is scoped per tool', () => {
    localStorage.setItem('pdf-toolkit:workspace:has-draft:redact', '1');
    localStorage.setItem(
      'pdf-toolkit:workspace:draft-meta:redact',
      JSON.stringify({ fileName: 'scan.pdf', savedAt: Date.now() }),
    );
    expect(readDraftMeta('sign')).toBeNull();
    expect(readDraftMeta('redact')).toEqual({ fileName: 'scan.pdf', savedAt: expect.any(Number) });
  });

  it('hides and clears expired metadata using the shared retention policy', () => {
    localStorage.setItem('pdf-toolkit:workspace:has-draft:sign', '1');
    localStorage.setItem(
      'pdf-toolkit:workspace:draft-meta:sign',
      JSON.stringify({ fileName: 'old-contract.pdf', savedAt: Date.now() - MAX_AGE_MS }),
    );

    expect(readDraftMeta('sign')).toBeNull();
    expect(localStorage.getItem('pdf-toolkit:workspace:has-draft:sign')).toBeNull();
    expect(localStorage.getItem('pdf-toolkit:workspace:draft-meta:sign')).toBeNull();
  });
});

describe('readRecentFiles', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps only the six newest valid entries', () => {
    const now = Date.now();
    localStorage.setItem('pdf-toolkit:workspace:recent-files', JSON.stringify(Array.from({ length: 8 }, (_, index) => ({
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
    localStorage.setItem('pdf-toolkit:workspace:recent-files', JSON.stringify([
      { id: 'current', tool: 'redact', fileName: 'current.pdf', savedAt: now },
      { id: 'old', tool: 'sign', fileName: 'old.pdf', savedAt: now - MAX_AGE_MS },
    ]));

    expect(readRecentFiles().map((file) => file.fileName)).toEqual(['current.pdf']);
    expect(JSON.parse(localStorage.getItem('pdf-toolkit:workspace:recent-files'))).toHaveLength(1);
  });

  it('keeps files with different content hashes even when their names match', () => {
    const now = Date.now();
    localStorage.setItem('pdf-toolkit:workspace:recent-files', JSON.stringify([
      { id: 'sha256:older-version', tool: 'sign', fileName: 'תעודת זהות.pdf', savedAt: now - 1_000 },
      { id: 'sha256:ios-copy', tool: 'sign', fileName: 'תעודת זהות.pdf', savedAt: now },
      { id: 'sha256:another-file', tool: 'sign', fileName: 'approval.pdf', savedAt: now - 2_000 },
    ]));

    expect(readRecentFiles().map((file) => file.id)).toEqual([
      'sha256:ios-copy',
      'sha256:older-version',
      'sha256:another-file',
    ]);
  });

  it('keeps one newest entry when the same content is opened in another tool', () => {
    const now = Date.now();
    localStorage.setItem('pdf-toolkit:workspace:recent-files', JSON.stringify([
      { id: 'sha256:same-file', tool: 'sign', fileName: 'identity.pdf', savedAt: now - 1_000 },
      { id: 'sha256:same-file', tool: 'redact', fileName: 'identity.pdf', savedAt: now },
    ]));

    expect(readRecentFiles()).toEqual([
      { id: 'sha256:same-file', tool: 'redact', fileName: 'identity.pdf', savedAt: now },
    ]);
    expect(JSON.parse(localStorage.getItem('pdf-toolkit:workspace:recent-files'))).toHaveLength(1);
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
    localStorage.setItem('pdf-toolkit:workspace:has-draft:sign', '1');
    localStorage.setItem('pdf-toolkit:workspace:draft-meta:sign', meta());

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
    localStorage.setItem('pdf-toolkit:workspace:has-draft:sign', '1');
    localStorage.setItem('pdf-toolkit:workspace:draft-meta:sign', meta('lease.pdf', savedAt));

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
    expect(localStorage.getItem('pdf-toolkit:workspace:draft-meta:sign')).toBeNull();
    expect(localStorage.getItem('pdf-toolkit:workspace:has-draft:sign')).toBeNull();
  });

  it('does not write to an expired draft', () => {
    localStorage.setItem('pdf-toolkit:workspace:has-draft:sign', '1');
    localStorage.setItem('pdf-toolkit:workspace:draft-meta:sign', meta('old.pdf', Date.now() - MAX_AGE_MS));

    expect(attachDraftPreview('sign', 'data:image/jpeg;base64,x')).toBe(false);
    expect(readDraftMeta('sign')).toBeNull();
  });

  it('is scoped per tool', () => {
    localStorage.setItem('pdf-toolkit:workspace:has-draft:redact', '1');
    localStorage.setItem('pdf-toolkit:workspace:draft-meta:redact', meta('scan.pdf'));

    expect(attachDraftPreview('sign', 'data:image/jpeg;base64,x')).toBe(false);
    expect(attachDraftPreview('redact', 'data:image/jpeg;base64,x')).toBe(true);
    expect(readDraftMeta('redact').preview).toBe('data:image/jpeg;base64,x');
  });

  it('ignores an empty preview rather than clearing an existing one', () => {
    localStorage.setItem('pdf-toolkit:workspace:has-draft:sign', '1');
    localStorage.setItem(
      'pdf-toolkit:workspace:draft-meta:sign',
      JSON.stringify({ fileName: 'contract.pdf', savedAt: Date.now(), preview: 'data:image/jpeg;base64,keep' }),
    );

    expect(attachDraftPreview('sign', '')).toBe(false);
    expect(readDraftMeta('sign').preview).toBe('data:image/jpeg;base64,keep');
  });

  it('survives corrupt metadata without throwing', () => {
    localStorage.setItem('pdf-toolkit:workspace:has-draft:sign', '1');
    localStorage.setItem('pdf-toolkit:workspace:draft-meta:sign', '{not json');

    expect(() => attachDraftPreview('sign', 'data:image/jpeg;base64,x')).not.toThrow();
    expect(attachDraftPreview('sign', 'data:image/jpeg;base64,x')).toBe(false);
  });
});

describe('draft source and cross-tab coordination boundaries', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('crypto', webcrypto);
    // This describe's own "binary storage unavailable" case means to exercise
    // hasIndexedDB() being false, which was simply true for jsdom by default
    // before this file also imported fake-indexeddb/auto (for the IndexedDB
    // describe further down) - that import makes a global `indexedDB` exist
    // for every describe in this module. Clearing it back out here restores
    // the "no IndexedDB in this environment" precondition that test still
    // means to cover; the IndexedDB describe below reinstates its own fresh
    // instance in its own beforeEach.
    globalThis.indexedDB = undefined;
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
      key: 'pdf-toolkit:workspace:draft-change:sign',
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

// fake-indexeddb backed: exercises saveDraft/loadDraft/deleteDraft against a
// real (in-memory) IndexedDB implementation instead of a mock, covering both
// record shapes the module now writes - Sign/Redact's single `fileBytes` and
// Merge's multi-file `files` array (MERGE-13).
describe('saveDraft / loadDraft / deleteDraft (IndexedDB, fake-indexeddb)', () => {
  // Structured clone (what a real IndexedDB put/get round-trips through, and
  // what fake-indexeddb faithfully emulates) copies an ArrayBuffer rather than
  // preserving its identity, so a loaded record's fileBytes is never `===` the
  // one that was saved - compare decoded content instead.
  const text = (buffer) => new TextDecoder().decode(buffer);
  const bytesOf = (value) => new TextEncoder().encode(value).buffer;

  // A record with an empty `files` array is refused by saveDraft (MERGE-13's
  // "nothing to merge, nothing to resume" rule) and so can never reach
  // IndexedDB through the public API. Reaching one anyway - to prove loadDraft
  // treats it as corrupt rather than crashing - means writing it directly
  // against the same database/store/keyPath draftStore.js itself opens. Those
  // three literals are deliberately not imported: draftStoreServiceWorkerSync
  // .test.js already guards DB_NAME/STORE_NAME/DB_VERSION against drifting out
  // of sync with sw.js, and this lane's brief holds them fixed, so re-typing
  // them here carries no real drift risk.
  function putRawRecord(record) {
    return new Promise((resolve, reject) => {
      const openRequest = indexedDB.open('pdf-toolkit-workspace', 1);
      openRequest.onupgradeneeded = () => {
        const db = openRequest.result;
        if (!db.objectStoreNames.contains('workspace')) db.createObjectStore('workspace', { keyPath: 'tool' });
      };
      openRequest.onsuccess = () => {
        const db = openRequest.result;
        const tx = db.transaction('workspace', 'readwrite');
        tx.objectStore('workspace').put(record);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
      openRequest.onerror = () => reject(openRequest.error);
    });
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('crypto', webcrypto);
    // A fresh backing store per test: draftStore.js's database has no upgrade
    // path by design (see its header comment), so a record left behind by an
    // earlier test would otherwise leak into the next one's "fresh database"
    // assumptions - revision 1, no prior draft to bump past.
    indexedDB = new IDBFactory();
  });

  it('round-trips a single-file (Sign) draft and bumps the revision on a second save', async () => {
    const fileBytes = bytesOf('%PDF-1.4 sign draft one');
    expect(await saveDraft('sign', {
      fileName: 'contract.pdf', fileType: 'application/pdf', fileBytes, elements: [],
    })).toBe(true);

    const first = await loadDraft('sign');
    expect(text(first.fileBytes)).toBe('%PDF-1.4 sign draft one');
    expect(first.sourceId).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first.revision).toBe(1);

    expect(await saveDraft('sign', {
      fileName: 'contract.pdf', fileType: 'application/pdf', fileBytes: bytesOf('%PDF-1.4 sign draft two'), elements: [],
    })).toBe(true);
    const second = await loadDraft('sign');
    expect(second.revision).toBe(2);
    expect(text(second.fileBytes)).toBe('%PDF-1.4 sign draft two');
  });

  it('round-trips a multi-file (Merge) draft with its plan and options, keyed to an order-sensitive sourceId', async () => {
    const files = [
      { fileName: 'invoice.pdf', fileType: 'application/pdf', fileBytes: bytesOf('file A bytes') },
      { fileName: 'receipt.pdf', fileType: 'application/pdf', fileBytes: bytesOf('file B bytes') },
    ];
    const plan = [{ file: 0, pages: 'all' }, { file: 1, pages: 'all' }];
    const options = { rotate: 0 };
    const expectedSourceId = await sourceIdForFiles(files);

    expect(await saveDraft('merge', {
      files, plan, options, fileName: 'invoice + 1 more', schemaVersion: 1,
    })).toBe(true);

    const loaded = await loadDraft('merge');
    expect(loaded.files.map((file) => text(file.fileBytes))).toEqual(['file A bytes', 'file B bytes']);
    expect(loaded.files.map((file) => file.fileName)).toEqual(['invoice.pdf', 'receipt.pdf']);
    expect(loaded.plan).toEqual(plan);
    expect(loaded.options).toEqual(options);
    expect(loaded.sourceId).toBe(expectedSourceId);
    expect(loaded).not.toHaveProperty('fileBytes');
    expect(loaded).not.toHaveProperty('preview');
  });

  it('gives the same files in a different order a different sourceId', async () => {
    const fileA = { fileName: 'a.pdf', fileBytes: bytesOf('A contents') };
    const fileB = { fileName: 'b.pdf', fileBytes: bytesOf('B contents') };

    const idAB = await sourceIdForFiles([fileA, fileB]);
    const idBA = await sourceIdForFiles([fileB, fileA]);

    expect(idAB).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(idBA).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(idAB).not.toBe(idBA);
  });

  it('refuses an empty multi-file draft and writes nothing', async () => {
    expect(await saveDraft('merge', { files: [], plan: [], options: {}, fileName: 'nothing' })).toBe(false);
    expect(await loadDraft('merge')).toBeNull();
    expect(localStorage.getItem('pdf-toolkit:workspace:has-draft:merge')).toBeNull();
  });

  it('refuses a multi-file draft over MERGE_DRAFT_MAX_BYTES without writing, and the hint is not set', async () => {
    // A fake byteLength, not a real 200MB allocation: saveDraft sums
    // `fileBytes.byteLength` before it ever hashes the bytes, so a plain
    // object shaped like an ArrayBuffer exercises the same refusal path.
    const files = [{ fileName: 'huge.pdf', fileBytes: { byteLength: MERGE_DRAFT_MAX_BYTES + 1 } }];

    expect(await saveDraft('merge', { files, plan: [], options: {}, fileName: 'huge.pdf' })).toBe(false);
    expect(await loadDraft('merge')).toBeNull();
    expect(localStorage.getItem('pdf-toolkit:workspace:has-draft:merge')).toBeNull();
  });

  it('writes pageCount and fileCount into the hint, and readDraftMeta returns them', async () => {
    const files = [
      { fileName: 'a.pdf', fileBytes: bytesOf('A') },
      { fileName: 'b.pdf', fileBytes: bytesOf('B') },
    ];
    expect(await saveDraft('merge', {
      files, plan: [], options: {}, fileName: 'a.pdf + 1 more',
      pageCount: 12, fileCount: 2, preview: 'data:image/jpeg;base64,x',
    })).toBe(true);

    expect(readDraftMeta('merge')).toEqual({
      fileName: 'a.pdf + 1 more', savedAt: expect.any(Number), preview: 'data:image/jpeg;base64,x',
      pageCount: 12, fileCount: 2,
    });
  });

  it('keeps pageCount and fileCount when attachDraftPreview later fills in a preview', async () => {
    const files = [{ fileName: 'a.pdf', fileBytes: bytesOf('A') }];
    expect(await saveDraft('merge', {
      files, plan: [], options: {}, fileName: 'a.pdf', pageCount: 3, fileCount: 1,
    })).toBe(true);

    expect(attachDraftPreview('merge', 'data:image/jpeg;base64,later')).toBe(true);
    expect(readDraftMeta('merge')).toEqual({
      fileName: 'a.pdf', savedAt: expect.any(Number), preview: 'data:image/jpeg;base64,later',
      pageCount: 3, fileCount: 1,
    });
  });

  it('treats a corrupt record with an empty files array as no draft, and clears the hint', async () => {
    localStorage.setItem('pdf-toolkit:workspace:has-draft:merge', '1');
    localStorage.setItem(
      'pdf-toolkit:workspace:draft-meta:merge',
      JSON.stringify({ fileName: 'ghost.pdf', savedAt: Date.now() }),
    );
    await putRawRecord({
      tool: 'merge', files: [], plan: [], options: {}, fileName: 'ghost.pdf',
      savedAt: Date.now(), revision: 1, updatedAt: Date.now(), writerId: 'legacy',
    });

    expect(await loadDraft('merge')).toBeNull();
    expect(localStorage.getItem('pdf-toolkit:workspace:has-draft:merge')).toBeNull();
    expect(localStorage.getItem('pdf-toolkit:workspace:draft-meta:merge')).toBeNull();
  });

  it('deleteDraft removes a multi-file draft record and its hint', async () => {
    const files = [{ fileName: 'a.pdf', fileBytes: bytesOf('A') }];
    expect(await saveDraft('merge', { files, plan: [], options: {}, fileName: 'a.pdf' })).toBe(true);

    expect(await deleteDraft('merge')).toBe(true);
    expect(await loadDraft('merge')).toBeNull();
    expect(localStorage.getItem('pdf-toolkit:workspace:has-draft:merge')).toBeNull();
  });
});
