import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import { getSavedSignatures } from '#editor/workspace/preferenceStore.ts';
import { useSavedSignatures } from './useSavedSignatures.ts';

const LIBRARY_KEY = `pdf-toolkit:saved-signatures:v1:${encodeURIComponent('local-browser-profile')}`;
const sig = (id: string) => ({ id, dataUrl: `data:image/png;base64,${id}`, aspectRatio: 0.5 });
const storedIds = () => (getSavedSignatures() ?? []).map((s) => s.id);

let host: HTMLDivElement;
let hook: ReturnType<typeof useSavedSignatures>;
let setSelectedTool: ReturnType<typeof vi.fn>;
let setAnnouncement: ReturnType<typeof vi.fn>;

function Harness({ selectedTool }: { selectedTool: 'signature' | null }) {
  hook = useSavedSignatures({ selectedTool, setSelectedTool, setAnnouncement, messages: englishSignMessages });
  return null;
}

function mount(selectedTool: 'signature' | null = null) {
  host = document.createElement('div');
  document.body.append(host);
  act(() => { render(<Harness selectedTool={selectedTool} />, host); });
}

/** Another tab replacing the library: its record arrives as a storage event, newer than anything local. */
function otherTabWrites(signatures: ReturnType<typeof sig>[], revision: number) {
  const newValue = JSON.stringify({ schemaVersion: 1, revision, updatedAt: Date.now() + revision, writerId: 'tab-other', signatures });
  act(() => { window.dispatchEvent(new StorageEvent('storage', { key: LIBRARY_KEY, newValue })); });
}

describe('useSavedSignatures', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setSelectedTool = vi.fn();
    setAnnouncement = vi.fn();
  });
  afterEach(() => { act(() => { render(null, host); }); host.remove(); });

  it('a saved signature is written to the on-device library, newest first', () => {
    mount();
    act(() => { hook.saveNewSignature('data:image/png;base64,one', 0.4); });
    act(() => { hook.saveNewSignature('data:image/png;base64,two', 0.6); });

    expect(hook.savedSignatures.map((s) => s.dataUrl)).toEqual(['data:image/png;base64,two', 'data:image/png;base64,one']);
    expect((getSavedSignatures() ?? []).map((s) => s.dataUrl)).toEqual(['data:image/png;base64,two', 'data:image/png;base64,one']);
  });

  it('a confirmed delete removes the signature from the on-device library and says so', () => {
    mount();
    act(() => { hook.saveNewSignature('data:image/png;base64,keep', 0.4); });
    act(() => { hook.saveNewSignature('data:image/png;base64,drop', 0.4); });
    const dropId = hook.savedSignatures[0].id;

    act(() => { hook.deleteSavedSignature(dropId); });
    // Asking is not deleting: nothing changes until it is confirmed.
    expect(storedIds()).toHaveLength(2);
    act(() => { hook.proceedDeleteSignature(); });

    expect(storedIds()).toHaveLength(1);
    expect(storedIds()).not.toContain(dropId);
    expect(hook.signatureToDelete).toBeNull();
    expect(setAnnouncement).toHaveBeenCalledWith(englishSignMessages.signatureDeleted);
  });

  it('deleting the active signature hands the active slot to the first one left', () => {
    mount();
    act(() => { hook.saveNewSignature('data:image/png;base64,old', 0.4); });
    act(() => { hook.saveNewSignature('data:image/png;base64,new', 0.4); });
    const [newest, older] = hook.savedSignatures;
    act(() => { hook.setActiveSignature(newest); });

    act(() => { hook.deleteSavedSignature(newest.id); });
    act(() => { hook.proceedDeleteSignature(); });

    expect(hook.activeSignature?.id).toBe(older.id);
    expect(setSelectedTool).not.toHaveBeenCalled();
  });

  it('deleting the last signature while the signature tool is armed disarms it', () => {
    mount('signature');
    act(() => { hook.saveNewSignature('data:image/png;base64,only', 0.4); });
    const only = hook.savedSignatures[0];
    act(() => { hook.setActiveSignature(only); });

    act(() => { hook.deleteSavedSignature(only.id); });
    act(() => { hook.proceedDeleteSignature(); });

    expect(hook.activeSignature).toBeNull();
    expect(setSelectedTool).toHaveBeenCalledWith(null);
  });

  it('another tab\'s change keeps the active signature when it is still in the list', () => {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify({ schemaVersion: 1, revision: 1, updatedAt: 1, writerId: 'tab-a', signatures: [sig('a'), sig('b')] }));
    mount();
    act(() => { hook.setActiveSignature(sig('b')); });

    otherTabWrites([sig('c'), sig('b')], 2);

    expect(hook.savedSignatures.map((s) => s.id)).toEqual(['c', 'b']);
    expect(hook.activeSignature?.id).toBe('b');
  });

  it('another tab deleting the active signature moves the active slot to the first one left, or to none', () => {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify({ schemaVersion: 1, revision: 1, updatedAt: 1, writerId: 'tab-a', signatures: [sig('a'), sig('b')] }));
    mount();
    act(() => { hook.setActiveSignature(sig('b')); });

    otherTabWrites([sig('a')], 2);
    expect(hook.activeSignature?.id).toBe('a');

    otherTabWrites([], 3);
    expect(hook.savedSignatures).toEqual([]);
    expect(hook.activeSignature).toBeNull();
  });
});
