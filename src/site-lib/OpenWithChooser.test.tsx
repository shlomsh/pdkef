import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OpenWithChooser from './OpenWithChooser.tsx';
import { sendHandoff } from '#lib/handoff/sendHandoff.ts';

vi.mock('#lib/handoff/sendHandoff.ts', () => ({ sendHandoff: vi.fn(() => Promise.resolve(true)) }));

type Consumer = (params: { files: { getFile: () => Promise<File> }[] }) => void | Promise<void>;
const launchHost = window as Window & { launchQueue?: { setConsumer: (fn: Consumer) => void } };

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

describe('OpenWithChooser', () => {
  let container: HTMLElement | null = null;
  let consumer: Consumer | null;

  beforeEach(() => {
    vi.clearAllMocks();
    consumer = null;
    launchHost.launchQueue = { setConsumer: (fn) => { consumer = fn; } };
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<OpenWithChooser />, container!));
  });

  afterEach(() => {
    act(() => render(null, container!));
    container!.remove();
    delete launchHost.launchQueue;
  });

  const launch = async (file: File) => {
    await act(async () => { await consumer!({ files: [{ getFile: async () => file }] }); });
  };
  const pdf = (name = 'lease.pdf') => new File(['%PDF-1.7'], name, { type: 'application/pdf' });
  const button = (label: string) => [...container!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(label))!;

  it('shows plain links to both tools until a file arrives', () => {
    const hrefs = [...container!.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining(['/sign/', '/redact/', '/highlight-pdf/', '/scan-to-pdf/', '/compress/']));
    expect(container!.querySelectorAll('button')).toHaveLength(0);
  });

  it('names the launched file and offers Sign and Redact', async () => {
    await launch(pdf());
    expect(container!.textContent).toContain('lease.pdf');
    expect(button('Sign')).toBeTruthy();
    expect(button('Redact')).toBeTruthy();
  });

  it('hands the file to Scan under its own key', async () => {
    await launch(pdf());
    await act(async () => { button('Straighten').click(); });
    await flush();
    expect(vi.mocked(sendHandoff).mock.calls[0][0]).toBe('scan-to-pdf');
  });

  it('hands the file to Redact under its own key', async () => {
    await launch(pdf());
    await act(async () => { button('Redact').click(); });
    await flush();
    expect(sendHandoff).toHaveBeenCalledTimes(1);
    const [target, payload] = vi.mocked(sendHandoff).mock.calls[0];
    expect(target).toBe('redact');
    expect(payload).toMatchObject({ fileName: 'lease.pdf', fileType: 'application/pdf' });
    expect('fileBytes' in payload && payload.fileBytes.byteLength).toBe(8);
  });

  it('hands the file to Sign', async () => {
    await launch(pdf());
    await act(async () => { button('Sign').click(); });
    await flush();
    expect(vi.mocked(sendHandoff).mock.calls[0][0]).toBe('sign');
  });

  it.each([['Highlight', 'highlight-pdf'], ['Compress', 'compress']])('hands the file to %s', async (label, target) => {
    await launch(pdf());
    await act(async () => { button(label).click(); });
    await flush();
    expect(vi.mocked(sendHandoff).mock.calls[0][0]).toBe(target);
  });

  it('keeps the newest launch when a second file arrives before a choice', async () => {
    await launch(pdf('first.pdf'));
    await launch(pdf('second.pdf'));
    expect(container!.textContent).toContain('second.pdf');
    expect(container!.textContent).not.toContain('first.pdf');
  });

  it('ignores a launch with no PDF', async () => {
    await launch(new File(['x'], 'notes.txt', { type: 'text/plain' }));
    expect(container!.querySelectorAll('button')).toHaveLength(0);
  });

  it('says so, and offers a retry, when the hand-off fails', async () => {
    vi.mocked(sendHandoff).mockRejectedValueOnce(new Error('handoff'));
    await launch(pdf());
    await act(async () => { button('Sign').click(); });
    await flush();
    expect(container!.querySelector('[role="alert"]')).toBeTruthy();
    expect(button('Sign').disabled).toBe(false);
  });

  it('sends one hand-off when a second file launches while the first is being handed over', async () => {
    vi.mocked(sendHandoff).mockReturnValueOnce(new Promise(() => {}));
    await launch(pdf('first.pdf'));
    await act(async () => { button('Sign').click(); });
    await flush();
    await launch(pdf('second.pdf'));
    await flush();
    expect(sendHandoff).toHaveBeenCalledTimes(1);
  });

  // DRIVE-11: /drive/ shows the choice while the file is still downloading.
  describe('with a file on its way', () => {
    const show = (file?: File) => act(() => render(<OpenWithChooser file={file} arriving={!file} />, container!));

    it('offers every tool at once, before the file has arrived', () => {
      show();
      expect(container!.querySelectorAll('button')).toHaveLength(5);
      expect(button('Sign').disabled).toBe(false);
      expect(container!.querySelectorAll('a')).toHaveLength(0);
    });

    it('holds an early choice, then hands the file over the moment it arrives', async () => {
      show();
      await act(async () => { button('Redact').click(); });
      await flush();
      expect(sendHandoff).not.toHaveBeenCalled();
      expect(container!.querySelector('[role="status"]')).toBeTruthy();
      expect(button('Sign').disabled).toBe(true);

      show(pdf('late.pdf'));
      await flush();
      expect(sendHandoff).toHaveBeenCalledTimes(1);
      const [target, payload] = vi.mocked(sendHandoff).mock.calls[0];
      expect(target).toBe('redact');
      expect(payload).toMatchObject({ fileName: 'late.pdf' });
    });

    it('names the file once it arrives and waits for a choice', async () => {
      show();
      show(pdf('late.pdf'));
      await flush();
      expect(container!.textContent).toContain('late.pdf');
      expect(sendHandoff).not.toHaveBeenCalled();
    });
  });
});
