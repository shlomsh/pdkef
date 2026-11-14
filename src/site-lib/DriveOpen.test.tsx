import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DriveOpen from './DriveOpen.tsx';
import { fetchDriveFile } from './drive/driveClient.ts';
import { requestDriveToken } from './drive/googleToken.ts';
import { forgetSaved, remember, savedToken, takeRedirectReturn, toGoogle } from './drive/driveSignIn.ts';
import { driveRouteFor } from './drive/driveRoute.ts';

vi.mock('./drive/googleToken.ts', () => ({ requestDriveToken: vi.fn() }));
vi.mock('./drive/driveClient.ts', () => ({ fetchDriveFile: vi.fn() }));
vi.mock('./drive/driveIntent.ts', () => ({
  DRIVE_HOME_HANDOFF: 'drive-home',
  parseDriveIntent: () => ({ kind: 'open-with', fileId: 'abc123', userId: 'u1' }),
}));
vi.mock('./drive/driveSignIn.ts', () => ({
  savedToken: vi.fn(),
  remember: vi.fn(),
  forgetSaved: vi.fn(),
  toGoogle: vi.fn(),
  takeRedirectReturn: vi.fn(),
}));
vi.mock('./drive/driveRoute.ts', () => ({ driveRouteFor: vi.fn() }));
vi.mock('./OpenWithChooser.tsx', () => ({
  default: ({ file, arriving }: { file?: File; arriving?: boolean }) => <p>chooser {file ? `has ${file.name}` : arriving ? 'arriving' : 'empty'}</p>,
}));

const PDF = { ok: true, name: 'a.pdf', mimeType: 'application/pdf', bytes: new ArrayBuffer(4) } as never;
const NO_RETURN = { token: null, handled: false, failed: false };
const button = (container: HTMLElement) => container.querySelector<HTMLButtonElement>('button');

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

describe('DriveOpen', () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(savedToken).mockReturnValue(null);
    vi.mocked(takeRedirectReturn).mockReturnValue(NO_RETURN);
    vi.mocked(driveRouteFor).mockReturnValue('popup');
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });

  it('starts one token request and one fetch when the Google button is tapped twice', async () => {
    let resolveToken!: (value: { ok: true; token: string; expiresInSeconds: number }) => void;
    vi.mocked(requestDriveToken).mockReturnValue(new Promise((resolve) => { resolveToken = resolve; }));
    vi.mocked(fetchDriveFile).mockResolvedValue({ ok: true, name: 'a.pdf', mimeType: 'application/pdf', bytes: new ArrayBuffer(4) } as never);
    act(() => render(<DriveOpen />, container));
    const button = container.querySelector<HTMLButtonElement>('button')!;

    act(() => { button.click(); button.click(); });
    expect(requestDriveToken).toHaveBeenCalledTimes(1);

    resolveToken({ ok: true, token: 't', expiresInSeconds: 3600 });
    await flush();
    expect(fetchDriveFile).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('chooser');
  });

  // DRIVE-10: Open with reuses the sign-in it already has instead of stopping on the button every time.
  it('opens the file straight away with a saved token, no button and no popup', async () => {
    vi.mocked(savedToken).mockReturnValue('saved');
    vi.mocked(fetchDriveFile).mockResolvedValue(PDF);
    act(() => render(<DriveOpen />, container));
    await flush();
    expect(fetchDriveFile).toHaveBeenCalledWith(expect.any(Function), 'saved', { fileId: 'abc123', resourceKey: undefined });
    expect(requestDriveToken).not.toHaveBeenCalled();
    expect(container.textContent).toContain('chooser');
  });

  it('opens the file with the token Google sent back from the redirect', async () => {
    vi.mocked(takeRedirectReturn).mockReturnValue({ token: 'fresh', handled: false, failed: false });
    vi.mocked(driveRouteFor).mockReturnValue('redirect');
    vi.mocked(fetchDriveFile).mockResolvedValue(PDF);
    act(() => render(<DriveOpen />, container));
    await flush();
    expect(fetchDriveFile).toHaveBeenCalledWith(expect.any(Function), 'fresh', { fileId: 'abc123', resourceKey: undefined });
    expect(toGoogle).not.toHaveBeenCalled();
    expect(container.textContent).toContain('chooser');
  });

  it('signs in quietly by redirect on desktop Chrome when nothing is saved', async () => {
    vi.mocked(driveRouteFor).mockReturnValue('redirect');
    act(() => render(<DriveOpen />, container));
    await flush();
    expect(toGoogle).toHaveBeenCalledWith('none', expect.any(String));
    expect(button(container)).toBeNull();
  });

  it('waits for a tap on the popup route when nothing is saved', async () => {
    act(() => render(<DriveOpen />, container));
    await flush();
    expect(toGoogle).not.toHaveBeenCalled();
    expect(fetchDriveFile).not.toHaveBeenCalled();
    expect(button(container)?.textContent).toContain('Sign in with Google');
  });

  it('shows the button, not another redirect, when the redirect sign-in came back refused', async () => {
    vi.mocked(takeRedirectReturn).mockReturnValue({ token: null, handled: false, failed: true });
    vi.mocked(driveRouteFor).mockReturnValue('redirect');
    act(() => render(<DriveOpen />, container));
    await flush();
    expect(toGoogle).not.toHaveBeenCalled();
    expect(button(container)?.textContent).toContain('Sign in with Google');
  });

  it('forgets a saved token Google rejects and falls back to the button', async () => {
    vi.mocked(savedToken).mockReturnValue('stale');
    vi.mocked(driveRouteFor).mockReturnValue('redirect');
    vi.mocked(fetchDriveFile).mockResolvedValue({ ok: false, error: 'unauthorized' });
    act(() => render(<DriveOpen />, container));
    await flush();
    expect(forgetSaved).toHaveBeenCalledTimes(1);
    expect(toGoogle).not.toHaveBeenCalled();
    expect(button(container)?.textContent).toContain('Sign in with Google');
  });

  it('remembers the token from the popup so the next Open with needs no tap', async () => {
    vi.mocked(requestDriveToken).mockResolvedValue({ ok: true, token: 'popped', expiresInSeconds: 3599 });
    vi.mocked(fetchDriveFile).mockResolvedValue(PDF);
    act(() => render(<DriveOpen />, container));
    await flush();
    act(() => { button(container)!.click(); });
    await flush();
    expect(remember).toHaveBeenCalledWith('popped', 3599, 'u1');
    expect(container.textContent).toContain('chooser');
  });

  // DRIVE-10: the account Drive names is the one every sign-in asks for, and the only one a saved token serves.
  it('looks up only the Drive account\'s saved token before the quiet redirect', async () => {
    vi.mocked(driveRouteFor).mockReturnValue('redirect');
    act(() => render(<DriveOpen />, container));
    await flush();
    expect(savedToken).toHaveBeenCalledWith('u1');
    expect(toGoogle).toHaveBeenCalledWith('none', location.search); // the hint is read from this search, see driveRedirect.test.ts
  });

  it('hints the Drive account to the popup and remembers its token for that account', async () => {
    vi.mocked(requestDriveToken).mockResolvedValue({ ok: true, token: 'popped', expiresInSeconds: 3599 });
    vi.mocked(fetchDriveFile).mockResolvedValue(PDF);
    act(() => render(<DriveOpen />, container));
    await flush();
    act(() => { button(container)!.click(); });
    await flush();
    expect(requestDriveToken).toHaveBeenCalledWith('u1');
    expect(remember).toHaveBeenCalledWith('popped', 3599, 'u1');
  });

  // DRIVE-11: the choice does not wait for the download.
  it('shows the tool choice while the file is still downloading, then gives it the file', async () => {
    vi.mocked(savedToken).mockReturnValue('saved');
    let arrive!: (value: never) => void;
    vi.mocked(fetchDriveFile).mockReturnValue(new Promise((resolve) => { arrive = resolve; }));
    act(() => render(<DriveOpen />, container));
    await flush();
    expect(container.textContent).toContain('chooser arriving');

    arrive(PDF);
    await flush();
    expect(container.textContent).toContain('chooser has a.pdf');
  });

  it('leaves the choice for the button when the download is refused', async () => {
    vi.mocked(savedToken).mockReturnValue('stale');
    let arrive!: (value: { ok: false; error: 'unauthorized' }) => void;
    vi.mocked(fetchDriveFile).mockReturnValue(new Promise((resolve) => { arrive = resolve; }));
    act(() => render(<DriveOpen />, container));
    await flush();
    expect(container.textContent).toContain('chooser arriving');

    arrive({ ok: false, error: 'unauthorized' });
    await flush();
    expect(container.textContent).not.toContain('chooser');
    expect(button(container)?.textContent).toContain('Sign in with Google');
  });
});
