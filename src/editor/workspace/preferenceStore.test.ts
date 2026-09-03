import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EDITOR_PREFERENCE_RECORD_VERSION,
  getEditorPreference,
  getEditorUserScope,
  setEditorPreference,
  subscribeToEditorPreference,
} from './preferenceStore.ts';

const scope = 'test-user';
const recordKey = `pdf-toolkit:editor-preferences:v1:${encodeURIComponent(scope)}`;

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
    expect(setEditorPreference('lastFontSize', 16, { userScope: scope })).toBe(true);
    expect(setEditorPreference('lastSymbolMark', 'x', { userScope: scope })).toBe(true);
    expect(setEditorPreference('penThickness', 2.5, { userScope: scope })).toBe(true);

    const record = JSON.parse(localStorage.getItem(recordKey) ?? 'null');
    expect(record).toMatchObject({
      schemaVersion: EDITOR_PREFERENCE_RECORD_VERSION,
      revision: 3,
      values: { lastFontSize: 16, lastSymbolMark: 'x', penThickness: 2.5 },
    });
    expect(record.updatedAt).toEqual(expect.any(Number));
    expect(record.writerId).toEqual(expect.stringMatching(/^tab-/));
    expect(localStorage.getItem('pdf-toolkit:lastFontSize')).toBeNull();
    expect(getEditorPreference('lastFontSize', { userScope: scope })).toBe(16);
    expect(getEditorPreference('lastSymbolMark', { userScope: scope })).toBe('x');
  });

  it('migrates established unscoped preferences without discarding them', () => {
    const signatures = [{ id: 'sig-1', dataUrl: 'data:image/png;base64,abc', aspectRatio: 2 }];
    localStorage.setItem('pdf-toolkit:signatures', JSON.stringify(signatures));
    localStorage.setItem('pdf-toolkit:lastFontSize', '16');

    expect(getEditorPreference('savedSignatures')).toEqual(signatures);
    expect(getEditorPreference('lastFontSize')).toBe(16);
    const defaultRecordKey = `pdf-toolkit:editor-preferences:v1:${encodeURIComponent(getEditorUserScope() ?? '')}`;
    expect(JSON.parse(localStorage.getItem(defaultRecordKey) ?? 'null')).toMatchObject({
      schemaVersion: EDITOR_PREFERENCE_RECORD_VERSION,
      revision: 0,
      values: { savedSignatures: signatures, lastFontSize: 16 },
    });
  });

  it('never imports browser-profile legacy values into an explicit user scope', () => {
    localStorage.setItem('pdf-toolkit:lastColor', '#legacy');
    localStorage.setItem('pdf-toolkit:signatures', JSON.stringify([
      { id: 'legacy-signature', dataUrl: 'data:image/png;base64,abc', aspectRatio: 2 },
    ]));

    expect(getEditorPreference('lastColor', { userScope: scope })).toBeNull();
    expect(getEditorPreference('savedSignatures', { userScope: scope })).toBeNull();
    expect(localStorage.getItem(recordKey)).toBeNull();
  });

  it('reads an older envelope and rewrites it as v1 on the next write', () => {
    localStorage.setItem(recordKey, JSON.stringify({
      schemaVersion: 0,
      revision: 4,
      preferences: { lastColor: '#1a2b3c' },
    }));

    expect(getEditorPreference('lastColor', { userScope: scope })).toBe('#1a2b3c');
    expect(setEditorPreference('lastFont', 'Arimo', { userScope: scope })).toBe(true);
    expect(JSON.parse(localStorage.getItem(recordKey) ?? 'null')).toMatchObject({
      schemaVersion: EDITOR_PREFERENCE_RECORD_VERSION,
      revision: 5,
      values: { lastColor: '#1a2b3c', lastFont: 'Arimo' },
    });
  });

  it('rejects corrupt records and malformed saved signatures without reviving legacy data', () => {
    localStorage.setItem('pdf-toolkit:lastColor', '#old');
    localStorage.setItem(recordKey, '{broken');
    expect(getEditorPreference('lastColor', { userScope: scope })).toBeNull();

    localStorage.setItem(recordKey, JSON.stringify({
      schemaVersion: EDITOR_PREFERENCE_RECORD_VERSION,
      revision: 1,
      updatedAt: 1,
      writerId: 'tab-a',
      values: {
        savedSignatures: [{ id: 'sig-2', dataUrl: 'data:image/png;base64,def', aspectRatio: '0.4' }],
        lastSymbolWidth: 0,
        lastSymbolMark: 'cross',
      },
    }));
    expect(getEditorPreference('savedSignatures', { userScope: scope })).toBeNull();
    expect(getEditorPreference('lastSymbolWidth', { userScope: scope })).toBeNull();
    expect(getEditorPreference('lastSymbolMark', { userScope: scope })).toBeNull();
  });

  it('keeps independent local user scopes isolated', () => {
    expect(setEditorPreference('lastColor', '#111111', { userScope: 'person-a' })).toBe(true);
    expect(setEditorPreference('lastColor', '#222222', { userScope: 'person-b' })).toBe(true);
    expect(getEditorPreference('lastColor', { userScope: 'person-a' })).toBe('#111111');
    expect(getEditorPreference('lastColor', { userScope: 'person-b' })).toBe('#222222');
    expect(getEditorUserScope()).toBe('local-browser-profile');
  });

  it('applies newer same-user tab records and ignores an older conflicting event', () => {
    const changes: Array<{ value: string | null; revision: number | null }> = [];
    const stop = subscribeToEditorPreference('lastColor', (change) => changes.push(change), { userScope: scope });
    const eventRecord = (revision: number, updatedAt: number, value: string) => JSON.stringify({
      schemaVersion: EDITOR_PREFERENCE_RECORD_VERSION,
      revision,
      updatedAt,
      writerId: 'tab-other',
      values: { lastColor: value },
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
    const stop = subscribeToEditorPreference('savedSignatures', (change) => changes.push(change), { userScope: scope });
    window.dispatchEvent(new StorageEvent('storage', {
      key: recordKey,
      newValue: JSON.stringify({
        schemaVersion: EDITOR_PREFERENCE_RECORD_VERSION,
        revision: 1,
        updatedAt: 1,
        writerId: 'tab-other',
        values: { savedSignatures: [] },
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
    const stop = subscribeToEditorPreference('lastColor', (change) => changes.push(change), { userScope: scope });

    try {
      expect(setEditorPreference('lastColor', '#winner', { userScope: scope })).toBe(true);
      const losingRecord = JSON.stringify({
        schemaVersion: EDITOR_PREFERENCE_RECORD_VERSION,
        revision: 1,
        updatedAt: 100,
        writerId: 'tab-a',
        values: { lastColor: '#loser' },
      });
      localStorage.setItem(recordKey, losingRecord);
      window.dispatchEvent(new StorageEvent('storage', { key: recordKey, newValue: losingRecord }));

      expect(JSON.parse(localStorage.getItem(recordKey) ?? 'null')).toMatchObject({
        writerId: 'tab-z',
        values: { lastColor: '#winner' },
      });
      expect(changes).toEqual([]);
    } finally {
      Date.now = now;
      stop();
    }
  });

  it('propagates scoped-record removal and accepts a fresh record afterwards', () => {
    const changes: unknown[] = [];
    const stop = subscribeToEditorPreference('lastColor', (change) => changes.push(change), { userScope: scope });
    window.dispatchEvent(new StorageEvent('storage', { key: recordKey, newValue: null }));
    window.dispatchEvent(new StorageEvent('storage', {
      key: recordKey,
      newValue: JSON.stringify({
        schemaVersion: EDITOR_PREFERENCE_RECORD_VERSION,
        revision: 0,
        updatedAt: 0,
        writerId: 'fresh',
        values: { lastColor: '#fresh' },
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
      expect(getEditorPreference('lastColor', { userScope: scope })).toBeNull();
      expect(setEditorPreference('lastColor', '#000000', { userScope: scope })).toBe(false);
    } finally {
      Storage.prototype.getItem = originalGetItem;
      Storage.prototype.setItem = originalSetItem;
    }
  });
});
