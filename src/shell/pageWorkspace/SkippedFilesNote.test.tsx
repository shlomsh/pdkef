import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import SkippedFilesNote from './SkippedFilesNote.tsx';

const messages = { skippedOne: 'Skipped "{name}" - not a PDF.', skippedMany: 'Skipped {count} files - not PDFs.' };

describe('SkippedFilesNote', () => {
  let container: HTMLElement;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });
  const mount = (names: string[], dir: 'ltr' | 'rtl' = 'ltr') => {
    act(() => render(<SkippedFilesNote names={names} messages={messages} dir={dir} />, container));
    return container.querySelector('[role="status"]');
  };

  it('names a single skipped file', () => {
    expect(mount(['notes.txt'])?.textContent).toBe('Skipped "notes.txt" - not a PDF.');
  });

  it('counts several skipped files instead of naming them', () => {
    const note = mount(['a.txt', 'b.txt', 'c.docx']);
    expect(note?.textContent).toBe('Skipped 3 files - not PDFs.');
    expect(note?.textContent).not.toContain('a.txt');
  });

  it('renders nothing when nothing was skipped', () => {
    expect(mount([])).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('isolates the name on a right-to-left page', () => {
    expect(mount(['2025-notes.txt'], 'rtl')?.textContent).toContain('⁨2025-notes.txt⁩');
  });
});
