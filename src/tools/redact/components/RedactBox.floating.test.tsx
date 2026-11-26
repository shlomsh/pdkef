import type { RedactBoxElement } from '../lib/redactElements.ts';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi } from 'vitest';

vi.mock('#editor-ui/hooks/visualViewportClamp.ts', { spy: true });

vi.mock('@floating-ui/react', { spy: true });

import { flip } from '@floating-ui/react';
import visualViewportClamp from '#editor-ui/hooks/visualViewportClamp.ts';
import RedactBox, { BOX_TOOLBAR_GAP } from './RedactBox.tsx';

const EL: RedactBoxElement = { id: 'a', type: 'blackout', left: 10, top: 10, width: 30, height: 10, pageIndex: 0 };

describe('RedactBox floating middleware options (RED-53)', () => {
  it('reserves the gap vertically only, and tells the viewport clamp about it', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const wrapper = document.createElement('div');
    act(() => render(
      <RedactBox el={EL} isSelected={true} pointer={{ onSelect: () => {}, onChange: () => {}, getPageWrapper: () => wrapper, onHoverEnter: () => {}, onHoverLeave: () => {} }}
        actions={{ onDelete: () => {}, onDuplicate: () => {}, onChangeStrength: () => {} }}
        color={{ onPick: () => {}, onMatchPage: () => {}, eyedropping: false, onToggleEyedropper: () => {} }} />,
      container,
    ));
    expect(visualViewportClamp).toHaveBeenCalledWith(expect.objectContaining({ mainAxisGap: BOX_TOOLBAR_GAP }));
    const flipOpts = vi.mocked(flip).mock.calls[0][0] as { padding: object };
    expect(flipOpts.padding).toEqual({ top: BOX_TOOLBAR_GAP, bottom: BOX_TOOLBAR_GAP });
    expect(flipOpts.padding).not.toHaveProperty('left');
    expect(flipOpts.padding).not.toHaveProperty('right');
    act(() => render(null, container));
    container.remove();
  });
});
