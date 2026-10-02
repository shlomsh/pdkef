import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi } from 'vitest';

const clampSpy = vi.hoisted(() => vi.fn());
const flipSpy = vi.hoisted(() => vi.fn());

vi.mock('../../editor-ui/hooks/visualViewportClamp.ts', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  default: (opts: unknown) => {
    clampSpy(opts);
    return { name: 'visualViewportClamp', fn: () => ({}) };
  },
}));

vi.mock('@floating-ui/react', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    flip: (opts: unknown) => {
      flipSpy(opts);
      return actual.flip(opts);
    },
  };
});

import RedactBox, { BOX_TOOLBAR_GAP } from './RedactBox.tsx';

const EL = { id: 'a', type: 'blackout', left: 10, top: 10, width: 30, height: 10, page: 0 };

describe('RedactBox floating middleware options (RED-53)', () => {
  it('reserves the gap vertically only, and tells the viewport clamp about it', () => {
    window.matchMedia = ((q: string) => ({
      matches: q.includes('fine'), media: q, addEventListener: () => {}, removeEventListener: () => {},
    })) as any;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const wrapper = document.createElement('div');
    act(() => render(
      <RedactBox el={EL} isSelected={true} onSelect={() => {}} onChange={() => {}}
        getPageWrapper={() => wrapper} onHoverEnter={() => {}} onHoverLeave={() => {}} onDelete={() => {}}
        onPickColor={() => {}} onMatchPage={() => {}} eyedropping={false} onToggleEyedropper={() => {}} onChangeStrength={() => {}} onDuplicate={() => {}} />,
      container,
    ));
    expect(clampSpy).toHaveBeenCalledWith(expect.objectContaining({ mainAxisGap: BOX_TOOLBAR_GAP }));
    const flipOpts = flipSpy.mock.calls[0][0];
    expect(flipOpts.padding).toEqual({ top: BOX_TOOLBAR_GAP, bottom: BOX_TOOLBAR_GAP });
    expect(flipOpts.padding).not.toHaveProperty('left');
    expect(flipOpts.padding).not.toHaveProperty('right');
    act(() => render(null, container));
    container.remove();
  });
});
