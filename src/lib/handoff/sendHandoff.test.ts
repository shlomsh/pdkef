// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { peekHandoff, saveHandoff } from '../drafts/draftStore.ts';
import { holdDraftStore } from '../drafts/heldStore.test-helper.ts';
import { drainPromises } from '../../test/support/drainPromises.ts';

// The real store runs on fake-indexeddb; the spy lets a test see when a save settled.
vi.mock('../drafts/draftStore.ts', { spy: true });

import { sendHandoff } from './sendHandoff.ts';

const bytes = () => new TextEncoder().encode('%PDF-1.7 hand-off').buffer as ArrayBuffer;
const payload = () => ({ fileName: 'a.pdf', fileType: 'application/pdf', fileBytes: bytes() });
const text = (buffer: ArrayBuffer) => new TextDecoder().decode(buffer);

describe('sendHandoff', () => {
  const navigate = vi.fn();
  beforeEach(() => {
    indexedDB = new IDBFactory();
    localStorage.clear();
    vi.mocked(saveHandoff).mockReset();
    navigate.mockReset();
  });

  it('parks the payload under the target, then navigates to the target page', async () => {
    await expect(sendHandoff('compress', payload(), { navigate })).resolves.toBe(true);
    const parked = await peekHandoff('compress');
    expect(parked).toMatchObject({ fileName: 'a.pdf', fileType: 'application/pdf' });
    expect(text((parked as { fileBytes: ArrayBuffer }).fileBytes)).toBe('%PDF-1.7 hand-off');
    expect(navigate).toHaveBeenCalledWith('/compress/');
  });

  it('saves before it navigates', async () => {
    const hold = await holdDraftStore();
    const sent = sendHandoff('sign', payload(), { navigate });
    await drainPromises();
    expect(saveHandoff).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
    await hold.release();
    await expect(sent).resolves.toBe(true);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/sign/');
    expect(await peekHandoff('sign')).not.toBeNull();
  });

  it('files an Edit Pages hand-off under edit-pdf and opens /organize-pdf/', async () => {
    await sendHandoff('edit-pdf', payload(), { navigate });
    expect(vi.mocked(saveHandoff).mock.calls[0][0]).toBe('edit-pdf');
    expect(await peekHandoff('edit-pdf')).not.toBeNull();
    expect(navigate).toHaveBeenCalledWith('/organize-pdf/');
  });

  it('files a Compress Image target under the Compress hand-off key', async () => {
    await sendHandoff('compress-image', payload(), { navigate });
    expect(vi.mocked(saveHandoff).mock.calls[0][0]).toBe('compress');
    expect(await peekHandoff('compress')).not.toBeNull();
    expect(navigate).toHaveBeenCalledWith('/compress-image/');
  });

  it('uses the href it is given instead of the registry page (a locale edition, a query)', async () => {
    await sendHandoff('compress', payload(), { navigate, href: '/he/compress/' });
    expect(navigate).toHaveBeenCalledWith('/he/compress/');
  });

  it('passes a multi-file record and a from through untouched', async () => {
    const multi = { files: [payload(), { ...payload(), fileName: 'b.pdf' }], from: 'redact' };
    await sendHandoff('unlock', multi, { navigate });
    expect(vi.mocked(saveHandoff).mock.calls[0]).toEqual(['unlock', multi]);
    const parked = (await peekHandoff('unlock')) as { files: { fileName: string; fileBytes: ArrayBuffer }[]; from: string };
    expect(parked.from).toBe('redact');
    expect(parked.files.map((f) => f.fileName)).toEqual(['a.pdf', 'b.pdf']);
    expect(parked.files.map((f) => text(f.fileBytes))).toEqual(['%PDF-1.7 hand-off', '%PDF-1.7 hand-off']);
    expect(navigate).toHaveBeenCalledWith('/unlock/');
  });

  it('throws and stays put when the store did not take it', async () => {
    // A function in the payload fails the real write: structured clone refuses it and the store answers false.
    const uncloneable = { ...payload(), fileName: (() => 'a.pdf') as unknown as string };
    await expect(sendHandoff('compress', uncloneable, { navigate })).rejects.toThrow('handoff');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('stays put, resolving false, when proceed() says the run was superseded', async () => {
    await expect(sendHandoff('compress', payload(), { navigate, proceed: () => false })).resolves.toBe(false);
    expect(saveHandoff).toHaveBeenCalled();
    expect(await peekHandoff('compress')).not.toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('falls back to /<target>/ for a target the registry has no page for', async () => {
    await sendHandoff('elsewhere', payload(), { navigate });
    expect(await peekHandoff('elsewhere')).not.toBeNull();
    expect(navigate).toHaveBeenCalledWith('/elsewhere/');
  });
});
