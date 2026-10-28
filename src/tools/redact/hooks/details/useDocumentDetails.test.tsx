import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/telemetry/errorReport.ts', () => ({ reportError: vi.fn() }));
const traces = { title: 'T' };
vi.mock('../../lib/details/readDetails.ts', () => ({ readDetails: vi.fn(async () => traces) }));

import { useDocumentDetails } from './useDocumentDetails.ts';
import { readDetails } from '../../lib/details/readDetails.ts';
import { reportError } from '#lib/telemetry/errorReport.ts';

let host: HTMLElement | null = null;
afterEach(() => {
  vi.mocked(readDetails).mockClear();
  vi.mocked(reportError).mockClear(); if (host) { render(null, host); host.remove(); host = null; } });

function Probe({ file, opened = true, seen }: { file: ArrayBuffer | null; opened?: boolean; seen: unknown[] }) {
  seen.push(useDocumentDetails(file, opened));
  return null;
}

describe('useDocumentDetails', () => {
  it('returns null, then the traces once read', async () => {
    const seen: unknown[] = [];
    host = document.createElement('div');
    const file = new ArrayBuffer(4);
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

  // RED-64 (ENC-02): a protected file never opens in pdf.js, so it must never reach pdf-lib here.
  it('reads nothing until the document has opened', async () => {
    const seen: unknown[] = [];
    host = document.createElement('div');
    const file = new ArrayBuffer(4);
    await act(async () => { render(<Probe file={file} opened={false} seen={seen} />, host!); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(readDetails).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
    expect(seen.every((value) => value === null)).toBe(true);
    await act(async () => { render(<Probe file={file} opened seen={seen} />, host!); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(readDetails).toHaveBeenCalledWith(file);
  });
});
