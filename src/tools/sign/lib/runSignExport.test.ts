// @vitest-environment jsdom
import { h, render } from 'preact';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { englishSignMessages } from '../messages';
import { useLatestRun, type LatestRun } from '#lib/hooks/useLatestRun.ts';
import { PDFDocument } from '@cantoo/pdf-lib';
import { describeSignFailure, runSignExport, type RunSignExportDeps } from './runSignExport.ts';

// The real signer runs on real bytes: a real one-page PDF, garbage that makes it reject, or a real protected file.
const t = englishSignMessages;

async function realPdfBytes(): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
const garbageBytes = (): ArrayBuffer => new TextEncoder().encode('not a pdf').buffer as ArrayBuffer;
const encryptedBytes = (): ArrayBuffer => {
  const buffer = readFileSync(resolve(__dirname, '../../../lib/__fixtures__/encrypted/needs-password.pdf'));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
};
const isPdfBlob = async (blob: Blob) => new TextDecoder().decode(await blob.arrayBuffer()).startsWith('%PDF-');

/** The real useLatestRun, rendered once; its ticket's `settle` is spied through so a test can see it. */
function realRun() {
  let run!: LatestRun;
  function Probe() { run = useLatestRun(() => []); return null; }
  render(h(Probe, null), document.createElement('div'));
  const tickets: { settle: () => void }[] = [];
  const exportRun: LatestRun = {
    begin: () => { const ticket = run.begin(); vi.spyOn(ticket, 'settle'); tickets.push(ticket); return ticket; },
    invalidate: () => run.invalidate(),
  };
  return { exportRun, tickets };
}

async function setup() {
  const { exportRun, tickets } = realRun();
  const lifecycleDispatch = vi.fn();
  const activeExportSpeculativeRef = { current: false };
  const deps: RunSignExportDeps = {
    file: new File(['x'], 'form.pdf'),
    outputName: 'signed_form.pdf',
    fileBytes: await realPdfBytes(),
    elements: [],
    exportRun,
    activeExportSpeculativeRef,
    lifecycleDispatch,
    messages: t,
  };
  return { deps, exportRun, tickets, lifecycleDispatch, activeExportSpeculativeRef };
}

describe('runSignExport', () => {
  it('saves under the typed name, not the source-derived one', async () => {
    const { deps } = await setup();
    const onSigned = vi.fn();
    await runSignExport({ ...deps, outputName: 'My contract.pdf' }, onSigned);
    expect(onSigned).toHaveBeenCalledWith(expect.any(Blob), 'My contract.pdf');
    expect(await isPdfBlob(onSigned.mock.calls[0][0])).toBe(true);
  });

  it('shows the signing state and hands the named result on for a real export', async () => {
    const { deps, lifecycleDispatch, tickets } = await setup();
    const onSigned = vi.fn();
    await runSignExport(deps, onSigned);
    expect(lifecycleDispatch).toHaveBeenCalledWith({ type: 'EXPORT_STARTED', announcement: t.writingSignaturesIntoPdf });
    expect(onSigned).toHaveBeenCalledWith(expect.any(Blob), 'signed_form.pdf');
    expect(await isPdfBlob(onSigned.mock.calls[0][0])).toBe(true);
    expect(tickets[0].settle).toHaveBeenCalled();
  });

  it('stays out of the signing UI for a speculative run, and says nothing when it fails', async () => {
    const { deps, lifecycleDispatch, activeExportSpeculativeRef } = await setup();
    const onSigned = vi.fn();
    await runSignExport({ ...deps, fileBytes: garbageBytes() }, onSigned, { speculative: true });
    expect(activeExportSpeculativeRef.current).toBe(true);
    expect(lifecycleDispatch).not.toHaveBeenCalled();
    expect(onSigned).not.toHaveBeenCalled();
  });

  it('commits nothing once the run has been superseded', async () => {
    const { deps, exportRun, tickets } = await setup();
    const onSigned = vi.fn();
    const run = runSignExport(deps, onSigned);
    exportRun.invalidate();
    await run;
    expect(onSigned).not.toHaveBeenCalled();
    expect(tickets[0].settle).not.toHaveBeenCalled();
  });

  it('turns a failure into the recoverable error state, and a protected file into the unlock state', async () => {
    const { deps, lifecycleDispatch } = await setup();
    await runSignExport({ ...deps, fileBytes: garbageBytes() }, vi.fn());
    expect(lifecycleDispatch).toHaveBeenLastCalledWith({
      type: 'EXPORT_FAILED',
      detail: t.exportGenericFailure,
      announcement: `${t.signingStoppedLabel} ${t.exportGenericFailure}`,
    });

    await runSignExport({ ...deps, fileBytes: encryptedBytes() }, vi.fn());
    expect(lifecycleDispatch).toHaveBeenLastCalledWith({ type: 'EXPORT_NEEDS_UNLOCK', announcement: t.protectedOwnerOnlyTitle });
  });
});

describe('describeSignFailure', () => {
  it('names an unavailable font other than the default, and falls back to the generic line', () => {
    const font = Object.assign(new Error('x'), { name: 'FontUnavailableError', family: 'Rubik' });
    expect(describeSignFailure(font, t)).toContain('Rubik');
    expect(describeSignFailure(Object.assign(new Error('x'), { name: 'FontUnavailableError', family: 'Arimo' }), t)).toBe(t.defaultFontUnavailable);
    expect(describeSignFailure('nope', t)).toBe(t.exportGenericFailure);
  });
});
