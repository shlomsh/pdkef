import { describe, expect, it } from 'vitest';
import { driveRouteFor } from './driveRoute.ts';

const chrome = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

describe('driveRouteFor', () => {
  it('redirects on desktop Chrome', () => expect(driveRouteFor(chrome)).toBe('redirect'));
  it.each([
    ['Edge', `${chrome} Edg/120.0`],
    ['Opera', `${chrome} OPR/100`],
    ['Samsung', `${chrome} SamsungBrowser/20`],
    ['Android', `${chrome} Mobile Safari/537.36 Android 14`],
    ['iOS Chrome', 'Mozilla/5.0 (iPhone) AppleWebKit/605 CriOS/120 Mobile/15E148'],
    ['Safari', 'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15'],
    ['Firefox', 'Mozilla/5.0 (Macintosh; rv:120.0) Gecko/20100101 Firefox/120.0'],
    ['empty', ''],
  ])('popups on %s', (_n, ua) => expect(driveRouteFor(ua)).toBe('popup'));
});
