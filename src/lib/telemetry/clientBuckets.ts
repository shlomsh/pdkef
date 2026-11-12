/** MEM-45: four coarse, anonymous buckets about the browser. Pure; each returns only a bucket, never a raw value. */

export type ClientBuckets = {
  device: 'phone' | 'tablet' | 'desktop';
  browser: 'chrome' | 'edge' | 'firefox' | 'safari' | 'samsung' | 'other';
  os: 'ios' | 'android' | 'windows' | 'mac' | 'linux' | 'other';
  ref: 'direct' | 'internal' | 'search' | 'ai' | 'social' | 'other';
};

/**
 * Width is the screen's shorter side, so a phone held sideways stays a phone.
 * @testSeam
 */
export function deviceFor(width: number, coarse: boolean): ClientBuckets['device'] {
  return coarse ? (width < 768 ? 'phone' : 'tablet') : 'desktop';
}

/** @testSeam */
export function browserFor(ua: string): ClientBuckets['browser'] {
  if (/SamsungBrowser/.test(ua)) return 'samsung';
  if (/Edg/.test(ua)) return 'edge';
  if (/OPR|Opera/.test(ua)) return 'other';
  if (/Firefox|FxiOS/.test(ua)) return 'firefox';
  if (/Chrome|CriOS/.test(ua)) return 'chrome';
  return /Safari/.test(ua) ? 'safari' : 'other';
}

/** @testSeam */
export function osFor(ua: string, coarse: boolean): ClientBuckets['os'] {
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Windows/.test(ua)) return 'windows';
  // an iPad can say it is a Mac; only a touch screen gives it away
  if (/Macintosh|Mac OS X/.test(ua)) return coarse ? 'ios' : 'mac';
  return /Linux|X11|CrOS/.test(ua) ? 'linux' : 'other';
}

const AI = /(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com)$/;
const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|yandex|baidu|brave)\.[a-z]{2,3}(\.[a-z]{2})?$/;
const SOCIAL = /(^|\.)(facebook\.com|instagram\.com|twitter\.com|x\.com|t\.co|linkedin\.com|reddit\.com|youtube\.com|tiktok\.com)$/;

/** @testSeam */
export function refFor(referrer: string, host: string): ClientBuckets['ref'] {
  if (!referrer) return 'direct';
  // the Google app on Android sends an android-app:// referrer
  if (referrer.startsWith('android-app://')) return referrer.includes('google') ? 'search' : 'other';
  let name: string;
  try {
    name = new URL(referrer).hostname;
  } catch {
    // expected: an unparseable referrer is just "other"
    return 'other';
  }
  if (name.replace(/^www\./, '') === host.replace(/^www\./, '')) return 'internal';
  return AI.test(name) ? 'ai' : SEARCH.test(name) ? 'search' : SOCIAL.test(name) ? 'social' : 'other';
}

export function clientBuckets(env: { ua: string; width: number; coarse: boolean; referrer: string; host: string }): ClientBuckets {
  return {
    device: deviceFor(env.width, env.coarse),
    browser: browserFor(env.ua),
    os: osFor(env.ua, env.coarse),
    ref: refFor(env.referrer, env.host),
  };
}
