import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import PageWorkspace, { workspaceStyles } from './PageWorkspace.tsx';

describe('PageWorkspace', () => {
  let host: HTMLElement | null = null;
  afterEach(() => { act(() => render(null, host!)); host!.remove(); });

  const mount = (props: Record<string, unknown> = {}) => {
    host = document.createElement('div');
    document.body.appendChild(host);
    act(() => render(<PageWorkspace heading={undefined} railContent={<p>rail</p>} {...props}><p>body</p></PageWorkspace>, host!));
    return host;
  };

  it('draws the document header when there is a heading', () => {
    mount({ heading: <h2>file.pdf</h2> });
    expect(host!.querySelector(`.${workspaceStyles['doc-header']}`)).not.toBeNull();
  });

  it('leaves the header row out entirely when there is neither a heading nor a status, so nothing above the body takes space', () => {
    mount({ heading: null, headerStatus: null });
    expect(host!.querySelector(`.${workspaceStyles['doc-header']}`)).toBeNull();
    expect(host!.textContent).toContain('body');
  });
});
