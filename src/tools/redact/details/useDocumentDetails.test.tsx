import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

const traces = { title: 'T' };
vi.mock('./readDetails.ts', () => ({ readDetails: vi.fn(async () => traces) }));

import { useDocumentDetails } from './useDocumentDetails.ts';
import { readDetails } from './readDetails.ts';

let host: HTMLElement | null = null;
afterEach(() => { if (host) { render(null, host); host.remove(); host = null; } });

function Probe({ file, seen }: { file: Blob | null; seen: unknown[] }) {
  seen.push(useDocumentDetails(file));
  return null;
}

describe('useDocumentDetails', () => {
  it('returns null, then the traces once read', async () => {
    const seen: unknown[] = [];
    host = document.createElement('div');
    const file = new Blob(['x']);
    await act(async () => { render(<Probe file={file} seen={seen} />, host!); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(seen[0]).toBeNull();
    expect(seen[seen.length - 1]).toBe(traces);
    expect(readDetails).toHaveBeenCalledWith(file);
  });

  it('stays null with no file', async () => {
    const seen: unknown[] = [];
    host = document.createElement('div');
    await act(async () => { render(<Probe file={null} seen={seen} />, host!); });
    expect(seen.every((value) => value === null)).toBe(true);
  });
});
