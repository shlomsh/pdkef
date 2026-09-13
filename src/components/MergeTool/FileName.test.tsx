import { describe, expect, it } from 'vitest';
import { render } from 'preact';
import FileName, { splitFileName } from './FileName.tsx';

describe('FileName (Direction A, wave 5)', () => {
  it('keeps the form number and the extension in the tail of a Hebrew name', () => {
    const { head, tail } = splitFileName('דוח מס הכנסה 2025 טופס 1301.pdf');
    expect(tail).toBe(' 1301.pdf');
    expect(head + tail).toBe('דוח מס הכנסה 2025 טופס 1301.pdf');
  });

  it('leaves a short name whole and drops the extension when asked', () => {
    expect(splitFileName('Note.pdf')).toEqual({ head: 'Note.pdf', tail: '' });
    expect(splitFileName('Note.pdf', { extension: false })).toEqual({ head: 'Note', tail: '' });
    expect(splitFileName('Contract draft (signed).pdf', { extension: false })).toEqual({ head: 'Contract draft (si', tail: 'gned)' });
  });

  it('renders dir="auto" on the container, the full name as its title, and both halves', () => {
    const container = document.createElement('div');
    render(<FileName name="Service_Pages_Income_tax_annual-report-2024_itc101 (3).pdf" />, container);
    const name = container.firstElementChild as HTMLElement;
    expect(name.getAttribute('dir')).toBe('auto');
    expect(name.getAttribute('title')).toBe('Service_Pages_Income_tax_annual-report-2024_itc101 (3).pdf');
    expect(name.children).toHaveLength(2);
    expect(name.textContent).toBe('Service_Pages_Income_tax_annual-report-2024_itc101 (3).pdf');
  });
});
