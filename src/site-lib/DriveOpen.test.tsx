import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DriveOpen from './DriveOpen.tsx';
import { HttpResponse } from 'msw';
import { answerInTurn, answerNetwork, sentHeaders } from '../test/support/network.ts';
import { requestDriveToken } from './drive/googleToken.ts';
import { remember, savedToken, toGoogle } from './drive/driveSignIn.ts';
import { saveToken } from './drive/driveSession.ts';
import { drainPromises } from '../test/support/drainPromises.ts';
import { waitUntil } from '../test/support/waitUntil.ts';
import { peekHandoff } from '#lib/drafts/draftStore.ts';

// Replaced: Google's sign-in popup (googleToken), which loads Google's script. The Picker and the redirect are
// in DriveOpen.chrome.test.tsx.
// The Drive download is the real driveClient; MSW answers its two requests to googleapis. Everything else
// runs for real: intent, route, saved token and redirect return on the page's own URL and localStorage, the
// chooser, and the hand-off on fake-indexeddb. The spy sees the redirect.
// oxlint-disable-next-line landmines/no-test-doubles -- Forced: Google's sign-in popup cannot open in a test
vi.mock('./drive/googleToken.ts', () => ({ requestDriveToken: vi.fn() }));
vi.mock('./drive/driveSignIn.ts', { spy: true });

const OPEN_WITH = `?state=${encodeURIComponent(JSON.stringify({ ids: ['abc123abcdef'], action: 'open', userId: 'u1' }))}`;
const at = (search: string, hash = '') => history.replaceState(null, '', `/drive/${search}${hash}`);
const saved = (token: string, user?: string) => saveToken(localStorage, token, 3600, Date.now(), user);

answerNetwork();

const meta = (id: string) => `https://www.googleapis.com/drive/v3/files/${id}?fields=name,mimeType&supportsAllDrives=true`;
const media = (id: string) => `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`;
const FILE_META = meta('abc123abcdef');
const FILE_MEDIA = media('abc123abcdef');

type Answer = () => Response | Promise<Response>;
const pdfMeta: Answer = () => HttpResponse.json({ name: 'a.pdf', mimeType: 'application/pdf' });
const pdfBytes: Answer = () => new HttpResponse(new Uint8Array([1, 2, 3, 4]));
const refused: Answer = () => new HttpResponse(null, { status: 401 });

const drive = (...answers: Answer[]) => answerInTurn('get', 'https://www.googleapis.com/drive/v3/files/:id', ...answers);
const downloads = () => drive(pdfMeta, pdfBytes);
const held = () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  return { gate, release };
};
const arrived = (c: HTMLElement) => c.textContent!.includes('a.pdf');
const button = (container: HTMLElement) => container.querySelector<HTMLButtonElement>('button');

const chooserShown = (c: HTMLElement) => c.textContent!.includes('Black out private parts');
const flush = () => act(async () => { await drainPromises(); });

describe('DriveOpen', () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    indexedDB = new IDBFactory();
    localStorage.clear();
    sessionStorage.clear();
    at(OPEN_WITH);
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    vi.restoreAllMocks();
  });

  it('starts one token request and one download when the Google button is tapped twice', async () => {
    let resolveToken!: (value: { ok: true; token: string; expiresInSeconds: number }) => void;
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: the mocked Google popup answers
    vi.mocked(requestDriveToken).mockReturnValue(new Promise((resolve) => { resolveToken = resolve; }));
    const seen = downloads();
    act(() => render(<DriveOpen />, container));
    const button = container.querySelector<HTMLButtonElement>('button')!;

    act(() => { button.click(); button.click(); });
    expect(requestDriveToken).toHaveBeenCalledTimes(1);

    resolveToken({ ok: true, token: 't', expiresInSeconds: 3600 });
    await waitUntil(() => arrived(container));
    expect(seen).toHaveLength(2);
    expect(seen[0].url).toBe(FILE_META);
    expect(seen[1].url).toBe(FILE_MEDIA);
    expect(sentHeaders(seen[0])).toEqual({ authorization: 'Bearer t' });
    expect(chooserShown(container)).toBe(true);
  });

  // DRIVE-10: Open with reuses the sign-in it already has instead of stopping on the button every time.
  it('opens the file straight away with a saved token, no button and no popup', async () => {
    saved('saved', 'u1');
    const seen = downloads();
    act(() => render(<DriveOpen />, container));
    await waitUntil(() => arrived(container));
    expect(seen.map((r) => r.url)).toEqual([FILE_META, FILE_MEDIA]);
    expect(sentHeaders(seen[0])).toEqual({ authorization: 'Bearer saved' });
    expect(sentHeaders(seen[1])).toEqual({ authorization: 'Bearer saved' });
    expect(requestDriveToken).not.toHaveBeenCalled();
    expect(chooserShown(container)).toBe(true);
  });

  it('waits for a tap on the popup route when nothing is saved', async () => {
    const seen = drive();
    act(() => render(<DriveOpen />, container));
    await flush();
    expect(toGoogle).not.toHaveBeenCalled();
    expect(seen).toHaveLength(0);
    expect(button(container)?.textContent).toContain('Sign in with Google');
  });

  it('remembers the token from the popup so the next Open with needs no tap', async () => {
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: the mocked Google popup answers
    vi.mocked(requestDriveToken).mockResolvedValue({ ok: true, token: 'popped', expiresInSeconds: 3599 });
    const seen = downloads();
    act(() => render(<DriveOpen />, container));
    await flush();
    act(() => { button(container)!.click(); });
    await waitUntil(() => arrived(container));
    expect(sentHeaders(seen[0])).toEqual({ authorization: 'Bearer popped' });
    expect(remember).toHaveBeenCalledWith('popped', 3599, 'u1');
    expect(savedToken('u1')).toBe('popped');
    expect(chooserShown(container)).toBe(true);
  });

  it('hints the Drive account to the popup and remembers its token for that account', async () => {
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: the mocked Google popup answers
    vi.mocked(requestDriveToken).mockResolvedValue({ ok: true, token: 'popped', expiresInSeconds: 3599 });
    downloads();
    act(() => render(<DriveOpen />, container));
    await flush();
    act(() => { button(container)!.click(); });
    await waitUntil(() => arrived(container));
    expect(requestDriveToken).toHaveBeenCalledWith('u1');
    expect(remember).toHaveBeenCalledWith('popped', 3599, 'u1');
  });

  // DRIVE-11: the choice does not wait for the download.
  it('shows the tool choice while the file is still downloading, then gives it the file', async () => {
    saved('saved', 'u1');
    const hold = held();
    drive(async () => { await hold.gate; return pdfMeta(); }, pdfBytes);
    act(() => render(<DriveOpen />, container));
    await flush();
    expect(chooserShown(container)).toBe(true);
    expect(container.textContent).toContain('Your file is on its way.');
    expect(container.textContent).not.toContain('a.pdf');

    hold.release();
    await waitUntil(() => arrived(container));
    await act(async () => { [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Sign'))!.click(); });
    await waitUntil(() => sessionStorage.length > 0);
    expect(await peekHandoff('sign')).toMatchObject({ fileName: 'a.pdf', from: 'drive' });
  });

  it('leaves the choice for the button when the download is refused', async () => {
    saved('stale', 'u1');
    const hold = held();
    drive(async () => { await hold.gate; return refused(); });
    act(() => render(<DriveOpen />, container));
    await flush();
    expect(chooserShown(container)).toBe(true);
    expect(container.textContent).toContain('Your file is on its way.');

    hold.release();
    await waitUntil(() => expect(chooserShown(container)).toBe(false));
    expect(button(container)?.textContent).toContain('Sign in with Google');
  });
});
