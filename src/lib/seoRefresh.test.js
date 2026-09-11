// LOC-06: tests the pure per-locale/script-clustering logic behind
// scripts/seo-refresh.mjs. There is no real Search Console export in the
// repo (and never should be - see the ticket); these are small inline CSV
// fixtures with Hebrew, English and one other script, the same
// "test a scripts/ module from src/lib/" pattern src/lib/backlog.test.js
// uses for scripts/backlog-data.mjs.
import { describe, expect, it } from 'vitest';
import {
  parseCsv,
  weightedPosition,
  detectScript,
  groupQueriesByScript,
  normalizePagePath,
  groupPagesByLocale,
  countryRowForLocale,
} from '../../scripts/seoRefreshLib.mjs';

const QUERIES_CSV = [
  'Top queries,Clicks,Impressions,CTR,Position',
  'compress pdf,3,120,2.5%,9',
  'sign pdf,0,40,0%,45',
  'כיווץ pdf,2,30,6.7%,14',
  'חתימה על pdf,0,10,0%,60',
  'kompres pdf gratis,1,25,4%,20',
  'ఆంధ్రప్రదేశ్ pdf,0,5,0%,70',
].join('\n');

const PAGES_CSV = [
  'Top pages,Clicks,Impressions,CTR,Position',
  'https://pdkef.com/compress/,10,300,3.3%,9',
  'https://pdkef.com/merge/,0,47,0%,36.13',
  'https://pdkef.com/he/compress/,2,20,10%,12',
  'https://pdkef.com/he/merge/,0,5,0%,50',
  'https://pdkef.com/he/sign-pdf-no-signup/,0,3,0%,55',
  'https://pdkef.com/,5,100,5%,20',
].join('\n');

const COUNTRIES_CSV = [
  'Country,Clicks,Impressions,CTR,Position',
  'United States,10,200,5%,15',
  'Israel,2,20,10%,12',
].join('\n');

describe('parseCsv', () => {
  it('reads header-keyed rows from an unquoted Search Console export', () => {
    expect(parseCsv(QUERIES_CSV)[0]).toEqual({
      'Top queries': 'compress pdf',
      Clicks: '3',
      Impressions: '120',
      CTR: '2.5%',
      Position: '9',
    });
  });

  it('handles a trailing newline and no trailing blank row', () => {
    const rows = parseCsv(`${QUERIES_CSV}\n`);
    expect(rows).toHaveLength(6);
  });
});

describe('weightedPosition', () => {
  it('weights position by impressions', () => {
    const rows = [
      { Position: '10', Impressions: '100' },
      { Position: '20', Impressions: '100' },
    ];
    expect(weightedPosition(rows)).toBe(15);
  });

  it('returns null for zero total impressions rather than dividing by zero', () => {
    expect(weightedPosition([{ Position: '10', Impressions: '0' }])).toBeNull();
  });
});

describe('detectScript', () => {
  it('detects Hebrew even mixed with a Latin word', () => {
    expect(detectScript('כיווץ pdf')).toBe('Hebrew');
  });

  it('detects Telugu', () => {
    expect(detectScript('ఆంధ్రప్రదేశ్ pdf')).toBe('Telugu');
  });

  it('detects plain Latin as Latin', () => {
    expect(detectScript('compress pdf to 100kb')).toBe('Latin');
  });

  it('detects a romanized (Latin-script) query as Latin, not the language it phonetically represents', () => {
    // "kompres pdf gratis" is Indonesian by language but Latin by script -
    // this module clusters by script, not by language, so it lands here.
    expect(detectScript('kompres pdf gratis')).toBe('Latin');
  });

  it('falls back to Other for a query with no script this table lists', () => {
    expect(detectScript('123')).toBe('Other');
  });

  it('treats an empty or missing query as Other rather than throwing', () => {
    expect(detectScript('')).toBe('Other');
    expect(detectScript(undefined)).toBe('Other');
  });
});

describe('groupQueriesByScript', () => {
  const queries = parseCsv(QUERIES_CSV);

  it('groups every non-Latin query by its script, sorted by impressions within a script', () => {
    const groups = groupQueriesByScript(queries);
    const hebrew = groups.find((g) => g.script === 'Hebrew');
    expect(hebrew.rows.map((r) => r['Top queries'])).toEqual(['כיווץ pdf', 'חתימה על pdf']);
    expect(hebrew.clicks).toBe(2);
    expect(hebrew.impressions).toBe(40);
  });

  it('excludes Latin-only queries entirely, romanized ones included', () => {
    const groups = groupQueriesByScript(queries);
    expect(groups.find((g) => g.script === 'Latin')).toBeUndefined();
    const allRows = groups.flatMap((g) => g.rows.map((r) => r['Top queries']));
    expect(allRows).not.toContain('compress pdf');
    expect(allRows).not.toContain('kompres pdf gratis');
  });

  it('sorts groups by total impressions, highest first', () => {
    const groups = groupQueriesByScript(queries);
    const impressions = groups.map((g) => g.impressions);
    expect(impressions).toEqual([...impressions].sort((a, b) => b - a));
  });

  it('returns an empty array for an all-Latin query set', () => {
    expect(groupQueriesByScript(parseCsv('Top queries,Clicks,Impressions,CTR,Position\ncompress pdf,1,10,10%,5'))).toEqual([]);
  });
});

describe('normalizePagePath', () => {
  it('strips the site origin, keeping the trailing slash', () => {
    expect(normalizePagePath('https://pdkef.com/he/compress/')).toBe('/he/compress/');
  });

  it('treats the bare origin as the root path', () => {
    expect(normalizePagePath('https://pdkef.com')).toBe('/');
  });
});

describe('groupPagesByLocale', () => {
  const pages = parseCsv(PAGES_CSV);

  it('groups localized pages under their prefix and matches the English sibling by path', () => {
    const [he] = groupPagesByLocale(pages);
    expect(he.prefix).toBe('he');
    expect(he.pilotCountry).toBe('Israel');
    const compress = he.pages.find((p) => p.path === '/he/compress/');
    expect(compress.sibling).toEqual({ path: '/compress/', clicks: 10, impressions: 300, ctr: '3.3%', position: 9 });
  });

  it('reports sibling: null when the English path has no row in this export', () => {
    const [he] = groupPagesByLocale(pages);
    const noSibling = he.pages.find((p) => p.path === '/he/sign-pdf-no-signup/');
    expect(noSibling.sibling).toBeNull();
    expect(noSibling.siblingPath).toBe('/sign-pdf-no-signup/');
  });

  it('sorts a locale group by impressions, highest first', () => {
    const [he] = groupPagesByLocale(pages);
    const impressions = he.pages.map((p) => p.impressions);
    expect(impressions).toEqual([...impressions].sort((a, b) => b - a));
  });

  it('excludes a bare locale-looking root path with no further segment', () => {
    // A page at exactly /he/ (the not-yet-built Hebrew home page) has no
    // English sibling in the "strip the prefix" sense and must not be
    // treated as a localized tool/guide page.
    const withRoot = parseCsv(
      'Top pages,Clicks,Impressions,CTR,Position\nhttps://pdkef.com/he/,1,10,10%,5\nhttps://pdkef.com/he/compress/,1,10,10%,5',
    );
    const [he] = groupPagesByLocale(withRoot);
    expect(he.pages.map((p) => p.path)).toEqual(['/he/compress/']);
  });

  it('returns an empty array when no page sits under a locale prefix', () => {
    expect(groupPagesByLocale(parseCsv('Top pages,Clicks,Impressions,CTR,Position\nhttps://pdkef.com/compress/,1,10,10%,5'))).toEqual(
      [],
    );
  });

  it('orders locales per LOCALIZED_PATH_PREFIXES, not discovery order', () => {
    // he is listed first in LOCALIZED_PATH_PREFIXES; feeding hi's row before
    // he's must not change the printed order.
    const mixed = parseCsv(
      [
        'Top pages,Clicks,Impressions,CTR,Position',
        'https://pdkef.com/hi/merge/,1,10,10%,5',
        'https://pdkef.com/he/merge/,1,10,10%,5',
      ].join('\n'),
    );
    expect(groupPagesByLocale(mixed).map((g) => g.prefix)).toEqual(['he', 'hi']);
  });
});

describe('countryRowForLocale', () => {
  const countries = parseCsv(COUNTRIES_CSV);

  it('finds the pilot country row for a locale that has one', () => {
    const result = countryRowForLocale(countries, 'he');
    expect(result.country).toBe('Israel');
    expect(result.row).toEqual({ Country: 'Israel', Clicks: '2', Impressions: '20', CTR: '10%', Position: '12' });
  });

  it('returns row: null when the pilot country has no row in this export', () => {
    const result = countryRowForLocale(parseCsv('Country,Clicks,Impressions,CTR,Position\nUnited States,1,10,10%,5'), 'he');
    expect(result).toEqual({ country: 'Israel', row: null });
  });

  it('returns null for a locale with no pilotCountry entry at all', () => {
    expect(countryRowForLocale(countries, 'hi')).toBeNull();
  });
});
