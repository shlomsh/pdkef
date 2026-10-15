import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CompressStrip from './CompressStrip';
import { ToolShellContext } from '../../../shell/ToolShell';

describe('CompressStrip', () => {
  let container: HTMLDivElement;
  const requestReplace = vi.fn();

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    requestReplace.mockClear();
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });

  const mount = (props: Partial<Parameters<typeof CompressStrip>[0]> = {}) => {
    const file = new File(['%PDF-1.4'], 'report.pdf', { type: 'application/pdf' });
    act(() => {
      render(
        <ToolShellContext.Provider
          value={{ requestReplace, requestClear: vi.fn(), fileLabel: 'report.pdf', fileMeta: '', file }}
        >
          <CompressStrip
            file={file}
            dir="ltr"
            originalLabel="843 KB"
            resultLabel={null}
            processing={false}
            processingLabel="Compressing…"
            savedLabel={null}
            {...props}
          />
        </ToolShellContext.Provider>,
        container,
      );
    });
  };

  const sizes = () => container.querySelector('[data-compress-sizes]')!;

  it('renders the name with dir=auto', () => {
    mount();
    const name = container.querySelector('[dir="auto"]')!;
    expect(name.textContent).toBe('report.pdf');
    expect(name.getAttribute('title')).toBe('report.pdf');
  });

  it('shows before, arrow, after and the tag', () => {
    mount({ resultLabel: '212 KB', savedLabel: '75% smaller' });
    expect(sizes().textContent).toContain('843 KB');
    expect(sizes().textContent).toContain('→');
    expect(sizes().textContent).toContain('212 KB');
    expect(sizes().textContent).toContain('75% smaller');
  });

  it('shows the processing label and no tag while processing', () => {
    mount({ processing: true, resultLabel: '212 KB', savedLabel: '75% smaller' });
    expect(sizes().textContent).toContain('Compressing…');
    expect(sizes().textContent).not.toContain('212 KB');
    expect(sizes().textContent).not.toContain('75% smaller');
  });

  it('shows only the original with no result', () => {
    mount();
    expect(sizes().textContent).toBe('843 KB');
  });

  it('uses a left arrow in RTL', () => {
    mount({ dir: 'rtl', resultLabel: '212 KB' });
    expect(sizes().textContent).toContain('←');
    expect(sizes().textContent).not.toContain('→');
  });

  it('always renders the note slot', () => {
    mount();
    expect(container.querySelector('[data-compress-note]')).not.toBeNull();
    mount({ note: 'Saved 600 KB' });
    expect(container.querySelector('[data-compress-note]')!.textContent).toBe('Saved 600 KB');
  });

  it('Replace calls requestReplace', () => {
    mount();
    const button = container.querySelector('button')!;
    expect(button.textContent).toBe('Replace');
    act(() => button.click());
    expect(requestReplace).toHaveBeenCalledTimes(1);
  });
});
