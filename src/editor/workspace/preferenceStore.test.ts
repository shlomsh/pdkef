import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EDITOR_PREFERENCE_RECORD_VERSION,
  getAppStyle,
  getEditorPreference,
  getEditorUserScope,
  getSavedSignatures,
  rememberAppStyle,
  setEditorPreference,
  setSavedSignatures,
  subscribeToEditorPreference,
  subscribeToSavedSignatures,
} from './preferenceStore.ts';

const scope = 'test-user';
const recordKey = `pdf-toolkit:editor-preferences:v1:${encodeURIComponent(scope)}`;
const signatureLibraryKey = `pdf-toolkit:saved-signatures:v1:${encodeURIComponent(scope)}`;

describe('editor workspace preferences', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('stores typed values in a versioned record scoped to the current user', () => {
    expect(setEditorPreference('lastWhiteoutColor', '#fefefe', { userScope: scope })).toBe(true);
    expect(setEditorPreference('penColor', '#123456', { userScope: scope })).toBe(true);
    expect(setEditorPreference('penThickness', 2.5, { userScope: scope })).toBe(true);

    const record = JSON.parse(localStorage.getItem(recordKey) ?? 'null');
    expect(record).toMatchObject({
      schemaVersion: EDITOR_PREFERENCE_RECORD_VERSION,
      revision: 3,
      values: { lastWhiteoutColor: '#fefefe', penColor: '#123456', penThickness: 2.5 },
    });
    expect(record.updatedAt).toEqual(expect.any(Number));
    expect(record.writerId).toEqual(expect.stringMatching(/^tab-/));
    expect(localStorage.getItem('pdf-toolkit:lastWhiteoutColor')).toBeNull();
    expect(getEditorPreference('lastWhiteoutColor', { userScope: scope })).toBe('#fefefe');
    expect(getEditorPreference('penColor', { userScope: scope })).toBe('#123456');
  });

  it('migrates established unscoped preferences without discarding them', () => {
    const signatures = [{ id: 'sig-1', dataUrl: 'data:image/png;base64,abc', aspectRatio: 2 }];
    localStorage.setItem('pdf-toolkit:signatures', JSON.stringify(signatures));
    localStorage.setItem('pdf-toolkit:penThickness', '2.5');

    expect(getSavedSignatures()).toEqual(signatures);
    expect(getEditorPreference('penThickness')).toBe(2.5);
    const defaultRecordKey = `pdf-toolkit:editor-preferences:v1:${encodeURIComponent(getEditorUserScope() ?? '')}`;
    expect(JSON.parse(localStorage.getItem(defaultRecordKey) ?? 'null')).toMatchObject({
      schemaVersion: EDITOR_PREFERENCE_RECORD_VERSION,
      revision: 0,
      values: { penThickness: 2.5 },
    });
    expect(JSON.parse(localStorage.getItem(`pdf-toolkit:saved-signatures:v1:${encodeURIComponent(getEditorUserScope() ?? '')}`) ?? 'null')).toMatchObject({
      signatures,
    });
  });

  it('never imports browser-profile legacy values into an explicit user scope', () => {
    localStorage.setItem('pdf-toolkit:lastWhiteoutColor', '#legacy');
    localStorage.setItem('pdf-toolkit:signatures', JSON.stringify([
      { id: 'legacy-signature', dataUrl: 'data:image/png;base64,abc', aspectRatio: 2 },
    ]));

    expect(getEditorPreference('lastWhiteoutColor', { userScope: scope })).toBeNull();
    expect(getSavedSignatures({ userScope: scope })).toBeNull();
    expect(localStorage.getItem(recordKey)).toBeNull();
  });

  it('reads an older envelope and rewrites it as v1 on the next write', () => {
    localStorage.setItem(recordKey, JSON.stringify({
      schemaVersion: 0,
      revision: 4,
      preferences: { penColor: '#1a2b3c' },
    }));

    expect(getEditorPreference('penColor', { userScope: scope })).toBe('#1a2b3c');
    expect(setEditorPreference('lastWhiteoutColor', '#fefefe', { userScope: scope })).toBe(true);
    expect(JSON.parse(localStorage.getItem(recordKey) ?? 'null')).toMatchObject({
      schemaVersion: EDITOR_PREFERENCE_RECORD_VERSION,
      revision: 5,
      values: { penColor: '#1a2b3c', lastWhiteoutColor: '#fefefe' },
    });
  });

  it('moves a schema-v1 envelope library before a scalar rewrite', () => {
    const signatures = [{ id: 'v1-signature', dataUrl: 'data:image/png;base64,abc', aspectRatio: 1.5 }];
    localStorage.setItem(recordKey, JSON.stringify({
      schemaVersion: EDITOR_PREFERENCE_RECORD_VERSION,
      revision: 4,
      updatedAt: 40,
      writerId: 'tab-v1',
      values: { savedSignatures: signatures, penColor: '#abcdef' },
    }));

    expect(setEditorPreference('lastWhiteoutColor', '#fefefe', { userScope: scope })).toBe(true);
    expect(getSavedSignatures({ userScope: scope })).toEqual(signatures);
    expect(JSON.parse(localStorage.getItem(recordKey) ?? 'null')).toMatchObject({
      values: { penColor: '#abcdef', lastWhiteoutColor: '#fefefe' },
    });
    expect(localStorage.getItem(recordKey)).not.toContain('savedSignatures');
    expect(JSON.parse(localStorage.getItem(signatureLibraryKey) ?? 'null')).toMatchObject({ signatures });
  });

  it('rejects corrupt records and malformed saved signatures without reviving legacy data', () => {
    localStorage.setItem('pdf-toolkit:penColor', '#old');
    localStorage.setItem(recordKey, '{broken');
    expect(getEditorPreference('penColor', { userScope: scope })).toBeNull();

    localStorage.setItem(signatureLibraryKey, JSON.stringify({
      schemaVersion: 1,
      revision: 1,
      updatedAt: 1,
      writerId: 'tab-a',
      signatures: [{ id: 'sig-2', dataUrl: 'data:image/png;base64,def', aspectRatio: '0.4' }],
    }));
    expect(getSavedSignatures({ userScope: scope })).toBeNull();
  });

  it('keeps independent local user scopes isolated', () => {
    expect(setEditorPreference('penColor', '#111111', { userScope: 'person-a' })).toBe(true);
    expect(setEditorPreference('penColor', '#222222', { userScope: 'person-b' })).toBe(true);
    expect(getEditorPreference('penColor', { userScope: 'person-a' })).toBe('#111111');
    expect(getEditorPreference('penColor', { userScope: 'person-b' })).toBe('#222222');
    expect(getEditorUserScope()).toBe('local-browser-profile');
  });

  it('applies newer same-user tab records and ignores an older conflicting event', () => {
    const changes: Array<{ value: string | null; revision: number | null }> = [];
    const stop = subscribeToEditorPreference('penColor', (change) => changes.push(change), { userScope: scope });
    const eventRecord = (revision: number, updatedAt: number, value: string) => JSON.stringify({
      schemaVersion: EDITOR_PREFERENCE_RECORD_VERSION,
      revision,
      updatedAt,
      writerId: 'tab-other',
      values: { penColor: value },
    });

    window.dispatchEvent(new StorageEvent('storage', {
      key: recordKey,
      newValue: eventRecord(2, 20, '#222222'),
    }));
    window.dispatchEvent(new StorageEvent('storage', {
      key: recordKey,
      newValue: eventRecord(1, 30, '#111111'),
    }));
    stop();

    expect(changes).toEqual([{ value: '#222222', revision: 2, conflictPolicy: 'last-writer-wins' }]);
  });

  it('propagates a saved-signature deletion from another tab', () => {
    const changes: unknown[] = [];
    const stop = subscribeToSavedSignatures((change) => changes.push(change), { userScope: scope });
    window.dispatchEvent(new StorageEvent('storage', {
      key: signatureLibraryKey,
      newValue: JSON.stringify({
        schemaVersion: 1,
        revision: 1,
        updatedAt: 1,
        writerId: 'tab-other',
        signatures: [],
      }),
    }));
    stop();

    expect(changes).toEqual([{ value: [], revision: 1, conflictPolicy: 'last-writer-wins' }]);
  });

  it('converges same-revision writes by timestamp and writer id', () => {
    const changes: unknown[] = [];
    sessionStorage.setItem('pdf-toolkit:editor-preferences-tab-id', 'tab-z');
    const now = Date.now;
    Date.now = () => 100;
    const stop = subscribeToEditorPreference('penColor', (change) => changes.push(change), { userScope: scope });

    try {
      expect(setEditorPreference('penColor', '#winner', { userScope: scope })).toBe(true);
      const losingRecord = JSON.stringify({
        schemaVersion: EDITOR_PREFERENCE_RECORD_VERSION,
        revision: 1,
        updatedAt: 100,
        writerId: 'tab-a',
        values: { penColor: '#loser' },
      });
      localStorage.setItem(recordKey, losingRecord);
      window.dispatchEvent(new StorageEvent('storage', { key: recordKey, newValue: losingRecord }));

      expect(JSON.parse(localStorage.getItem(recordKey) ?? 'null')).toMatchObject({
        writerId: 'tab-z',
        values: { penColor: '#winner' },
      });
      expect(changes).toEqual([]);
    } finally {
      Date.now = now;
      stop();
    }
  });

  it('propagates scoped-record removal and accepts a fresh record afterwards', () => {
    const changes: unknown[] = [];
    const stop = subscribeToEditorPreference('penColor', (change) => changes.push(change), { userScope: scope });
    window.dispatchEvent(new StorageEvent('storage', { key: recordKey, newValue: null }));
    window.dispatchEvent(new StorageEvent('storage', {
      key: recordKey,
      newValue: JSON.stringify({
        schemaVersion: EDITOR_PREFERENCE_RECORD_VERSION,
        revision: 0,
        updatedAt: 0,
        writerId: 'fresh',
        values: { penColor: '#fresh' },
      }),
    }));
    stop();

    expect(changes).toEqual([
      { value: null, revision: null, conflictPolicy: 'last-writer-wins' },
      { value: '#fresh', revision: 0, conflictPolicy: 'last-writer-wins' },
    ]);
  });

  it('degrades without throwing when localStorage is blocked', () => {
    const originalGetItem = Storage.prototype.getItem;
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.getItem = () => { throw new Error('blocked'); };
    Storage.prototype.setItem = () => { throw new Error('blocked'); };

    try {
      expect(getEditorPreference('penColor', { userScope: scope })).toBeNull();
      expect(setEditorPreference('penColor', '#000000', { userScope: scope })).toBe(false);
      expect(setSavedSignatures([{ id: 'memory-only', dataUrl: 'data:image/png;base64,abc', aspectRatio: 2 }], { userScope: scope })).toBe(false);
    } finally {
      Storage.prototype.getItem = originalGetItem;
      Storage.prototype.setItem = originalSetItem;
    }
  });

  it('keeps image bytes out of every scalar preference write', () => {
    const signatures = [{ id: 'large-signature', dataUrl: `data:image/png;base64,${'A'.repeat(20_000)}`, aspectRatio: 2 }];
    expect(setSavedSignatures(signatures, { userScope: scope })).toBe(true);
    expect(setEditorPreference('penColor', '#123456', { userScope: scope })).toBe(true);

    const scalarJson = localStorage.getItem(recordKey) ?? '';
    expect(scalarJson).not.toContain(signatures[0].dataUrl);
    expect(scalarJson).not.toContain('savedSignatures');
    expect(localStorage.getItem(signatureLibraryKey)).toContain(signatures[0].dataUrl);
  });

  describe('app-wide style (SIGN-35)', () => {
    const appStyleKey = `pdf-toolkit:app-style:v1:${encodeURIComponent(scope)}`;

    it('is empty when nothing is stored', () => {
      expect(getAppStyle({ userScope: scope })).toEqual({});
    });

    it('merges an explicit choice key by key across calls', () => {
      expect(rememberAppStyle({ color: '#111111' }, { userScope: scope })).toBe(true);
      expect(rememberAppStyle({ bold: true }, { userScope: scope })).toBe(true);
      expect(getAppStyle({ userScope: scope })).toEqual({ color: '#111111', bold: true });
    });

    it('drops only a malformed key from a stored record', () => {
      localStorage.setItem(appStyleKey, JSON.stringify({
        schemaVersion: 1,
        style: { color: '#222222', strokeWidth: -1, textAlign: 'sideways' },
      }));
      expect(getAppStyle({ userScope: scope })).toEqual({ color: '#222222' });
    });

    it('never stores or reads back fontSize or direction', () => {
      expect(rememberAppStyle({ color: '#333333', fontSize: 24, direction: 'rtl' }, { userScope: scope })).toBe(true);
      const style = getAppStyle({ userScope: scope });
      expect(style).toEqual({ color: '#333333' });
      expect(style).not.toHaveProperty('fontSize');
      expect(style).not.toHaveProperty('direction');
    });

    it('reads as empty on the wrong schema version or unparsable JSON', () => {
      localStorage.setItem(appStyleKey, JSON.stringify({ schemaVersion: 99, style: { color: '#444444' } }));
      expect(getAppStyle({ userScope: scope })).toEqual({});

      localStorage.setItem(appStyleKey, '{broken');
      expect(getAppStyle({ userScope: scope })).toEqual({});
    });

    it('rejects a patch with only invalid or document-only keys and writes nothing', () => {
      expect(rememberAppStyle({ fontSize: 24, direction: 'rtl', strokeWidth: -1 }, { userScope: scope })).toBe(false);
      expect(localStorage.getItem(appStyleKey)).toBeNull();
    });

    it('isolates two user scopes', () => {
      expect(rememberAppStyle({ color: '#aaaaaa' }, { userScope: 'person-a' })).toBe(true);
      expect(rememberAppStyle({ color: '#bbbbbb' }, { userScope: 'person-b' })).toBe(true);
      expect(getAppStyle({ userScope: 'person-a' })).toEqual({ color: '#aaaaaa' });
      expect(getAppStyle({ userScope: 'person-b' })).toEqual({ color: '#bbbbbb' });
    });
  });
});
