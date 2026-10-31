import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPageGeometry } from '#editor/geometry/coords.ts';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import { useTurnedPages } from './useTurnedPages.ts';

const geometry = createPageGeometry({ cropBox: { x: 0, y: 0, width: 612, height: 792 } });
const rect = (width: number) => ({ width, height: 10, top: 0, left: 0, right: width, bottom: 10, x: 0, y: 0, toJSON: () => ({}) });

describe('useTurnedPages - the Rotate press measures the page\'s text', () => {
  let host: HTMLDivElement;
  afterEach(() => { render(null, host); host.remove(); });

  it('passes each text\'s rendered width, in page-width percent, in the ROTATE_PAGE payload', () => {
    host = document.createElement('div');
    document.body.append(host);
    host.innerHTML = `
      <div data-sign-page-surface="0">
        <div data-editor-text data-editor-element-id="t1"></div>
        <div data-editor-element-id="sig"></div>
      </div>`;
    const bounds = new Map<Element, number>([
      [host.querySelector('[data-sign-page-surface]')!, 500],
      [host.querySelector('[data-editor-text]')!, 100],
    ]);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return rect(bounds.get(this) ?? 0) as DOMRect;
    });
    const dispatch = vi.fn();
    let props: ReturnType<typeof useTurnedPages>;
    function Harness() {
      props = useTurnedPages({
        filePageSizes: [geometry], fileFormRegions: { combs: [], checkboxes: [], cells: [] } as never,
        pageTurns: {}, dispatch, announce: vi.fn(), t: englishSignMessages,
      });
      return null;
    }
    act(() => { render(<Harness />, host); });
    act(() => { props!.rotateProps(0).onRotate(); });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0].payload.textWidths).toEqual({ t1: 20 });
    vi.restoreAllMocks();
  });
});
