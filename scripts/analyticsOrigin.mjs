// MEM-45: the one optional analytics address, supplied only as the build-time variable PUBLIC_ANALYTICS_HOST.
// Unset or empty means no analytics and a connect-src of 'self'. A mistyped value fails the build loudly
// rather than silently widening or dropping the policy.
export function analyticsOrigin(env = process.env) {
  const value = env.PUBLIC_ANALYTICS_HOST;
  if (value === undefined || value === '') return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`PUBLIC_ANALYTICS_HOST must be an https URL, got: ${value}`);
  }
  if (url.protocol !== 'https:') throw new Error(`PUBLIC_ANALYTICS_HOST must be an https URL, got: ${value}`);
  return url.origin;
}
