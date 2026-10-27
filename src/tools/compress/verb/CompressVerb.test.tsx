import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import CompressVerb from './CompressVerb.tsx';
// The verb is aria-hidden decoration with no text or roles; its class structure is what the test asserts.
import styles from './CompressVerb.module.css';

function mount(subject: 'page' | 'photo') {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<CompressVerb subject={subject} />, host));
  return host;
}

describe('CompressVerb', () => {
  it('page: text lines, a photo, and a lens holding a second photo (six mosaics)', () => {
    const host = mount('page');
    expect(host.querySelectorAll(`.${styles.ln}`).length).toBe(1);
    expect(host.querySelectorAll(`.${styles.pb}`).length).toBe(2);
    expect(host.querySelectorAll(`.${styles.lz} .${styles.pb}`).length).toBe(1);
    expect(host.querySelectorAll('svg').length).toBe(6);
  });

  it('photo: no text lines, still the photo and its loupe', () => {
    const host = mount('photo');
    expect(host.querySelectorAll(`.${styles.ln}`).length).toBe(0);
    expect(host.querySelectorAll(`.${styles.hd}`).length).toBe(0);
    expect(host.querySelectorAll(`.${styles.pb}`).length).toBe(2);
    expect(host.querySelectorAll('svg').length).toBe(6);
  });

  it('hides the whole stage from assistive tech', () => {
    const host = mount('page');
    expect(host.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });

  it('never carries a style attribute (CSP)', () => {
    expect(mount('page').querySelectorAll('[style]').length).toBe(0);
    expect(mount('photo').querySelectorAll('[style]').length).toBe(0);
  });

  it('has no text', () => {
    expect(mount('page').textContent).toBe('');
    expect(mount('photo').textContent).toBe('');
  });
});
