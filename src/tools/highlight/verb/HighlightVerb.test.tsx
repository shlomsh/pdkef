import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import HighlightVerb from './HighlightVerb.tsx';
import styles from './HighlightVerb.module.css';

function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<HighlightVerb />, host));
  return host;
}

describe('HighlightVerb', () => {
  it('draws six lines and two marker strokes', () => {
    const host = mount();
    expect(host.querySelectorAll(`.${styles.line}`).length).toBe(6);
    expect(host.querySelectorAll(`.${styles.mark}`).length).toBe(2);
  });

  it('never carries a style attribute (CSP)', () => {
    const host = mount();
    expect(host.querySelectorAll('[style]').length).toBe(0);
  });
});
