import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'preact';
import FileName, { splitFileName } from './FileName.tsx';

describe('FileName (Direction A, wave 5)', () => {
  it('keeps the form number and the extension in the tail of a Hebrew name', () => {
    const { head, tail, extension } = splitFileName('דוח מס הכנסה 2025 טופס 1301.pdf');
    expect(tail + extension).toBe(' 1301.pdf');
    expect(head + tail + extension).toBe('דוח מס הכנסה 2025 טופס 1301.pdf');
  });

  it('leaves a short name whole and drops the extension when asked', () => {
    expect(splitFileName('Note.pdf')).toEqual({ head: 'Note', tail: '', extension: '.pdf' });
    expect(splitFileName('Note.pdf', { extension: false })).toEqual({ head: 'Note', tail: '', extension: '' });
    expect(splitFileName('Contract draft (signed).pdf', { extension: false })).toEqual({ head: 'Contract draft (signed)', tail: '', extension: '' });
  });

  function mount(name: string) {
    const container = document.createElement('div');
    render(<FileName name={name} />, container);
    return container.firstElementChild as HTMLElement;
  }

  describe('on a left-to-right page', () => {
    it('keeps one left-to-right line: the name in its own direction, then the extension', () => {
      const name = mount('Service_Pages_Income_tax_annual-report-2024_itc101 (3).pdf');
      expect(name.getAttribute('dir')).toBe('ltr');
      expect(name.getAttribute('title')).toBe('Service_Pages_Income_tax_annual-report-2024_itc101 (3).pdf');
      expect(name.textContent).toBe('Service_Pages_Income_tax_annual-report-2024_itc101 (3).pdf');
      const [stem, extension] = [...name.children];
      expect(stem.getAttribute('dir')).toBe('auto');
      expect(stem.children).toHaveLength(2);
      expect(extension.textContent).toBe('.pdf');
    });

    it('keeps the extension apart from a short Hebrew name too', () => {
      const name = mount('טופס.pdf');
      expect(name.children[0].textContent).toBe('טופס');
      expect(name.children[1].textContent).toBe('.pdf');
    });

    it('adds no extension part to a name without one', () => {
      expect(mount('3 files').children).toHaveLength(1);
    });
  });

  describe('on a right-to-left page', () => {
    afterEach(() => document.documentElement.removeAttribute('dir'));

    it('takes its direction from the name, with the extension in the last run', () => {
      document.documentElement.dir = 'rtl';
      const name = mount('דוח מס הכנסה 2025 טופס 1301.pdf');
      expect(name.getAttribute('dir')).toBe('auto');
      expect(name.querySelectorAll('[dir]')).toHaveLength(0);
      expect(name.children).toHaveLength(1);
      const [head, tail] = [...name.children[0].children];
      expect(head.textContent).toBe('דוח מס הכנסה 2025 טופס');
      expect(tail.textContent).toBe(' 1301.pdf');
    });

    it('leaves a short name whole', () => {
      document.documentElement.dir = 'rtl';
      expect(mount('טופס 1.pdf').children[0].children).toHaveLength(1);
    });
  });
});
