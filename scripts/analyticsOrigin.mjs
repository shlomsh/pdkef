import { loadEnv } from 'vite';

// MEM-45: the optional second analytics destination is configured by two build-time variables, set together or
// not at all: PUBLIC_ANALYTICS_HOST (an https address) and PUBLIC_ANALYTICS_KEY. Both unset or empty means no
// analytics and a connect-src of 'self'. Exactly one set, or a mistyped host, fails the build loudly rather than
// silently widening the policy while nothing is sent.

/** The variables as the build sees them: a local .env.local works like the Drive key, and the process env wins. */
export function analyticsEnv(cwd = process.cwd(), env = process.env) {
  return { ...loadEnv(env.NODE_ENV ?? 'production', cwd, 'PUBLIC_'), ...env };
}

export function analyticsOrigin(env = process.env) {
  const value = env.PUBLIC_ANALYTICS_HOST ?? '';
  const key = env.PUBLIC_ANALYTICS_KEY ?? '';
  if (value === '' && key === '') return null;
  if (value === '' || key === '') {
    throw new Error('PUBLIC_ANALYTICS_HOST and PUBLIC_ANALYTICS_KEY must be set together: set both or neither.');
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`PUBLIC_ANALYTICS_HOST must be an https URL, got: ${value}`);
  }
  if (url.protocol !== 'https:') throw new Error(`PUBLIC_ANALYTICS_HOST must be an https URL, got: ${value}`);
  return url.origin;
}
