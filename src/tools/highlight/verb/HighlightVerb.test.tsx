import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import HighlightVerb from './HighlightVerb.tsx';
import styles from './HighlightVerb.module.css';
import { HIGHLIGHT_COLORS } from '#editor/model/highlightColors.ts';

function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<HighlightVerb />, host));
  return host;
}

describe('HighlightVerb', () => {
  it('draws ten lines, three strokes in three palette inks, and a note', () => {
    const host = mount();
    expect(host.querySelectorAll(`.${styles.line}`).length).toBe(10);
    const inks = [...host.querySelectorAll(`.${styles.mark}`)].map((m) => m.getAttribute('fill'));
    expect(inks).toHaveLength(3);
    expect(new Set(inks).size).toBe(3);
    const palette = HIGHLIGHT_COLORS.map((c) => c.hex);
    for (const hex of inks) expect(palette).toContain(hex);
    expect(host.querySelectorAll(`.${styles.note} .${styles.text}`).length).toBe(2);
  });
});
