import { randomBytes, createHash, createPublicKey, verify } from 'node:crypto';

export const CALLBACK = 'http://127.0.0.1:1455/auth/callback';
const AUTH = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const random = () => randomBytes(32).toString('base64url');
const fail = () => { throw new Error('ChatGPT authorization could not be validated. Reconnect.'); };

export function validateIdToken(token, keys, { clientId, nonce, now = Date.now() / 1000 }) {
  if (typeof token !== 'string' || token.length > 32000) fail();
  const parts = token.split('.');
  if (parts.length !== 3) fail();
  let header, claims;
  try { header = JSON.parse(Buffer.from(parts[0], 'base64url')); claims = JSON.parse(Buffer.from(parts[1], 'base64url')); } catch { fail(); }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.crit) fail();
  const key = keys.find(k => k.kid === header.kid && k.kty === 'RSA' && (!k.use || k.use === 'sig') && (!k.alg || k.alg === 'RS256'));
  if (!key || !verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) fail();
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== AUTH || !audiences.includes(clientId) || (audiences.length > 1 && claims.azp !== clientId)
    || !Number.isFinite(claims.exp) || claims.exp <= now || (claims.nbf != null && claims.nbf > now + 30)
    || claims.nonce !== nonce || typeof claims.sub !== 'string' || !claims.sub) fail();
  return claims;
}

export function createOAuth({ hostId, fetchImpl = fetch, now = () => Date.now() }) {
  let pending = null, session = null, registration = null;
  async function json(url, options) {
    const response = await fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('ChatGPT connection failed. Reconnect or use manual mode.');
    const body = await response.text();
    if (body.length > 2000000) fail();
    return JSON.parse(body);
  }
  return {
    start() {
      pending = { state: random(), nonce: random(), verifier: random(), created: now(), clientId: registration?.clientId ?? 'dynamic_agent_client' };
      const url = new URL(`${AUTH}/api/accounts/authorize`);
      const params = { client_id: pending.clientId, ext_agent_host_id: hostId, response_type: 'code', redirect_uri: CALLBACK,
        scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct', resource: RESOURCE,
        state: pending.state, nonce: pending.nonce, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(pending.verifier).digest('base64url') };
      if (!registration) params.agent_name_hint = 'PDkef AI PDF Filler';
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
      return url.href;
    },
    async callback(params) {
      const attempt = pending;
      if (!attempt || params.get('state') !== attempt.state || now() - attempt.created > 600000) fail();
      pending = null;
      if (params.has('error')) throw new Error('ChatGPT authorization was declined. Manual mode remains available.');
      const clientId = params.get('client_id') || attempt.clientId;
      if (!clientId || clientId === 'dynamic_agent_client' || clientId.length > 512
        || (attempt.clientId !== 'dynamic_agent_client' && attempt.clientId !== clientId)) fail();
      const code = params.get('code');
      if (!code || code.length > 16000) fail();
      const tokens = await json(`${AUTH}/api/accounts/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code, code_verifier: attempt.verifier, redirect_uri: CALLBACK, resource: RESOURCE }) });
      const jwks = await json(`${AUTH}/.well-known/jwks.json`);
      if (!Array.isArray(jwks.keys)) fail();
      const claims = validateIdToken(tokens.id_token, jwks.keys, { clientId, nonce: attempt.nonce, now: now() / 1000 });
      if (registration && registration.subject !== claims.sub) fail();
      const scopes = typeof tokens.scope === 'string' ? tokens.scope.split(/\s+/) : [];
      if (!scopes.includes('chatgpt.tokens.use.direct') || !scopes.includes('resource.invoke') || tokens.token_type?.toLowerCase() !== 'bearer'
        || typeof tokens.access_token !== 'string' || !tokens.access_token || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0) fail();
      registration = { clientId, subject: claims.sub };
      session = { token: tokens.access_token, expires: now() + tokens.expires_in * 1000 };
    },
    token() { if (!session || session.expires <= now()) { session = null; return null; } return session.token; },
    async models() {
      const token = this.token();
      if (!token) return [];
      const data = await json(`${RESOURCE}/models`, { headers: { Authorization: `Bearer ${token}` } });
      const models = data.models ?? data.data;
      if (!Array.isArray(models)) throw new Error('ChatGPT model catalog unavailable.');
      return models.filter(m => typeof m.slug === 'string' && m.slug.length < 200).slice(0, 100).map(m => ({ slug: m.slug, display_name: typeof m.display_name === 'string' ? m.display_name : m.slug }));
    },
  };
}
