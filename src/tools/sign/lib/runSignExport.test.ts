import { beforeEach, describe, expect, it, vi } from 'vitest';
import { englishSignMessages } from '../messages';
import type { LatestRun } from '#lib/hooks/useLatestRun.ts';
import { describeSignFailure, runSignExport, type RunSignExportDeps } from './runSignExport.ts';

const signPdf = vi.hoisted(() => vi.fn());
vi.mock('./sign.js', () => ({ signPdf }));
vi.mock('#lib/telemetry/errorReport.ts', () => ({ reportError: vi.fn() }));
vi.mock('#lib/telemetry/productAnalytics.ts', () => ({ reportToolLifecycleEvent: vi.fn() }));
vi.mock('#lib/telemetry/actionTrail.ts', () => ({ recordAction: vi.fn() }));

const t = englishSignMessages;

function setup(current = true) {
  const ticket = { isCurrent: vi.fn(() => current), settle: vi.fn() };
  const exportRun: LatestRun = { begin: () => ticket, invalidate: () => false };
  const lifecycleDispatch = vi.fn();
  const activeExportSpeculativeRef = { current: false };
  const deps: RunSignExportDeps = {
    file: new File(['x'], 'form.pdf'),
    fileBytes: null,
    elements: [],
    exportRun,
    activeExportSpeculativeRef,
    lifecycleDispatch,
    messages: t,
  };
  return { deps, ticket, lifecycleDispatch, activeExportSpeculativeRef };
}

describe('runSignExport', () => {
  beforeEach(() => {
    signPdf.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('shows the signing state and hands the named result on for a real export', async () => {
    const blob = new Blob(['pdf']);
    signPdf.mockResolvedValue(blob);
    const { deps, lifecycleDispatch, ticket } = setup();
    const onSigned = vi.fn();
    await runSignExport(deps, onSigned);
    expect(lifecycleDispatch).toHaveBeenCalledWith({ type: 'EXPORT_STARTED', announcement: t.writingSignaturesIntoPdf });
    expect(onSigned).toHaveBeenCalledWith(blob, 'signed_form.pdf');
    expect(ticket.settle).toHaveBeenCalled();
  });

  it('stays out of the signing UI for a speculative run, and says nothing when it fails', async () => {
    const { deps, lifecycleDispatch, activeExportSpeculativeRef } = setup();
    signPdf.mockRejectedValue(new Error('boom'));
    const onSigned = vi.fn();
    await runSignExport(deps, onSigned, { speculative: true });
    expect(activeExportSpeculativeRef.current).toBe(true);
    expect(lifecycleDispatch).not.toHaveBeenCalled();
    expect(onSigned).not.toHaveBeenCalled();
  });

  it('commits nothing once the run has been superseded', async () => {
    signPdf.mockResolvedValue(new Blob(['pdf']));
    const { deps, ticket } = setup(false);
    const onSigned = vi.fn();
    await runSignExport(deps, onSigned);
    expect(onSigned).not.toHaveBeenCalled();
    expect(ticket.settle).not.toHaveBeenCalled();
  });

  it('turns a failure into the recoverable error state, and a protected file into the unlock state', async () => {
    const { deps, lifecycleDispatch } = setup();
    signPdf.mockRejectedValueOnce(new Error('plain failure'));
    await runSignExport(deps, vi.fn());
    expect(lifecycleDispatch).toHaveBeenLastCalledWith({
      type: 'EXPORT_FAILED',
      detail: t.exportGenericFailure,
      announcement: `${t.signingStoppedLabel} ${t.exportGenericFailure}`,
    });

    const encrypted = Object.assign(new Error('x'), { name: 'EncryptedPDFError' });
    signPdf.mockRejectedValueOnce(encrypted);
    await runSignExport(deps, vi.fn());
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
