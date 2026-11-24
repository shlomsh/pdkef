// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ResultSheet from './ResultSheet.tsx';
import { usePreparedOutput, type Built } from '#lib/output/usePreparedOutput.ts';
import { useDownloadFlow } from '#shell/pageWorkspace/useDownloadFlow.ts';
import { compressHandoffTools } from '../lib/handoffs.ts';
import { formatBytes } from '../lib/resultView.ts';
import { englishCompressMessages } from '../messages';
import { drainPromises } from '../../../test/support/drainPromises.ts';
import { waitUntil } from '../../../test/support/waitUntil.ts';

const t = englishCompressMessages;
const FAST_QUIET = { baseMs: 5, stepMs: 0, maxMs: 5, burstWindowMs: 1 };
const OUT_BYTES = 120_000;

const built = async (): Promise<Built> => ({ blob: new Blob([new Uint8Array(OUT_BYTES)], { type: 'application/pdf' }), pageCount: 0 });

interface Case {
  kind?: 'pdf' | 'image';
  shown?: boolean;
  build?: () => Promise<Built>;
  announce?: (message: string) => void;
  warmBuild?: () => void;
  retry?: () => void;
}

function Sheet({ c }: { c: Case }) {
  const prepared = usePreparedOutput({ key: 'one', build: c.build ?? built, quietPolicy: FAST_QUIET });
  const flow = useDownloadFlow({
    from: 'compress',
    prepared,
    fileName: 'doc-compressed.pdf',
    blocked: prepared.status === 'error' ? 'error' : null,
    announce: c.announce ?? (() => {}),
    messages: { ready: t.readyAnnouncement, shared: t.sharedSuccessfully, canceled: t.sharingCanceled, shareError: t.shareError },
  });
  return (
    <ResultSheet
      t={t}
      flow={flow}
      prepared={prepared}
      fileName="doc-compressed.pdf"
      detail={formatBytes(OUT_BYTES)}
      handoffTools={compressHandoffTools(c.kind ?? 'pdf')}
      shown={c.shown ?? true}
      warmBuild={c.warmBuild ?? (() => {})}
      retry={c.retry ?? (() => {})}
    />
  );
}

let host: HTMLElement | null = null;
afterEach(() => {
  if (host) {
    act(() => render(null, host!));
    host.remove();
    host = null;
  }
});

function mountSheet(c: Case) {
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<Sheet c={c} />, host!));
}
const download = () => host!.querySelector('[data-result-action] a[data-state]') as HTMLAnchorElement | null;
const buttons = () => Array.from(host!.querySelectorAll('[data-result-action] button')).map((b) => b.textContent!.trim());
const settled = () => waitUntil(() => download()?.getAttribute('data-state') === 'ready' && download()!.hasAttribute('href'));

describe('ResultSheet', () => {
  it('a smaller result still has Download, with its size on a second line and no percent', async () => {
    mountSheet({});
    await settled();
    expect(download()!.textContent).toContain(formatBytes(OUT_BYTES));
    expect(download()!.textContent).not.toContain('smaller');
    expect(download()!.getAttribute('download')).toBe('doc-compressed.pdf');
  });

  it('a PDF finish offers Sign and Merge after Share, and never Compress', async () => {
    mountSheet({});
    await settled();
    expect(buttons()).toEqual(['Sign', 'Merge']);
    expect(buttons().some((label) => label.startsWith('Compress'))).toBe(false);
  });

  it('an image finish has no hand-off to another tool', async () => {
    mountSheet({ kind: 'image' });
    await settled();
    expect(buttons()).toEqual([]);
  });

  it('offers no Download and no Share when there is no result to deliver', async () => {
    mountSheet({ shown: false });
    await act(async () => { await drainPromises(); });
    expect(download()).toBeNull();
    expect(buttons()).toEqual([]);
    expect(host!.querySelector('[data-result-action]')!.hasAttribute('hidden')).toBe(true);
  });

  it('a failed run shows Try again, which runs once more', async () => {
    const retry = vi.fn();
    mountSheet({ build: () => Promise.reject(new Error('boom')), retry });
    await waitUntil(() => download()?.getAttribute('data-state') === 'error');
    expect(download()!.textContent).toBe('Try again');
    expect(retry).not.toHaveBeenCalled();
    act(() => download()!.click());
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('starts the build at once on pointerdown on Download', async () => {
    const warmBuild = vi.fn();
    mountSheet({ warmBuild });
    await settled();
    // the ready link takes focus on arrival, which already asks for the build
    const before = warmBuild.mock.calls.length;
    act(() => { download()!.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    expect(warmBuild).toHaveBeenCalledTimes(before + 1);
  });

  it('shows the compressing look only after a tap before the build is done, then delivers', async () => {
    const gate = Promise.withResolvers<void>();
    const announce = vi.fn();
    const clicks: boolean[] = [];
    const record = (event: Event) => {
      if ((event.target as Element).closest('[data-result-action] a[data-state]')) clicks.push(event.defaultPrevented);
    };
    mountSheet({ announce, build: async () => { await gate.promise; return built(); } });
    // the build is under way and silent: Download keeps its ready look
    await act(async () => { await drainPromises(); });
    expect(download()!.getAttribute('data-state')).toBe('ready');
    expect(download()!.hasAttribute('aria-busy')).toBe(false);
    document.addEventListener('click', record);
    try {
      act(() => download()!.click());
      expect(download()!.getAttribute('data-state')).toBe('preparing');
      expect(download()!.getAttribute('aria-busy')).toBe('true');
      expect(clicks).toEqual([true]);
      expect(announce).not.toHaveBeenCalled();
      await act(async () => { gate.resolve(); });
      await waitUntil(() => download()?.getAttribute('aria-busy') === null);
      // The shared flow delivers the file itself, so the anchor sees no second click.
      expect(clicks).toEqual([true]);
      expect(announce).toHaveBeenCalledWith(t.readyAnnouncement);
    } finally {
      document.removeEventListener('click', record);
    }
  });
});
