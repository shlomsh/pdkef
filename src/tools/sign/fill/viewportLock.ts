// SNG-16: iOS must never zoom the page itself while Sign fill mode owns zoom.
// SNG-14 measured on iOS: `maximum-scale=1` alone still let iOS zoom OUT to
// ~0.6 on a wide field; adding `minimum-scale=1` stopped it, so both are
// required alongside `initial-scale=1`.

/**
 * Returns the viewport meta `content` string with `initial-scale=1`,
 * `minimum-scale=1` and `maximum-scale=1` forced, overriding any existing
 * values for those keys. Every other key (order and value) is preserved;
 * missing keys are appended in a fixed order after the preserved ones.
 */
export function lockedViewportContent(content: string): string {
  const LOCKED = {
    'initial-scale': '1',
    'minimum-scale': '1',
    'maximum-scale': '1',
  } as const;
  const lockedKeys = Object.keys(LOCKED) as Array<keyof typeof LOCKED>;

  const seen = new Set<string>();
  const entries = content
    .split(',')
    .map((pair) => pair.trim())
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const eq = pair.indexOf('=');
      const key = eq === -1 ? pair.trim() : pair.slice(0, eq).trim();
      return { key, pair };
    });

  const result: string[] = [];
  for (const { key, pair } of entries) {
    if (Object.prototype.hasOwnProperty.call(LOCKED, key)) {
      if (!seen.has(key)) {
        result.push(`${key}=${LOCKED[key as keyof typeof LOCKED]}`);
        seen.add(key);
      }
      // A duplicate occurrence of an already-locked key is dropped rather
      // than appended again.
      continue;
    }
    result.push(pair);
  }

  for (const key of lockedKeys) {
    if (!seen.has(key)) {
      result.push(`${key}=${LOCKED[key]}`);
      seen.add(key);
    }
  }

  return result.join(', ');
}
