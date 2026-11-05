import { describe, expect, it } from 'vitest';
import { googleSignInUrl, parseRedirectReturn, parseRedirectState } from './driveRedirect.ts';

describe('googleSignInUrl', () => {
  it('builds the auth url', () => {
    const url = new URL(
      googleSignInUrl({ clientId: 'cid', scope: 'a b', redirectUri: 'https://x.test/drive/', prompt: 'none', returnSearch: '?pick=1' }),
    );
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    const p = url.searchParams;
    expect(p.get('client_id')).toBe('cid');
    expect(p.get('redirect_uri')).toBe('https://x.test/drive/');
    expect(p.get('response_type')).toBe('token');
    expect(p.get('scope')).toBe('a b');
    expect(p.get('include_granted_scopes')).toBe('true');
    expect(p.get('prompt')).toBe('none');
    expect(p.get('state')).toBe('none|?pick=1');
  });
});

describe('parseRedirectReturn', () => {
  it('reads a token', () => {
    expect(parseRedirectReturn('#access_token=abc&expires_in=3599&state=none%7C%3Fpick%3D1')).toEqual({
      kind: 'token',
      token: 'abc',
      expiresInSeconds: 3599,
      state: 'none|?pick=1',
    });
  });
  it('defaults expiry to 0', () => {
    expect(parseRedirectReturn('#access_token=abc')).toMatchObject({ kind: 'token', expiresInSeconds: 0, state: '' });
  });
  it('reads an error', () => {
    expect(parseRedirectReturn('#error=interaction_required&state=none%7C')).toEqual({
      kind: 'error',
      error: 'interaction_required',
      state: 'none|',
    });
  });
  it('none otherwise', () => {
    expect(parseRedirectReturn('')).toEqual({ kind: 'none' });
    expect(parseRedirectReturn('#foo=1')).toEqual({ kind: 'none' });
  });
});

describe('parseRedirectState', () => {
  it('splits on the first bar', () => {
    expect(parseRedirectState('select_account|?a=1|2')).toEqual({ prompt: 'select_account', search: '?a=1|2' });
  });
  it('handles no bar', () => {
    expect(parseRedirectState('none')).toEqual({ prompt: 'none', search: '' });
  });
});
