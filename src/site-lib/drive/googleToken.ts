import { DRIVE_CLIENT_ID, DRIVE_SCOPE, GSI_SRC } from './driveConfig.ts';
import type { DriveTokenResult } from './types.ts';

// The slice of Google Identity Services this app uses; no dependency, the script is loaded on demand.
type TokenResponse = { access_token?: string; error?: string };
type TokenClient = { requestAccessToken: () => void };
type GoogleGlobal = {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback: (error: { type?: string }) => void;
      }) => TokenClient;
    };
  };
};

let scriptLoad: Promise<boolean> | null = null;

function loadGsi(): Promise<boolean> {
  if (!scriptLoad) {
    scriptLoad = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = GSI_SRC;
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => {
        scriptLoad = null; // a later try may succeed once the connection is back
        script.remove();
        resolve(false);
      };
      document.head.appendChild(script);
    });
  }
  return scriptLoad;
}

/** Asks Google for a one-file Drive token. Call it straight from a click: popup blockers and mobile Safari
    only allow the sign-in window as the direct result of a tap. */
export async function requestDriveToken(): Promise<DriveTokenResult> {
  if (!(await loadGsi())) return { ok: false, error: 'script' };
  const google = (window as unknown as { google?: GoogleGlobal }).google;
  if (!google) return { ok: false, error: 'script' };
  return new Promise((resolve) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: DRIVE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (response) =>
        resolve(response.access_token && !response.error
          ? { ok: true, token: response.access_token }
          : { ok: false, error: 'denied' }),
      error_callback: (error) =>
        resolve({ ok: false, error: error.type === 'popup_failed_to_open' ? 'blocked' : 'denied' }),
    });
    client.requestAccessToken();
  });
}
