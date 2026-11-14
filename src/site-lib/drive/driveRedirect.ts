import { parseDriveState } from './driveState.ts';
import type { DriveRedirectReturn } from './types.ts';

/** The Google account an Open with search names, if any: the login hint, and the owner of the token that comes back. */
function openWithUser(search: string): string | undefined {
  const state = parseDriveState(search);
  return state.ok ? state.userId : undefined;
}

/** The Google sign-in URL for the redirect route. `state` carries the prompt and the search to come back to. */
export function googleSignInUrl(options: {
  clientId: string;
  scope: string;
  redirectUri: string;
  prompt: 'none' | 'select_account';
  returnSearch: string;
}): string {
  const params = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: 'token',
    scope: options.scope,
    include_granted_scopes: 'true',
    prompt: options.prompt,
    state: `${options.prompt}|${options.returnSearch}`,
  });
  // DRIVE-10: an Open with names its account, so a browser signed in to several skips Google's chooser.
  const user = openWithUser(options.returnSearch);
  if (user) params.set('login_hint', user);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/** Reads the fragment Google sends the person back with. Pure: never throws. */
export function parseRedirectReturn(hash: string): DriveRedirectReturn {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const state = params.get('state') ?? '';
  const token = params.get('access_token');
  if (token) return { kind: 'token', token, expiresInSeconds: Number(params.get('expires_in')) || 0, state };
  const error = params.get('error');
  if (error) return { kind: 'error', error, state };
  return { kind: 'none' };
}

export function parseRedirectState(state: string): { prompt: string; search: string; user?: string } {
  const at = state.indexOf('|');
  if (at === -1) return { prompt: state, search: '' };
  const search = state.slice(at + 1);
  const user = openWithUser(search);
  return { prompt: state.slice(0, at), search, ...(user && { user }) };
}
