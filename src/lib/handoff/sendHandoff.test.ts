import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ saveHandoff: vi.fn() }));
vi.mock('../drafts/draftStore.ts', () => store);

import { sendHandoff } from './sendHandoff.ts';

const payload = { fileName: 'a.pdf', fileType: 'application/pdf', fileBytes: new ArrayBuffer(3) };

describe('sendHandoff', () => {
  const navigate = vi.fn();
  beforeEach(() => {
    store.saveHandoff.mockReset();
    navigate.mockReset();
  });

  it('parks the payload under the target, then navigates to the target page', async () => {
    store.saveHandoff.mockResolvedValue(true);
    await expect(sendHandoff('compress', payload, { navigate })).resolves.toBe(true);
    expect(store.saveHandoff).toHaveBeenCalledWith('compress', payload);
    expect(navigate).toHaveBeenCalledWith('/compress/');
  });

  it('saves before it navigates', async () => {
    const order: string[] = [];
    store.saveHandoff.mockImplementation(async () => { order.push('save'); return true; });
    navigate.mockImplementation(() => { order.push('navigate'); });
    await sendHandoff('sign', payload, { navigate });
    expect(order).toEqual(['save', 'navigate']);
  });

  it('files an Edit Pages hand-off under edit-pdf and opens /organize-pdf/', async () => {
    store.saveHandoff.mockResolvedValue(true);
    await sendHandoff('edit-pdf', payload, { navigate });
    expect(store.saveHandoff.mock.calls[0][0]).toBe('edit-pdf');
    expect(navigate).toHaveBeenCalledWith('/organize-pdf/');
  });

  it('files a Compress Image target under the Compress hand-off key', async () => {
    store.saveHandoff.mockResolvedValue(true);
    await sendHandoff('compress-image', payload, { navigate });
    expect(store.saveHandoff.mock.calls[0][0]).toBe('compress');
    expect(navigate).toHaveBeenCalledWith('/compress-image/');
  });

  it('uses the href it is given instead of the registry page (a locale edition, a query)', async () => {
    store.saveHandoff.mockResolvedValue(true);
    await sendHandoff('compress', payload, { navigate, href: '/he/compress/' });
    expect(navigate).toHaveBeenCalledWith('/he/compress/');
  });

  it('passes a multi-file record and a from through untouched', async () => {
    store.saveHandoff.mockResolvedValue(true);
    const multi = { files: [payload, payload], from: 'redact' };
    await sendHandoff('unlock', multi, { navigate });
    expect(store.saveHandoff).toHaveBeenCalledWith('unlock', multi);
    expect(navigate).toHaveBeenCalledWith('/unlock/');
  });

  it('throws and stays put when the store did not take it', async () => {
    store.saveHandoff.mockResolvedValue(false);
    await expect(sendHandoff('compress', payload, { navigate })).rejects.toThrow('handoff');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('lets a store error through and does not navigate', async () => {
    store.saveHandoff.mockRejectedValue(new Error('boom'));
    await expect(sendHandoff('compress', payload, { navigate })).rejects.toThrow('boom');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('stays put, resolving false, when proceed() says the run was superseded', async () => {
    store.saveHandoff.mockResolvedValue(true);
    await expect(sendHandoff('compress', payload, { navigate, proceed: () => false })).resolves.toBe(false);
    expect(store.saveHandoff).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('falls back to /<target>/ for a target the registry has no page for', async () => {
    store.saveHandoff.mockResolvedValue(true);
    await sendHandoff('elsewhere', payload, { navigate });
    expect(navigate).toHaveBeenCalledWith('/elsewhere/');
  });
});
