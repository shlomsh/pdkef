// Sign-in plumbing shared by the /drive/ islands: the saved token, the redirect to Google and the way back.
import { DRIVE_CLIENT_ID, DRIVE_SCOPE } from './driveConfig.ts';
import { forgetToken, readSavedToken, saveToken } from './driveSession.ts';
import { googleSignInUrl, parseRedirectReturn, parseRedirectState } from './driveRedirect.ts';

const FALLBACK_TOKEN_SECONDS = 3600;

function storage(): Storage | null {
  try {
    return localStorage;
  } catch {
    // expected: storage is blocked in some private windows; the sign-in then just happens each time
    return null;
  }
}

export const savedToken = (): string | null => {
  const store = storage();
  return store ? readSavedToken(store, Date.now()) : null;
};

export const remember = (token: string, expiresInSeconds: number | undefined) => {
  const store = storage();
  if (store) saveToken(store, token, expiresInSeconds || FALLBACK_TOKEN_SECONDS, Date.now());
};

export const toGoogle = (prompt: 'none' | 'select_account', returnSearch: string) =>
  location.assign(googleSignInUrl({
    clientId: DRIVE_CLIENT_ID,
    scope: DRIVE_SCOPE,
    redirectUri: `${location.origin}/drive/`,
    prompt,
    returnSearch,
  }));

/** The token Google sent back in the fragment, if any. Strips the fragment and restores the page's own
    search first, so the rest of the page reads the intent it was sent here with. */
export function takeRedirectReturn(): { token: string | null; handled: boolean; failed: boolean } {
  const back = parseRedirectReturn(location.hash);
  if (back.kind === 'none') return { token: null, handled: false, failed: false };
  const { prompt, search } = parseRedirectState(back.state);
  history.replaceState(null, '', `/drive/${search}`);
  if (back.kind === 'token') {
    remember(back.token, back.expiresInSeconds);
    return { token: back.token, handled: false, failed: false };
  }
  if (prompt === 'none') {
    toGoogle('select_account', search);
    return { token: null, handled: true, failed: false };
  }
  return { token: null, handled: false, failed: true };
}


/** The saved token is no longer good. */
export function forgetSaved(): void {
  const store = storage();
  if (store) forgetToken(store);
}
