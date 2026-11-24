import { createRef, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MergeRailContent from './MergeRailContent.tsx';
import railStyles from './MergeRail.module.css';
import { toEntry, type FileEntry } from '../lib/mergeModel.ts';
import { sortOptionsOf } from '../lib/mergeView.ts';
import { englishMergeMessages } from '../messages.ts';
import { englishShellMessages } from '#shell/shellMessages.ts';

type RailProps = Parameters<typeof MergeRailContent>[0];

describe('MergeRailContent', () => {
  let container: HTMLElement;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });

  const entry = (name: string, extra: Partial<FileEntry> = {}): FileEntry => ({
    ...toEntry(new File(['x'], name, { type: 'application/pdf' })),
    pageCount: 2,
    ...extra,
  });
  const mount = (props: Partial<RailProps> = {}) => {
    act(() => render(
      <MergeRailContent
        entries={[entry('a.pdf'), entry('b.pdf')]}
        listRef={createRef<HTMLUListElement>()}
        canReorderFiles
        rearranged={false}
        showSortControls
        sortMode="added"
        sortOptions={sortOptionsOf(englishMergeMessages)}
        draftStatusLabel={null}
        showDraftRetentionHint
        showPickedUpSentence={false}
        isRestoredWorkspace={false}
        onRemove={() => {}}
        onRowKeyDown={() => {}}
        onRowClick={() => {}}
        onSortChange={() => {}}
        onResetOrder={() => {}}
        onAdd={() => {}}
        onClear={() => {}}
        t={englishMergeMessages}
        sm={englishShellMessages}
        {...props}
      />,
      container,
    ));
  };
  const rows = () => Array.from(container.querySelectorAll('ul[aria-describedby="reorder-hint"] > li'));
  const quietButtons = () => Array.from(container.querySelectorAll('[data-quiet-row] button')) as HTMLButtonElement[];

  it('shows each file by name, in the rail class, with its page count', () => {
    mount({ entries: [entry('one.pdf', { pageCount: 3 })] });
    const name = container.querySelector('ul[aria-describedby="reorder-hint"] > li [data-file-name]') as HTMLElement;
    expect(railStyles['file-name']).toBeTruthy();
    expect(name.className).toContain(railStyles['file-name']);
    expect(name.textContent).toBe('one.pdf');
    expect(container.querySelector('[data-testid="file-pages"]')?.textContent).toBe('3');
  });

  it('reads out a locked file as protected, with no page count', () => {
    mount({ entries: [entry('a.pdf'), entry('locked.pdf', { error: 'encrypted', pageCount: null })] });
    const row = container.querySelector('ul[aria-describedby="reorder-hint"] > li[data-locked]') as HTMLElement;
    expect(row.querySelector('[data-file-name]')?.textContent).toBe('locked.pdf');
    expect(row.hasAttribute('data-error')).toBe(false);
    expect(row.querySelector('[data-testid="file-pages"]')?.textContent).toBe('This PDF is protected');
  });

  it('marks an unreadable file as an error row', () => {
    mount({ entries: [entry('a.pdf'), entry('broken.pdf', { error: 'unreadable', pageCount: null })] });
    expect(rows()[1].getAttribute('data-error')).toBe('unreadable');
    expect(rows()[1].hasAttribute('data-locked')).toBe(false);
  });

  it('calls remove with that file id, and a click on the row selects it without removing', () => {
    const onRemove = vi.fn();
    const onRowClick = vi.fn();
    const files = [entry('a.pdf'), entry('b.pdf')];
    mount({ entries: files, onRemove, onRowClick });
    act(() => (rows()[1].querySelector('button[aria-label="Remove b.pdf"]') as HTMLButtonElement).click());
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith(files[1].id);
    expect(onRowClick).not.toHaveBeenCalled();
    act(() => (rows()[0] as HTMLElement).click());
    expect(onRowClick).toHaveBeenCalledWith(files[0].id);
  });

  it('offers a drag handle per file only while files can be reordered', () => {
    mount({ canReorderFiles: true });
    expect(container.querySelectorAll('ul[aria-describedby="reorder-hint"] > li [role="button"]')).toHaveLength(2);
    mount({ canReorderFiles: false });
    expect(container.querySelectorAll('ul[aria-describedby="reorder-hint"] > li [role="button"]')).toHaveLength(0);
  });

  it('sorts with the styled menu, Reverse as its own option', () => {
    const onSortChange = vi.fn();
    mount({ onSortChange });
    const trigger = container.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement;
    act(() => trigger.click());
    const labels = Array.from(document.body.querySelectorAll('[role="option"]')).map((o) => o.textContent?.trim());
    expect(labels).toContain('Reversed');
    const reversed = Array.from(document.body.querySelectorAll('[role="option"]')).find((o) => o.textContent?.trim() === 'Reversed') as HTMLElement;
    act(() => reversed.click());
    expect(onSortChange).toHaveBeenCalledTimes(1);
    expect(onSortChange).toHaveBeenCalledWith('reversed');
  });

  it('swaps the sort menu for Reset order once pages were rearranged across files', () => {
    const onResetOrder = vi.fn();
    mount({ rearranged: true, onResetOrder });
    expect(container.querySelector('button[aria-haspopup="listbox"]')).toBeNull();
    act(() => (container.querySelector('[data-rearranged-note] button') as HTMLButtonElement).click());
    expect(onResetOrder).toHaveBeenCalledTimes(1);
  });

  it('gives Add files and Clear all files an icon each and calls their handlers', () => {
    const onAdd = vi.fn();
    const onClear = vi.fn();
    mount({ onAdd, onClear });
    const [add, clear] = quietButtons();
    expect([add.textContent?.trim(), clear.textContent?.trim()]).toEqual(['Add files', 'Clear all files']);
    expect(add.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(clear.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    act(() => add.click());
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onClear).not.toHaveBeenCalled();
    act(() => clear.click());
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('says "Draft not saved" with no retention hint, and shows the hint beside "Draft saved"', () => {
    mount({ draftStatusLabel: 'Draft not saved', showDraftRetentionHint: false });
    const row = container.querySelector('[data-testid="draft-status-row"]') as HTMLElement;
    expect(row.textContent).toBe('Draft not saved');
    expect(row.querySelector('[tabindex="0"][aria-describedby]')).toBeNull();
    mount({ draftStatusLabel: 'Draft saved', showDraftRetentionHint: true });
    const saved = container.querySelector('[data-testid="draft-status-row"]') as HTMLElement;
    expect(saved.textContent).toContain('Draft saved');
    expect(saved.querySelector('[tabindex="0"][aria-describedby]')).not.toBeNull();
  });

  it('shows no draft row for a fresh pick, and the restore sentence with Start fresh for a restored one', () => {
    const onClear = vi.fn();
    mount({ onClear });
    expect(container.querySelector('[data-testid="draft-status-row"]')).toBeNull();
    mount({ showPickedUpSentence: true, isRestoredWorkspace: true, onClear });
    const row = container.querySelector('[data-testid="draft-status-row"]') as HTMLElement;
    expect(row.textContent).toContain('Picked up where you left off');
    act(() => (row.querySelector('button') as HTMLButtonElement).click());
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
