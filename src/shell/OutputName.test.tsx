import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OutputName from './OutputName.tsx';
import styles from './OutputName.module.css';

describe('OutputName', () => {
  let container: HTMLElement;
  afterEach(() => {
    render(null, container);
    container.remove();
  });

  function mount(onRename = vi.fn(), extension?: string) {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<OutputName name="merged_a" extension={extension} label="File name, editable" onRename={onRename} />, container));
    return onRename;
  }
  const nameEl = () => container.querySelector(`.${styles.name}`) as HTMLElement;
  const begin = () => act(async () => { nameEl().dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  const type = (text: string) => act(async () => { nameEl().textContent = text; });
  const key = (k: string) => act(async () => {
    nameEl().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  });

  it('keeps ".pdf" outside the editable span, inside one bdi', () => {
    mount();
    expect(nameEl().getAttribute('contenteditable')).toBe('false');
    expect(nameEl().textContent).toBe('merged_a');
    const ext = container.querySelector(`.${styles['doc-heading-ext']}`);
    expect(ext?.textContent).toBe('.pdf');
    expect(nameEl().closest('bdi')).toBe(ext?.closest('bdi'));
  });

  it('click to edit, Enter commits through onRename', async () => {
    const onRename = mount();
    await begin();
    expect(nameEl().getAttribute('contenteditable')).not.toBe('false');
    expect(nameEl().getAttribute('role')).toBe('textbox');
    await type('March invoices');
    await key('Enter');
    expect(onRename).toHaveBeenCalledWith('March invoices');
    expect(nameEl().getAttribute('contenteditable')).toBe('false');
  });

  it.each([
    ['x.pdf', 'x'],
    ['Notes.PDF', 'Notes'],
    ['a.pdf.pdf', 'a.pdf'],
    ['pdf', 'pdf'],
    ['.pdf', ''],
  ])('a typed extension is not doubled: "%s" commits as "%s"', async (typed, expected) => {
    const onRename = mount();
    await begin();
    await type(typed);
    await key('Enter');
    expect(onRename).toHaveBeenCalledWith(expected);
  });

  it('strips the extension prop, not ".pdf", when it differs', async () => {
    const onRename = mount(vi.fn(), '.png');
    await begin();
    await type('photo.PNG');
    await key('Enter');
    expect(onRename).toHaveBeenCalledWith('photo');
    await begin();
    await type('doc.pdf');
    await key('Enter');
    expect(onRename).toHaveBeenLastCalledWith('doc.pdf');
  });

  it('Escape reverts without calling onRename', async () => {
    const onRename = mount();
    await begin();
    await type('Something else');
    await key('Escape');
    expect(onRename).not.toHaveBeenCalled();
    expect(nameEl().textContent).toBe('merged_a');
    expect(nameEl().getAttribute('contenteditable')).toBe('false');
  });

  it('an empty commit reverts to the given name and reports an empty string', async () => {
    const onRename = mount();
    await begin();
    await type('  / ');
    await key('Enter');
    expect(onRename).toHaveBeenCalledWith('');
    expect(nameEl().textContent).toBe('merged_a');
  });

  it('shows a non-editable prefix before the name', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<OutputName prefix="extracted_" name="a" label="x" onRename={() => {}} />, container));
    expect(container.textContent).toBe('extracted_a.pdf');
    expect(nameEl().textContent).toBe('a');
  });

  // Outside the isolate, a Hebrew page laid the prefix out on the far side of
  // the name: "num-3.pdf_extracted" for extracted_num-3.pdf (2026-10-22).
  it('keeps the prefix inside the file name isolate, so RTL pages read it in order', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<OutputName prefix="extracted_" name="num-3" label="x" onRename={() => {}} />, container));
    expect(container.querySelector('bdi')?.textContent).toBe('extracted_num-3.pdf');
  });

  // Cut at the end, "...itc10" lost the part that tells two merges apart.
  it('cuts a long name in the middle at rest and shows the full name while editing', async () => {
    const long = 'merged_redacted_signed_Service_Pages_Income_tax_annual-report-2024_itc1040 (final) (3)';
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<OutputName name={long} label="x" onRename={() => {}} />, container));
    expect(nameEl().querySelector(`.${styles['name-tail']}`)?.textContent).toBe(long.slice(-20));
    expect(nameEl().textContent).toBe(long);
    await begin();
    expect(nameEl().querySelector(`.${styles['name-tail']}`)).toBeNull();
    expect(nameEl().textContent).toBe(long);
  });

  // Playwright selects all right after the click: the full name and the
  // selection must be in place by the next event, not in a passive effect.
  it('has the full name selected before passive effects run', async () => {
    const long = 'merged_redacted_signed_Service_Pages_Income_tax_annual-report-2024_itc1040 (final) (3)';
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<OutputName name={long} label="x" onRename={() => {}} />, container));
    nameEl().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();
    expect(nameEl().childNodes.length).toBe(1);
    expect(nameEl().firstChild?.textContent).toBe(long);
    expect(window.getSelection()?.toString()).toBe(long);
  });
});
