import { describe, expect, it, vi } from 'vitest';
import Sortable from 'sortablejs';
import PdfScanTool from './PdfScanTool.tsx';
import * as pipeline from './lib/scanPipeline.ts';
import * as flatten from './lib/flattenAnimation.ts';
import { installBrowserToolHarness } from '../../test/harness/browserToolHarness.ts';
import { answerNetwork } from '../../test/support/network.browser.ts';
import { until } from '../../test/support/until.js';
import { photoOfPage, useScanSuite } from '../../test/support/scanTool.browser.tsx';

vi.mock('./lib/scanPipeline.ts', { spy: true });
vi.mock('./lib/flattenAnimation.ts', { spy: true });
const realPipeline = await vi.importActual<typeof import('./lib/scanPipeline.ts')>('./lib/scanPipeline.ts');

answerNetwork();

describe('PdfScanTool on a phone (SCAN-13)', () => {
  const suite = useScanSuite({ Tool: PdfScanTool, installToolHarness: installBrowserToolHarness, pipeline: { spy: pipeline, real: realPipeline } });
  const { s, mount, pick, pagesMade, openPage, openCorners, useCorners, tableTiles, viewer, click, done, byText } = suite;

  it('renders the phone table and none of the workspace, binds hold and drag to its grid, opens a page over it, lands the flatten on the current page, picks more pages and clears all', async () => {
    const create = vi.spyOn(Sortable, 'create');
    mount();
    await pick([await photoOfPage('a.jpg'), await photoOfPage('b.jpg')]);
    await pagesMade(2);
    expect(tableTiles()).toHaveLength(2);
    expect(s.container.querySelector('[data-clear-all]')).not.toBeNull();
    expect(s.container.querySelector('[data-rail]')).toBeNull();
    expect(create.mock.calls.at(-1)?.[0]).toBe(tableTiles()[0].closest('ul'));
    await openPage(2);
    expect(viewer().querySelector('[data-page-heading]').textContent).toContain('Page 2 of 2');
    expect(tableTiles()).toHaveLength(2);
    expect(s.container.querySelector('[data-rail]')).toBeNull();
    await click(viewer().querySelector('[data-page-done]'), 'Done');
    await until(() => viewer() === null);
    expect(viewer()).toBeNull();
    await openCorners(2);
    vi.mocked(flatten.playFlatten).mockClear();
    await useCorners();
    await until(() => s.container.querySelector('[data-flatten]') !== null);
    const target = vi.mocked(flatten.playFlatten).mock.calls.at(-1)?.[2];
    expect(target).toBeInstanceOf(HTMLElement);
    expect(target.closest('[data-current]')).not.toBeNull();
    await until(() => s.container.querySelector('[data-flatten]') === null);
    await done();
    await until(() => viewer() === null);
    const clicked = vi.spyOn(HTMLInputElement.prototype, 'click');
    await click(s.container.querySelector('[data-add-pick]') as HTMLElement, 'the pick-more button');
    expect(clicked.mock.contexts).toEqual([s.container.querySelector('input[type="file"]:not([capture])')]);
    await click(s.container.querySelector('[data-clear-all]') as HTMLElement, 'the clear all control');
    await until(() => s.container.querySelector('dialog[open] #confirm-clear-title') !== null);
    await click(byText('Clear all').at(-1), 'Clear all');
    await until(() => s.container.querySelector('[data-empty-state]') !== null);
    expect(tableTiles()).toHaveLength(0);
  });
});
