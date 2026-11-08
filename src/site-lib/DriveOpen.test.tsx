import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DriveOpen from './DriveOpen.tsx';
import { fetchDriveFile } from './drive/driveClient.ts';
import { requestDriveToken } from './drive/googleToken.ts';

vi.mock('./drive/googleToken.ts', () => ({ requestDriveToken: vi.fn() }));
vi.mock('./drive/driveClient.ts', () => ({ fetchDriveFile: vi.fn() }));
vi.mock('./drive/driveIntent.ts', () => ({
  DRIVE_HOME_HANDOFF: 'drive-home',
  parseDriveIntent: () => ({ kind: 'open-with', fileId: 'abc123' }),
}));
vi.mock('./OpenWithChooser.tsx', () => ({ default: () => <p>chooser</p> }));

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

describe('DriveOpen', () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
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
});
