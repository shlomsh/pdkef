import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
// Installs a global `indexedDB` (and IDBFactory/IDBKeyRange/...) for jsdom,
// which implements everything else this file needs but not IndexedDB itself.
// Only the IndexedDB-backed describe blocks below touch it; every other
// describe block in this file is pure localStorage and does not need this
// import, but it is a global side-effecting install either way.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import {
  MAX_AGE_MS, MAX_RECENT_FILES, MERGE_DRAFT_MAX_BYTES,
  attachDraftPreview, cacheRecentFile, deleteDraft, hasDraftHint, isStoragePersisted, loadDraft, loadRecentFile,
  readCurrentEntryId, readDraftMeta, readRecentFiles, saveDraft, setCurrentEntry, clearCurrentEntry,
  sourceIdForBytes, sourceIdForFiles, subscribeToDraftChanges,
} from './draftStore.js';

// Structured clone (what a real IndexedDB put/get round-trips through, and
// what fake-indexeddb faithfully emulates) copies an ArrayBuffer rather than
// preserving its identity, so a loaded record's fileBytes is never `===` the
// one that was saved - compare decoded content instead.
const text = (buffer) => new TextDecoder().decode(buffer);
const bytesOf = (value) => new TextEncoder().encode(value).buffer;

// Writes directly against the same database/store/keyPath draftStore.js
// itself opens, bypassing every one of its own writers. Used to seed shapes
// draftStore's public API can no longer produce on its own: a raw corrupt
// entry, or the pre-MEM-01 per-tool record shape a legacy browser profile
// would still have lying around. Those three literals are deliberately not
// imported: draftStoreServiceWorkerSync.test.js already guards
// DB_NAME/STORE_NAME/DB_VERSION against drifting out of sync with sw.js, and
// this lane's brief holds them fixed, so re-typing them here carries no real
// drift risk.
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

function getRawRecord(key) {
  return new Promise((resolve, reject) => {
    const openRequest = indexedDB.open('pdf-toolkit-workspace', 1);
    openRequest.onupgradeneeded = () => {
      const db = openRequest.result;
      if (!db.objectStoreNames.contains('workspace')) db.createObjectStore('workspace', { keyPath: 'tool' });
    };
    openRequest.onsuccess = () => {
      const db = openRequest.result;
      const tx = db.transaction('workspace', 'readonly');
      const request = tx.objectStore('workspace').get(key);
      request.onsuccess = () => { db.close(); resolve(request.result); };
      request.onerror = () => { db.close(); reject(request.error); };
    };
    openRequest.onerror = () => reject(openRequest.error);
  });
}

describe('setCurrentEntry / clearCurrentEntry / readCurrentEntryId', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips a pointer, scoped per tool', () => {
    expect(readCurrentEntryId('sign')).toBeNull();
    setCurrentEntry('sign', 'sha256:a');
    setCurrentEntry('redact', 'sha256:b');
    expect(readCurrentEntryId('sign')).toBe('sha256:a');
    expect(readCurrentEntryId('redact')).toBe('sha256:b');
  });

  it('clearCurrentEntry drops only that tool\'s pointer', () => {
    setCurrentEntry('sign', 'sha256:a');
    setCurrentEntry('redact', 'sha256:b');
    clearCurrentEntry('sign');
    expect(readCurrentEntryId('sign')).toBeNull();
    expect(readCurrentEntryId('redact')).toBe('sha256:b');
  });
});

describe('hasDraftHint and readDraftMeta (pointer + recency index, no IndexedDB)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function seedIndexRow(row) {
    localStorage.setItem('pdf-toolkit:workspace:recent-files', JSON.stringify([row]));
  }

  it('hasDraftHint is false with no pointer', () => {
    expect(hasDraftHint('sign')).toBe(false);
  });

  it('hasDraftHint is false when the pointer\'s entry has fallen out of the index', () => {
    setCurrentEntry('sign', 'sha256:gone');
    expect(hasDraftHint('sign')).toBe(false);
  });

  it('hasDraftHint is true once the pointer\'s entry is in the index, regardless of hasWork', () => {
    setCurrentEntry('sign', 'sha256:a');
    seedIndexRow({ id: 'sha256:a', tool: 'sign', fileName: 'contract.pdf', savedAt: Date.now() });
    expect(hasDraftHint('sign')).toBe(true);
  });

  it('hasDraftHint agrees with the head script on a corrupt index: a pointer keeps the hint', () => {
    // ToolPageLayout's pre-paint script keeps its restore marker when the
    // index cannot be parsed; the island must not contradict it and release
    // the marker before IndexedDB has answered (QUAL-10).
    setCurrentEntry('merge', 'sha256:a');
    localStorage.setItem('pdf-toolkit:workspace:recent-files', '{not valid json');
    expect(hasDraftHint('merge')).toBe(true);
    expect(hasDraftHint('sign')).toBe(false);
  });

  it('readDraftMeta returns null with no pointer', () => {
    expect(readDraftMeta('sign')).toBeNull();
  });

  it('readDraftMeta returns the pointed entry\'s index row', () => {
    setCurrentEntry('sign', 'sha256:a');
    seedIndexRow({
      id: 'sha256:a', tool: 'sign', fileName: 'contract.pdf', savedAt: Date.now(),
      preview: 'data:image/jpeg;base64,x', pageCount: 3,
    });
    expect(readDraftMeta('sign')).toEqual({
      fileName: 'contract.pdf', savedAt: expect.any(Number), preview: 'data:image/jpeg;base64,x',
      pageCount: 3, fileCount: undefined,
    });
  });

  it('readDraftMeta is scoped per tool: a redact pointer never reads sign\'s entry', () => {
    setCurrentEntry('redact', 'sha256:b');
    seedIndexRow({ id: 'sha256:b', tool: 'redact', fileName: 'scan.pdf', savedAt: Date.now() });
    expect(readDraftMeta('sign')).toBeNull();
    expect(readDraftMeta('redact').fileName).toBe('scan.pdf');
  });

  it('hides metadata once the entry has aged out, using the shared retention policy', () => {
    setCurrentEntry('sign', 'sha256:old');
    seedIndexRow({ id: 'sha256:old', tool: 'sign', fileName: 'old-contract.pdf', savedAt: Date.now() - MAX_AGE_MS });
    expect(readDraftMeta('sign')).toBeNull();
    expect(hasDraftHint('sign')).toBe(false);
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

  it('keeps one newest entry when the same content was opened in another tool', () => {
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

// attachDraftPreview closes the window where an entry exists with no thumbnail.
// The page-1 preview renders behind a dynamic pdf.js import, so it cannot sit in
// front of the first autosave, and it used to reach storage only as a side
// effect of the *next* save - which never comes if the visitor opens a document
// and then changes nothing. See useDraftPersistence.js.
describe('attachDraftPreview', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function seedEntry(id, tool, overrides = {}) {
    setCurrentEntry(tool, id);
    localStorage.setItem('pdf-toolkit:workspace:recent-files', JSON.stringify([
      { id, tool, fileName: 'contract.pdf', savedAt: Date.now(), ...overrides },
    ]));
  }

  it('adds a preview to an entry that has none', () => {
    seedEntry('sha256:a', 'sign');

    expect(attachDraftPreview('sign', 'data:image/jpeg;base64,x')).toBe(true);
    expect(readDraftMeta('sign')).toEqual({
      fileName: 'contract.pdf', savedAt: expect.any(Number), preview: 'data:image/jpeg;base64,x',
      pageCount: undefined, fileCount: undefined,
    });
  });

  it('leaves the rest of the entry alone', () => {
    // Recent, not a fixed epoch literal: readDraftMeta applies the 14-day
    // retention on read, so a hardcoded timestamp makes this assert nothing
    // once it ages past MAX_AGE_MS - it just reads back null.
    const savedAt = Date.now() - 60_000;
    seedEntry('sha256:a', 'sign', { fileName: 'lease.pdf', savedAt });

    attachDraftPreview('sign', 'data:image/jpeg;base64,y');
    expect(readDraftMeta('sign')).toEqual({
      fileName: 'lease.pdf', savedAt, preview: 'data:image/jpeg;base64,y',
      pageCount: undefined, fileCount: undefined,
    });
  });

  // The guard that matters most. A preview resolving after the pointer moved
  // on - Replace file, or expiry - must not resurrect metadata for a
  // document the tool is no longer on.
  it('does not resurrect metadata when there is no current entry', () => {
    expect(attachDraftPreview('sign', 'data:image/jpeg;base64,x')).toBe(false);
    expect(readDraftMeta('sign')).toBeNull();
  });

  it('does not write to an entry that has aged out', () => {
    seedEntry('sha256:a', 'sign', { fileName: 'old.pdf', savedAt: Date.now() - MAX_AGE_MS });

    expect(attachDraftPreview('sign', 'data:image/jpeg;base64,x')).toBe(false);
    expect(readDraftMeta('sign')).toBeNull();
  });

  it('is scoped per tool', () => {
    seedEntry('sha256:b', 'redact', { fileName: 'scan.pdf' });

    expect(attachDraftPreview('sign', 'data:image/jpeg;base64,x')).toBe(false);
    expect(attachDraftPreview('redact', 'data:image/jpeg;base64,x')).toBe(true);
    expect(readDraftMeta('redact').preview).toBe('data:image/jpeg;base64,x');
  });

  it('ignores an empty preview rather than clearing an existing one', () => {
    seedEntry('sha256:a', 'sign', { preview: 'data:image/jpeg;base64,keep' });

    expect(attachDraftPreview('sign', '')).toBe(false);
    expect(readDraftMeta('sign').preview).toBe('data:image/jpeg;base64,keep');
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
    // describes further down) - that import makes a global `indexedDB` exist
    // for every describe in this module. Clearing it back out here restores
    // the "no IndexedDB in this environment" precondition that test still
    // means to cover; the IndexedDB describes below reinstate their own
    // fresh instance in their own beforeEach.
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

// fake-indexeddb backed: exercises saveDraft/loadDraft/deleteDraft/cacheRecentFile
// against a real (in-memory) IndexedDB implementation instead of a mock,
// covering both record shapes the module writes into `work[tool]` -
// Sign/Redact's single `fileBytes` and Merge's multi-file `files` array
// (MERGE-13), and the one-entry-many-tools model MEM-01 introduced.
describe('saveDraft / loadDraft / deleteDraft / cacheRecentFile (IndexedDB, fake-indexeddb)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('crypto', webcrypto);
    // A fresh backing store per test: draftStore.js's database has no upgrade
    // path by design (see its header comment), so a record left behind by an
    // earlier test would otherwise leak into the next one's "fresh database"
    // assumptions - revision 1, no prior work to bump past.
    indexedDB = new IDBFactory();
  });

  it('round-trips a single-file (Sign) entry and bumps the revision on a second autosave of the same document', async () => {
    // The entry is content-addressed, so the bytes stay identical across
    // both saves - exactly like two autosaves of the same open PDF, where
    // only `elements` changes between them. Saving different bytes would
    // address a different entry entirely (see the multi-entry tests below),
    // not bump a revision on this one.
    const fileBytes = bytesOf('%PDF-1.4 sign draft');
    expect(await saveDraft('sign', {
      fileName: 'contract.pdf', fileType: 'application/pdf', fileBytes, elements: [],
    })).toBe(true);

    const first = await loadDraft('sign');
    expect(text(first.fileBytes)).toBe('%PDF-1.4 sign draft');
    expect(first.sourceId).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first.revision).toBe(1);

    expect(await saveDraft('sign', {
      fileName: 'contract.pdf', fileType: 'application/pdf', fileBytes, elements: [{ id: 'sig-1' }],
    })).toBe(true);
    const second = await loadDraft('sign');
    expect(second.revision).toBe(2);
    expect(second.elements).toEqual([{ id: 'sig-1' }]);
  });

  it('keeps two tools\' work on the same entry side by side, each with its own revision', async () => {
    const fileBytes = bytesOf('%PDF-1.4 shared document');
    await saveDraft('sign', { fileName: 'form.pdf', fileType: 'application/pdf', fileBytes, elements: [{ id: 'sig-1' }] });
    await saveDraft('redact', { fileName: 'form.pdf', fileType: 'application/pdf', fileBytes, elements: [{ id: 'box-1' }] });
    // A second sign save must not disturb redact's work or revision.
    await saveDraft('sign', { fileName: 'form.pdf', fileType: 'application/pdf', fileBytes, elements: [{ id: 'sig-1' }, { id: 'sig-2' }] });

    const signRecord = await loadDraft('sign');
    const redactRecord = await loadDraft('redact');
    expect(signRecord.elements).toEqual([{ id: 'sig-1' }, { id: 'sig-2' }]);
    expect(signRecord.revision).toBe(2);
    expect(redactRecord.elements).toEqual([{ id: 'box-1' }]);
    expect(redactRecord.revision).toBe(1);
    // Same content, so the same entry: both pointers resolve to it.
    expect(signRecord.sourceId).toBe(redactRecord.sourceId);
  });

  it('round-trips a multi-file (Merge) entry with its plan and options, keyed to an order-sensitive sourceId', async () => {
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
    expect(localStorage.getItem('pdf-toolkit:workspace:current:merge')).toBeNull();
  });

  it('refuses a multi-file draft over MERGE_DRAFT_MAX_BYTES without writing, and sets no pointer', async () => {
    // A fake byteLength, not a real 200MB allocation: saveDraft sums
    // `fileBytes.byteLength` before it ever hashes the bytes, so a plain
    // object shaped like an ArrayBuffer exercises the same refusal path.
    const files = [{ fileName: 'huge.pdf', fileBytes: { byteLength: MERGE_DRAFT_MAX_BYTES + 1 } }];

    expect(await saveDraft('merge', { files, plan: [], options: {}, fileName: 'huge.pdf' })).toBe(false);
    expect(await loadDraft('merge')).toBeNull();
    expect(localStorage.getItem('pdf-toolkit:workspace:current:merge')).toBeNull();
  });

  it('writes pageCount and fileCount into the index row, and readDraftMeta returns them', async () => {
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

  it('treats a raw record with an empty files array as no entry, and clears only the pointer', async () => {
    const files = [];
    const id = 'sha256:ghost';
    setCurrentEntry('merge', id);
    await putRawRecord({
      tool: `recent:${id}`, id, fileName: 'ghost.pdf', files, work: { merge: { plan: [], options: {}, revision: 1 } },
      savedAt: Date.now(),
    });

    expect(await loadDraft('merge')).toBeNull();
    expect(readCurrentEntryId('merge')).toBeNull();
    // Only the pointer is dropped - the (still-corrupt) record itself is left
    // alone, exactly like a good entry's other tools' work would be.
    expect(await getRawRecord(`recent:${id}`)).not.toBeUndefined();
  });

  it('cacheRecentFile upserts the entry, sets the pointer, and never touches work', async () => {
    const fileBytes = bytesOf('%PDF-1.4 opened but not edited');
    expect(await cacheRecentFile('sign', {
      fileName: 'form.pdf', fileType: 'application/pdf', fileBytes, preview: 'data:image/jpeg;base64,x',
    })).toBe(true);

    expect(readCurrentEntryId('sign')).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(hasDraftHint('sign')).toBe(true);
    // Opening a file is not editing it: loadDraft still returns the record
    // (it is the tool's current file), but with no work[tool] to spread in.
    const record = await loadDraft('sign');
    expect(text(record.fileBytes)).toBe('%PDF-1.4 opened but not edited');
    expect(record.elements).toBeUndefined();

    // Saving work afterwards attaches to the same entry cacheRecentFile
    // already created, rather than starting a second one.
    await saveDraft('sign', { fileName: 'form.pdf', fileType: 'application/pdf', fileBytes, elements: [{ id: '1' }] });
    expect(readRecentFiles()).toHaveLength(1);
    expect((await loadDraft('sign')).elements).toEqual([{ id: '1' }]);
  });

  it('deleteDraft clears the tool\'s work but keeps the file, its bytes, and any other tool\'s work in recents', async () => {
    const fileBytes = bytesOf('%PDF-1.4 shared');
    await saveDraft('sign', { fileName: 'shared.pdf', fileType: 'application/pdf', fileBytes, elements: [{ id: '1' }] });
    await saveDraft('redact', { fileName: 'shared.pdf', fileType: 'application/pdf', fileBytes, elements: [{ id: '2' }] });
    const id = await sourceIdForBytes(fileBytes);

    expect(await deleteDraft('sign')).toBe(true);

    expect(await loadDraft('sign')).toBeNull();
    expect(readCurrentEntryId('sign')).toBeNull();
    // redact's work, and the file itself, survive untouched.
    const redactRecord = await loadDraft('redact');
    expect(redactRecord.elements).toEqual([{ id: '2' }]);
    const recovered = await loadRecentFile(id);
    expect(recovered).not.toBeNull();
    expect(text(recovered.fileBytes)).toBe('%PDF-1.4 shared');
    expect(recovered.work.sign).toBeUndefined();
    expect(recovered.work.redact).toBeDefined();
  });

  it('deleteDraft on a Merge entry with no other tool\'s work keeps the file in recents with an empty work map', async () => {
    const files = [{ fileName: 'a.pdf', fileType: 'application/pdf', fileBytes: bytesOf('A') }];
    await saveDraft('merge', { files, plan: [], options: {}, fileName: 'a.pdf' });
    const id = await sourceIdForFiles(files);

    expect(await deleteDraft('merge')).toBe(true);

    expect(await loadDraft('merge')).toBeNull();
    const recovered = await loadRecentFile(id);
    expect(recovered).not.toBeNull();
    expect(recovered.files.map((file) => text(file.fileBytes))).toEqual(['A']);
    expect(recovered.work).toEqual({});
  });

  it('deleteDraft with no current entry is a harmless no-op', async () => {
    expect(await deleteDraft('sign')).toBe(true);
  });

  // Eviction: recency only. An entry that was merely opened again outlives
  // one with real edits if the edited one is simply older - work is never a
  // reason to keep a slot. Date.now() is mocked (not fake timers, which
  // would also freeze fake-indexeddb's own internal scheduling - see
  // useMergeDraft.test.tsx's note on the same hazard) so each entry gets a
  // distinct, controlled savedAt.
  it('evicts the oldest entry by recency alone, even though it carries work, once a seventh arrives', async () => {
    const start = 1_700_000_000_000;
    let now = start;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      // 'sign' is the tool whose pointer we track throughout: only the very
      // first entry (editedOldest) is ever saved through it, so its pointer
      // never moves - any later cacheRecentFile below uses 'redact' instead,
      // purely as filler to occupy the other five slots and then push a
      // seventh in. That is what makes the final loadDraft('sign') check
      // below mean "this pointer's entry was evicted", not "this pointer
      // moved on to something else".
      const editedOldest = bytesOf('edited oldest');
      await saveDraft('sign', { fileName: 'edited-oldest.pdf', fileType: 'application/pdf', fileBytes: editedOldest, elements: [{ id: '1' }] });
      const editedOldestId = await sourceIdForBytes(editedOldest);

      const untouchedIds = [];
      for (let index = 1; index <= 5; index += 1) {
        now = start + index * 1000;
        const bytes = bytesOf(`untouched ${index}`);
        // eslint-disable-next-line no-await-in-loop -- ordering the entries by savedAt is the point
        await cacheRecentFile('redact', { fileName: `untouched-${index}.pdf`, fileType: 'application/pdf', fileBytes: bytes });
        // eslint-disable-next-line no-await-in-loop
        untouchedIds.push(await sourceIdForBytes(bytes));
      }
      // Six entries so far (editedOldest + 5 untouched), all still present,
      // and the sign pointer is still on editedOldest.
      expect(readRecentFiles().map((entry) => entry.id)).toContain(editedOldestId);
      expect(readCurrentEntryId('sign')).toBe(editedOldestId);

      // The seventh, newest of all: pushes the six-slot index over, and the
      // oldest - editedOldest, the one with real work - falls out.
      now = start + 6000;
      const seventh = bytesOf('newest of all');
      await cacheRecentFile('redact', { fileName: 'newest.pdf', fileType: 'application/pdf', fileBytes: seventh });

      const ids = readRecentFiles().map((entry) => entry.id);
      expect(ids).toHaveLength(MAX_RECENT_FILES);
      expect(ids).not.toContain(editedOldestId);
      expect(ids).toEqual(expect.arrayContaining(untouchedIds));

      // The sign pointer is unchanged (still editedOldestId) but its entry
      // is gone: work and all, exactly the eviction rule this test is named for.
      expect(readCurrentEntryId('sign')).toBe(editedOldestId);
      expect(await loadDraft('sign')).toBeNull();
      expect(await getRawRecord(`recent:${editedOldestId}`)).toBeUndefined();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('expires a whole entry - and every tool\'s work on it - 14 days after its last save', async () => {
    const start = 1_700_000_000_000;
    let now = start;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      const fileBytes = bytesOf('%PDF-1.4 old file');
      await saveDraft('sign', { fileName: 'old.pdf', fileType: 'application/pdf', fileBytes, elements: [{ id: '1' }] });
      const id = await sourceIdForBytes(fileBytes);

      now = start + MAX_AGE_MS + 1;
      expect(await loadDraft('sign')).toBeNull();
      expect(await loadRecentFile(id)).toBeNull();
      expect(readRecentFiles()).toHaveLength(0);
    } finally {
      nowSpy.mockRestore();
    }
  });
});

// Exercises migrateLegacyDraft (the pre-MEM-01 per-tool record, keyed
// literally by tool name, folding into the new recents entry). Each test
// resets the module so ensureMigrated's one-time memoisation - deliberate in
// production, so a legacy record can never race a later write - does not
// carry a "already migrated" result over from a previous test's completely
// different IndexedDB/localStorage state.
describe('legacy per-tool draft migration', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('crypto', webcrypto);
    indexedDB = new IDBFactory();
    vi.resetModules();
  });

  async function freshStore() {
    return import('./draftStore.js');
  }

  it('folds a legacy single-file (Sign) draft into a fresh entry, sets the pointer, and clears the legacy keys', async () => {
    const fileBytes = bytesOf('%PDF-1.4 legacy sign');
    const sourceId = await sourceIdForBytes(fileBytes);
    localStorage.setItem('pdf-toolkit:workspace:has-draft:sign', '1');
    localStorage.setItem('pdf-toolkit:workspace:draft-meta:sign', JSON.stringify({ fileName: 'contract.pdf', savedAt: Date.now() }));
    await putRawRecord({
      tool: 'sign', fileName: 'contract.pdf', fileType: 'application/pdf', fileBytes, sourceId,
      elements: [{ id: 'sig-1' }], extra: {}, schemaVersion: 2, savedAt: Date.now(), revision: 3, updatedAt: Date.now(), writerId: 'legacy-tab',
    });

    const store = await freshStore();
    const record = await store.loadDraft('sign');

    expect(record.elements).toEqual([{ id: 'sig-1' }]);
    expect(record.revision).toBe(3);
    expect(record.sourceId).toBe(sourceId);
    expect(store.readCurrentEntryId('sign')).toBe(sourceId);
    expect(await getRawRecord('sign')).toBeUndefined();
    expect(localStorage.getItem('pdf-toolkit:workspace:has-draft:sign')).toBeNull();
    expect(localStorage.getItem('pdf-toolkit:workspace:draft-meta:sign')).toBeNull();
  });

  it('folds a legacy draft into an entry that already exists for the same content, alongside the other tool\'s work', async () => {
    // Simulates a browser that had already saved a redact entry under the
    // new schema in one session (no legacy record around yet, so migration
    // found nothing to do), while a legacy sign draft for the *same* content
    // was still sitting untouched from before the MEM-01 upgrade - the two
    // only ever meet on a later session's migration pass, which is what the
    // second freshStore() below stands in for.
    const fileBytes = bytesOf('%PDF-1.4 shared with redact');
    const firstSession = await freshStore();
    await firstSession.saveDraft('redact', { fileName: 'form.pdf', fileType: 'application/pdf', fileBytes, elements: [{ id: 'box-1' }] });
    const sourceId = await sourceIdForBytes(fileBytes);

    await putRawRecord({
      tool: 'sign', fileName: 'form.pdf', fileType: 'application/pdf', fileBytes, sourceId,
      elements: [{ id: 'sig-1' }], extra: {}, schemaVersion: 2, savedAt: Date.now(), revision: 1, updatedAt: Date.now(), writerId: 'legacy-tab',
    });

    vi.resetModules();
    const secondSession = await freshStore();
    const signRecord = await secondSession.loadDraft('sign');
    const redactRecord = await secondSession.loadDraft('redact');
    expect(signRecord.elements).toEqual([{ id: 'sig-1' }]);
    expect(redactRecord.elements).toEqual([{ id: 'box-1' }]);
    expect(signRecord.sourceId).toBe(redactRecord.sourceId);
    expect(secondSession.readRecentFiles()).toHaveLength(1);
  });

  it('folds a legacy multi-file (Merge) draft into a fresh entry, preserving its plan and options', async () => {
    const files = [{ fileName: 'a.pdf', fileType: 'application/pdf', fileBytes: bytesOf('A') }];
    const sourceId = await sourceIdForFiles(files);
    await putRawRecord({
      tool: 'merge', fileName: 'a.pdf', files, plan: [{ key: '0:0', fileId: 0, pageIndex: 0, rotation: 0, skipped: false }],
      options: { addPageNumbers: true }, outputName: null, pageCount: 1, fileCount: 1, sourceId, schemaVersion: 1,
      savedAt: Date.now(), revision: 2, updatedAt: Date.now(), writerId: 'legacy-tab',
    });

    const store = await freshStore();
    const record = await store.loadDraft('merge');

    expect(record.files.map((file) => text(file.fileBytes))).toEqual(['A']);
    expect(record.plan).toEqual([{ key: '0:0', fileId: 0, pageIndex: 0, rotation: 0, skipped: false }]);
    expect(record.options).toEqual({ addPageNumbers: true });
    expect(store.readDraftMeta('merge')).toMatchObject({ fileName: 'a.pdf', pageCount: 1, fileCount: 1 });
  });

  it('keeps a migrated legacy draft at its own age in the index, so it cannot evict a file touched more recently', async () => {
    // Six entries saved under the new schema, then a legacy sign draft from
    // ten days ago turns up on the next session. Recency is by savedAt alone:
    // the old draft is the least recently touched, so it is the one that does
    // not fit, not the newest of the six.
    const firstSession = await freshStore();
    const start = Date.now();
    let now = start;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      for (let i = 0; i < 6; i += 1) {
        now = start + i * 1000;
        await firstSession.cacheRecentFile('sign', { fileName: `fresh-${i}.pdf`, fileType: 'application/pdf', fileBytes: bytesOf(`%PDF fresh ${i}`) });
      }
      const legacyBytes = bytesOf('%PDF-1.4 ten days old');
      const legacyId = await sourceIdForBytes(legacyBytes);
      await putRawRecord({
        tool: 'sign', fileName: 'old.pdf', fileType: 'application/pdf', fileBytes: legacyBytes, sourceId: legacyId,
        elements: [{ id: 'sig-1' }], extra: {}, schemaVersion: 2, savedAt: start - 10 * 24 * 60 * 60 * 1000,
        revision: 1, updatedAt: start, writerId: 'legacy-tab',
      });

      vi.resetModules();
      const secondSession = await freshStore();
      await secondSession.loadDraft('sign');
      const names = secondSession.readRecentFiles().map((entry) => entry.fileName);
      expect(names).toHaveLength(6);
      expect(names).not.toContain('old.pdf');
      expect(names[0]).toBe('fresh-5.pdf');
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('deletes an expired legacy draft outright instead of migrating it', async () => {
    const fileBytes = bytesOf('%PDF-1.4 old legacy sign');
    await putRawRecord({
      tool: 'sign', fileName: 'stale.pdf', fileType: 'application/pdf', fileBytes,
      elements: [], extra: {}, schemaVersion: 2, savedAt: Date.now() - MAX_AGE_MS - 1000,
      revision: 1, updatedAt: Date.now(), writerId: 'legacy-tab',
    });

    const store = await freshStore();
    expect(await store.loadDraft('sign')).toBeNull();
    expect(store.readRecentFiles()).toHaveLength(0);
    expect(await getRawRecord('sign')).toBeUndefined();
  });
});

/* Saving and keeping are two different promises. Without a persistence
   request the browser may evict this whole database whenever it likes, and
   the person is told nothing - reported from an installed iOS home-screen app
   where "Draft saved" had appeared and the work was gone on reopening.
   The request must be best-effort in the strictest sense: a browser with no
   Storage API, or one that throws on it, must still save. It fires on the
   first successful saveDraft, never on a plain open, so a visitor who only
   ever reads never triggers a permission request for nothing. */
describe('storage persistence request', () => {
  const bytes = () => new TextEncoder().encode('%PDF-1.4 persistence').buffer;

  beforeEach(() => {
    indexedDB = new IDBFactory();
    localStorage.clear();
  });

  it('asks the browser to keep this origin on the first successful save, and only asks once', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    vi.stubGlobal('navigator', { ...globalThis.navigator, storage: { persist } });

    vi.resetModules();
    const mod = await import('./draftStore.js');
    await mod.saveDraft('redact', { fileBytes: bytes(), fileName: 'a.pdf', fileType: 'application/pdf', elements: [] });
    await mod.saveDraft('redact', { fileBytes: bytes(), fileName: 'a.pdf', fileType: 'application/pdf', elements: [] });

    expect(persist).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('does not ask on a plain read-only open - loadDraft, cacheRecentFile - only ever on saveDraft', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    vi.stubGlobal('navigator', { ...globalThis.navigator, storage: { persist } });

    vi.resetModules();
    const mod = await import('./draftStore.js');
    // A visitor who opens a file (cacheRecentFile, exactly what merely
    // loading a PDF does) and reads it back, but never saves any work,
    // must never trigger the request - openDb runs for both of these too.
    await mod.cacheRecentFile('sign', { fileName: 'a.pdf', fileType: 'application/pdf', fileBytes: bytes() });
    await mod.loadDraft('sign');
    expect(persist).not.toHaveBeenCalled();

    await mod.saveDraft('sign', { fileBytes: bytes(), fileName: 'a.pdf', fileType: 'application/pdf', elements: [] });
    expect(persist).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('still saves when the browser has no Storage API at all', async () => {
    vi.stubGlobal('navigator', { ...globalThis.navigator, storage: undefined });

    vi.resetModules();
    const mod = await import('./draftStore.js');
    const saved = await mod.saveDraft('redact', {
      fileBytes: bytes(), fileName: 'b.pdf', fileType: 'application/pdf', elements: [{ id: 'x', pageIndex: 0, type: 'blur' }],
    });

    expect(saved).toBe(true);
    vi.unstubAllGlobals();
  });

  it('still saves when persist() rejects or throws', async () => {
    vi.stubGlobal('navigator', {
      ...globalThis.navigator,
      storage: { persist: () => { throw new Error('denied'); } },
    });

    vi.resetModules();
    const mod = await import('./draftStore.js');
    const saved = await mod.saveDraft('redact', {
      fileBytes: bytes(), fileName: 'c.pdf', fileType: 'application/pdf', elements: [],
    });

    expect(saved).toBe(true);
    vi.unstubAllGlobals();
  });
});

// isStoragePersisted reports whether storage is actually guaranteed to
// survive eviction, defensively: an absent API, a throw, or a rejection must
// all read as 'unknown' rather than crash or count as an answer either way -
// the unpersisted-warning line (useDraftPersistence.js) must never fire just
// because a browser cannot tell us.
describe('isStoragePersisted', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves the browser\'s own true/false answer', async () => {
    vi.stubGlobal('navigator', { ...globalThis.navigator, storage: { persisted: () => Promise.resolve(true) } });
    expect(await isStoragePersisted()).toBe(true);

    vi.stubGlobal('navigator', { ...globalThis.navigator, storage: { persisted: () => Promise.resolve(false) } });
    expect(await isStoragePersisted()).toBe(false);
  });

  it('resolves \'unknown\' when there is no Storage API at all', async () => {
    vi.stubGlobal('navigator', { ...globalThis.navigator, storage: undefined });
    expect(await isStoragePersisted()).toBe('unknown');
  });

  it('resolves \'unknown\' when persisted() throws', async () => {
    vi.stubGlobal('navigator', {
      ...globalThis.navigator,
      storage: { persisted: () => { throw new Error('denied'); } },
    });
    expect(await isStoragePersisted()).toBe('unknown');
  });

  it('resolves \'unknown\' when persisted() rejects', async () => {
    vi.stubGlobal('navigator', {
      ...globalThis.navigator,
      storage: { persisted: () => Promise.reject(new Error('denied')) },
    });
    expect(await isStoragePersisted()).toBe('unknown');
  });
});
