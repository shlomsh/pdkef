import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MergeNotices from './MergeNotices.tsx';
import { toEntry, type FileEntry } from '../lib/mergeModel.ts';
import { englishMergeMessages, hebrewMergeMessages, type MergeMessages } from '../messages.ts';

type NoticesProps = Parameters<typeof MergeNotices>[0];

describe('MergeNotices', () => {
  let container: HTMLElement;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });

  const entryNamed = (name: string, error: FileEntry['error']): FileEntry => ({ ...toEntry(new File(['x'], name, { type: 'application/pdf' })), error });
  const mount = (props: Partial<NoticesProps>) => {
    act(() => render(
      <MergeNotices
        needsUnlock={null}
        probeSettled
        failedEntry={null}
        failedReason={null}
        otherError={false}
        unlockHref="/unlock/"
        onRemove={() => {}}
        t={englishMergeMessages}
        {...props}
      />,
      container,
    ));
  };
  const locked = (name: string) => ({ failedEntry: entryNamed(name, 'encrypted'), failedReason: 'encrypted' as const });
  const broken = (name: string) => ({ failedEntry: entryNamed(name, 'unreadable'), failedReason: 'unreadable' as const });

  it('names an encrypted file, links to Unlock, and removes it on the one offered action', () => {
    const onRemove = vi.fn();
    const failed = locked('locked.pdf');
    mount({ ...failed, onRemove });
    const notice = container.querySelector('[data-locked-notice]') as HTMLElement;
    expect(notice.textContent).toContain('"locked.pdf" is password-protected');
    expect(notice.querySelector('a')?.getAttribute('href')).toBe('/unlock/');
    expect(container.textContent).not.toContain("That didn't work");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    act(() => (notice.querySelector('button') as HTMLButtonElement).click());
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith(failed.failedEntry.id);
  });

  it('keeps the inline notice and no locked-state panel when a protected file sits among several', () => {
    mount(locked('locked.pdf'));
    expect(container.querySelector('[data-needs-unlock]')).toBeNull();
    expect(container.querySelector('[data-locked-notice]')?.textContent).toContain('is password-protected');
  });

  it('reports an unreadable file by name as an error with no Unlock link', () => {
    const onRemove = vi.fn();
    const failed = broken('broken.pdf');
    mount({ ...failed, onRemove });
    const alert = container.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain('"broken.pdf" could not be read');
    expect(alert.querySelector('a')).toBeNull();
    act(() => (alert.querySelector('button') as HTMLButtonElement).click());
    expect(onRemove).toHaveBeenCalledWith(failed.failedEntry.id);
  });

  it('shows no error while the lock probe has not settled', () => {
    mount({ ...locked('locked.pdf'), probeSettled: false });
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[data-locked-notice]')).toBeNull();
    mount({ ...broken('broken.pdf'), probeSettled: false });
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows the locked state alone, without any inline error, when a single file is protected', () => {
    mount({
      needsUnlock: { kind: 'needs-password', file: new File(['x'], 'locked.pdf'), bytes: new ArrayBuffer(0) },
      ...locked('locked.pdf'),
      otherError: true,
    });
    expect(container.querySelector('[data-needs-unlock="needs-password"]')).not.toBeNull();
    expect(container.querySelector('[data-locked-notice]')).toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows the too-large message for any other build error', () => {
    mount({ otherError: true });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(englishMergeMessages.errorTooLarge);
  });

  describe('in Hebrew', () => {
    const hebrew: MergeMessages = hebrewMergeMessages;

    it('shows the Hebrew locked-state copy', () => {
      mount({ needsUnlock: { kind: 'needs-password', file: new File(['x'], 'locked.pdf'), bytes: new ArrayBuffer(0) }, t: hebrew });
      expect(container.textContent).toContain(hebrew.protectedNeedsPasswordTitle);
      expect(container.textContent).toContain(hebrew.protectedUnlockIt);
    });

    it('isolates the file name in the encrypted notice', () => {
      mount({ ...locked('2025-locked.pdf'), t: hebrew });
      expect(container.querySelector('[data-locked-notice]')?.textContent).toContain('⁨2025-locked.pdf⁩');
    });

    it('isolates the file name in the unreadable error', () => {
      mount({ ...broken('2025-broken.pdf'), t: hebrew });
      expect(container.querySelector('[role="alert"]')?.textContent).toContain('⁨2025-broken.pdf⁩');
    });
  });
});
