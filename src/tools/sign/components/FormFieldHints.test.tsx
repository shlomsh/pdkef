import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import FormFieldHints from './FormFieldHints.tsx';
import styles from './FormFieldHints.module.css';

/**
 * SNG-10 follow-up: `.field-hint-comb` (see the CSS module) grows an open
 * comb's teeth-height region up to the writable strip a person types in.
 * That growth is only correct for an OPEN comb - a BOXED comb's region is
 * already the printed cells (formGrid.js measures the box walls, not
 * teeth), and applying the same class doubled the practice form's ID-number
 * hint upward into the Full name box above it. This pins the class the
 * component picks, per `region.boxed`, rather than the layout the class
 * produces (jsdom has none), and the real-form geometry regression is
 * `useFormFieldRegions.practiceForm.test.tsx`'s job.
 */
describe('FormFieldHints', () => {
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    if (host) { act(() => render(null, host!)); host.remove(); host = null; }
  });

  const box = (extra: Record<string, unknown> = {}) => ({
    pageIndex: 0, left: 8, top: 21, width: 30, height: 2.6, ...extra,
  });

  it('grows an open comb up to the writable strip', () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      render(
        <FormFieldHints regions={[box({ cells: 9, boxed: false })]} kind="comb" pageIndex={0} />,
        host!,
      );
    });
    const hint = host!.querySelector(`.${styles['field-hint']}`);
    expect(hint?.className).toContain(styles['field-hint-comb']);
  });

  it('does not grow a boxed comb: its region is already the cells', () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      render(
        <FormFieldHints regions={[box({ cells: 9, boxed: true })]} kind="comb" pageIndex={0} />,
        host!,
      );
    });
    const hint = host!.querySelector(`.${styles['field-hint']}`);
    expect(hint?.className).not.toContain(styles['field-hint-comb']);
  });

  it('leaves checkbox and cell hints unaffected by the boxed flag', () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    act(() => {
      render(
        <>
          <FormFieldHints regions={[box()]} kind="checkbox" pageIndex={0} />
          <FormFieldHints regions={[box()]} kind="cell" pageIndex={0} />
        </>,
        host!,
      );
    });
    const hints = host!.querySelectorAll(`.${styles['field-hint']}`);
    expect(hints[0]?.className).toContain(styles['field-hint-checkbox']);
    expect(hints[1]?.className).toContain(styles['field-hint-cell']);
  });
});
