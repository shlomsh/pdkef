import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MergeHints from './MergeHints.tsx';
import { englishMergeMessages, hebrewMergeMessages, type MergeMessages } from '../messages.ts';

describe('MergeHints', () => {
  let container: HTMLElement;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });

  const pdf = (name: string) => new File(['%PDF-1.4'], name, { type: 'application/pdf' });
  const mount = (props: { rejectedFiles?: string[]; duplicates?: File[]; onAddAnyway?: (files: File[]) => void; t?: MergeMessages }) => {
    act(() => render(
      <MergeHints rejectedFiles={props.rejectedFiles ?? []} duplicates={props.duplicates ?? []} onAddAnyway={props.onAddAnyway ?? (() => {})} t={props.t ?? englishMergeMessages} />,
      container,
    ));
    return Array.from(container.querySelectorAll('[role="status"]'));
  };

  it('says nothing when nothing was skipped or repeated', () => {
    expect(mount({})).toHaveLength(0);
  });

  it('counts several skipped files and names a single one', () => {
    expect(mount({ rejectedFiles: ['report.docx', 'notes.txt'] })[0].textContent).toContain('Skipped 2 files');
    expect(mount({ rejectedFiles: ['notes.txt'] })[0].textContent).toBe('Skipped "notes.txt" - not a PDF or a JPEG or PNG photo.');
  });

  it('names the repeated file and adds it anyway on request', () => {
    const duplicate = pdf('dup.pdf');
    const onAddAnyway = vi.fn();
    const [status] = mount({ duplicates: [duplicate], onAddAnyway });
    expect(status.textContent).toContain('"dup.pdf" is already in the list');
    act(() => (status.querySelector('button') as HTMLButtonElement).click());
    expect(onAddAnyway).toHaveBeenCalledTimes(1);
    expect(onAddAnyway).toHaveBeenCalledWith([duplicate]);
  });

  it('isolates the repeated file name in a Hebrew sentence', () => {
    const [status] = mount({ duplicates: [pdf('2025-dup.pdf')], t: hebrewMergeMessages });
    expect(status.textContent).toContain('⁨2025-dup.pdf⁩');
  });

  it('isolates the skipped file name in a Hebrew sentence', () => {
    const [status] = mount({ rejectedFiles: ['2025-notes.txt'], t: hebrewMergeMessages });
    expect(status.textContent).toContain('⁨2025-notes.txt⁩');
  });
});
