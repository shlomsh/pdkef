import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRef, render, type ComponentChildren } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import MergeChipBar from './MergeChipBar.tsx';
import { useMergeTool } from '../hooks/useMergeTool.ts';
import { englishMergeMessages as t } from '../messages.ts';
import { installToolHarness, type ToolHarness } from '../../../test/harness/toolHarness.ts';
import { pagesPdf } from '../../../test/support/mergeFixtures.ts';
import { waitUntil } from '../../../test/support/waitUntil.ts';

type View = ReturnType<typeof useMergeTool>;

const lockedFile = () => new File(
  [new Uint8Array(readFileSync(resolve(process.cwd(), 'src/lib/__fixtures__/encrypted/owner-only.pdf')))],
  'locked.pdf',
  { type: 'application/pdf' },
);

describe('MergeChipBar', () => {
  let container: HTMLElement;
  let harness: ToolHarness;
  let view: View;

  function Probe({ children }: { children: (current: View) => ComponentChildren }) {
    view = useMergeTool();
    return <>{children(view)}</>;
  }

  beforeEach(() => {
    harness = installToolHarness({ trackIndexedDb: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(
      <Probe>
        {({ workspace }) => (
          <MergeChipBar
            entries={workspace.entries}
            chipListRef={createRef<HTMLUListElement>()}
            onRemove={workspace.onRemove}
            downloadFlow={workspace.downloadFlow}
            prepared={workspace.prepared}
            fileName={workspace.fileName}
            detail={workspace.detail}
            t={t}
            rating={null}
          />
        )}
      </Probe>,
      container,
    ));
  });
  afterEach(async () => {
    act(() => render(null, container));
    container.remove();
    // The hand-off intake's IndexedDB read must end while the DOM still exists.
    await harness.settle();
    harness.restore();
  });

  const names = () => view.workspace.entries.map((entry) => entry.file.name);
  const addAndRead = async (files: File[]) => {
    await act(async () => { view.base.onFilesAdded(files); });
    await waitUntil(() => view.workspace.entries.length === files.length && view.workspace.entries.every((entry) => entry.pageCount !== null || entry.error));
  };
  const twoPages = (name: string) => pagesPdf([100, 100], name);
  const quiet = () => container.querySelector('[data-chip-bar] [data-quiet-download]');

  it('renders no quiet Download for one file', async () => {
    await addAndRead([await twoPages('a.pdf')]);
    expect(quiet()).toBeNull();
  });

  it('puts a quiet Download in the sticky bar that matches the main link once the merge is ready', async () => {
    await addAndRead([await twoPages('a.pdf'), await twoPages('b.pdf')]);
    // As a hover on Download asks for the output at once.
    act(() => view.workspace.prepared.prepareNow());
    await waitUntil(() => expect(quiet()?.getAttribute('href')).toBeTruthy());
    const link = quiet() as HTMLAnchorElement;
    expect(link.textContent).toContain('Download');
    expect(link.getAttribute('href')).toBe(view.workspace.prepared.url);
    expect(link.getAttribute('download')).toBe('merged_a.pdf');
    expect(harness.blobForUrl(link.getAttribute('href'))?.type).toBe('application/pdf');
  });

  it('lists a chip per file with its page count, a lock for a protected one, and removes a file by its remove button', async () => {
    await addAndRead([await twoPages('one.pdf'), lockedFile(), await twoPages('three.pdf')]);
    const lockedId = view.workspace.entries[1].id;
    const chipRow = container.querySelector('[data-testid="chip-row"]') as HTMLElement;
    expect(chipRow.querySelectorAll('li')).toHaveLength(3);
    expect(chipRow.querySelectorAll('[data-testid="chip-pages"]')[0].textContent).toBe('2');
    const lockedChip = chipRow.querySelector('li[data-locked]') as HTMLElement;
    expect(lockedChip.querySelector('[data-testid="chip-pages"]')?.textContent).toBe('This PDF is protected');
    const remove = chipRow.querySelector('button[aria-label*="locked.pdf"]') as HTMLButtonElement;
    expect(remove.hasAttribute('data-chip-remove')).toBe(true);
    act(() => { remove.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(names()).toEqual(['one.pdf', 'three.pdf']);
    expect(view.workspace.entries.map((entry) => entry.id)).not.toContain(lockedId);
    expect(chipRow.querySelectorAll('li')).toHaveLength(2);
  });

  it('keeps controls out of the sortable chip row', async () => {
    await addAndRead([await twoPages('a.pdf'), await twoPages('b.pdf')]);
    const chipRow = container.querySelector('[data-testid="chip-row"]') as HTMLElement;
    expect(container.querySelector('[data-merge-file-controls]')).toBeNull();
    expect(chipRow.querySelector('select, input')).toBeNull();
  });
});
