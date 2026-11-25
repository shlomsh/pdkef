import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderComparePreview } from '#lib/pdf/thumbnails.js';
import { unlockPdf } from './lib/security.js';
import { BYTES, realFile, useSecurityTool, waitUntil } from './components/securityTool.test-helper.tsx';

vi.mock('#lib/pdf/thumbnails.js', { spy: true });
vi.mock('./lib/security.js', { spy: true });

// A real owner-only file the check opens, but pdf-lib refuses (its "%PDF" header is broken) and whose page count
// is zeroed, so the preview cannot render it either.
const damagedOwnerOnly = () => {
  const bytes = BYTES['owner-restricted'].slice();
  bytes[1] = 0x58;
  const at = new TextDecoder('latin1').decode(bytes).indexOf('/Count 3');
  bytes[at + '/Count '.length] = '0'.charCodeAt(0);
  return new File([bytes], 'test.pdf', { type: 'application/pdf' });
};

describe('PdfSecurityTool page preview', () => {
  const s = useSecurityTool();
  const previewSection = () => s.container.querySelector('[data-security-preview]');
  const previewImage = () => s.container.querySelector('[data-security-preview] img');

  beforeEach(() => {
    vi.mocked(renderComparePreview).mockClear();
  });

  it('shows a Locked placeholder, with no render attempted, for a file that needs a password', async () => {
    s.mount();
    await s.load(realFile('needs-password'));
    await s.drain();
    expect(previewSection()).not.toBeNull();
    expect(s.tag()).toBe('Locked');
    expect(previewImage()).toBeNull();
    expect(renderComparePreview).not.toHaveBeenCalled();
  });

  it('adds no second report for the preview when the run already failed for the same file', async () => {
    const file = damagedOwnerOnly();
    const read = file.arrayBuffer.bind(file);
    const previewRead = Promise.withResolvers<void>();
    const previewGate = Promise.withResolvers<void>();
    const unlockIsReading = () => vi.mocked(unlockPdf).mock.results.at(-1)?.type === 'incomplete';
    let reads = 0;
    file.arrayBuffer = async () => {
      reads += 1;
      if (reads > 1 && !unlockIsReading()) {
        if (vi.mocked(renderComparePreview).mock.calls.length > 0) previewRead.resolve();
        await previewGate.promise;
      }
      return read();
    };
    s.mount();
    await s.pick(file);
    await previewRead.promise;
    await waitUntil(() => expect(s.text()).toContain('This file could not be unlocked. It may be damaged.'));
    const renderings = vi.mocked(renderComparePreview).mock.results.map((result) => result.value);
    previewGate.resolve();
    expect(renderings.length).toBeGreaterThan(0);
    expect((await Promise.allSettled(renderings)).map((result) => result.status)).not.toContain('fulfilled');
    await s.drain();
    await s.harness.flush();
    expect(s.harness.reports()).toHaveLength(1);
    expect(s.harness.reports()[0]).toMatchObject({ area: 'pdf_tool_run', step: 'unlock' });
  });
});
