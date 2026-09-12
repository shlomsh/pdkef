// LOC-02's sabotage fixtures for the guards verify-seo.js runs over dist/.
// Each guard gets a page built to violate it, so a regression that stops the
// guard firing fails here before it would ever need a full build to notice.
// Guards 1 and 2 (reciprocal hreflang, lang/dir) were already generic in
// verify-seo.js and are exercised by every preview build; guard 5's manifest
// half lives in serviceWorker.test.js against shouldPrecache.
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import {
  MIN_SCRIPT_PURITY,
  TARGET_SCRIPTS,
  localeForRelPath,
  localizedPageProblems,
  scriptPurity,
  sitemapLocations,
  visibleText,
} from '../../scripts/localizedSeoChecks.mjs';

const SITE = 'https://pdkef.com';
const HEBREW = 'מזגו ואחדו קבצי PDF לקובץ אחד, בחינם ובלי הגבלה. גררו לסדר הרצוי, הוסיפו מספרי עמודים והורידו. הקובץ נשאר אצלכם במכשיר.';
const ENGLISH = 'Combine multiple PDFs into a single document, reorder pages by drag-and-drop, and optionally add page numbers before you export.';

function page({ path, lang = 'he', noindex = false, body = '', tool = true, pack = null, appText = '', toolControlsEnglish = false }) {
  const html = `<!doctype html><html lang="${lang}" dir="rtl"><head>
    <link rel="canonical" href="${SITE}${path}">
    ${noindex ? '<meta name="robots" content="noindex, follow">' : ''}
    <script>var notVisible = "this text is code, not copy, and stays out of the count";</script>
    <style>.x{content:"neither is this"}</style>
  </head><body>
    ${tool ? `<section id="app">${appText}</section>` : ''}
    ${toolControlsEnglish ? '<p data-tool-controls-english>Editor controls are in English.</p>' : ''}
    <h1>${body}</h1>
    ${pack ? `<div hidden data-locale-pack="${pack.prefix}" data-locale-pack-urls="${pack.urls.join(',')}"></div>` : ''}
  </body></html>`;
  return new JSDOM(html).window.document;
}

const distPath = (sitePath) => `dist${sitePath}index.html`;

function check(document, sitePath, { sitemap = [], built = {} } = {}) {
  const builtCanonicals = new Map(Object.entries(built).map(([path, isNoindex]) => [`${SITE}${path}`, { isNoindex }]));
  builtCanonicals.set(`${SITE}${sitePath}`, { isNoindex: Boolean(document.querySelector('meta[name="robots"]')) });
  return localizedPageProblems({
    relPath: distPath(sitePath),
    document,
    sitemapLocs: new Set(sitemap.map((path) => `${SITE}${path}`)),
    builtCanonicals,
    siteBase: SITE,
  });
}

describe('language purity (guard 3)', () => {
  it('counts only visible letters, in the target script, against all letters', () => {
    const document = page({ path: '/he/merge/', body: `${HEBREW} PDF PDkef` });
    const { purity, letters, scriptLetters } = scriptPurity(visibleText(document), TARGET_SCRIPTS.he);
    expect(scriptLetters).toBeGreaterThan(80);
    expect(letters - scriptLetters).toBe('PDF'.length + 'PDkef'.length + 'PDF'.length);
    expect(purity).toBeGreaterThan(MIN_SCRIPT_PURITY.he);
  });

  it('passes a page whose copy is in the target script', () => {
    expect(check(page({ path: '/he/merge/', noindex: true, body: HEBREW }), '/he/merge/')).toEqual([]);
  });

  it('SABOTAGE: fails a Hebrew headline over English content', () => {
    const document = page({ path: '/he/merge/', noindex: true, body: `מיזוג PDF ${ENGLISH} ${ENGLISH} ${ENGLISH}` });
    const problems = check(document, '/he/merge/');
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/language purity 0\.\d+ .* is below 0\.5/);
  });

  it('runs no purity check for a locale with no measured floor, rather than guessing one', () => {
    const document = page({ path: '/hi/merge/', lang: 'hi', noindex: true, body: ENGLISH });
    expect(check(document, '/hi/merge/')).toEqual([]);
  });

  it('is not a localized page at all at the English root', () => {
    expect(localeForRelPath('dist/merge/index.html')).toBeNull();
    expect(localeForRelPath('dist/he/merge/index.html')).toEqual({ prefix: 'he' });
  });

  // LOC-03: /he/sign/ keeps its editor English on purpose (ToolPageLayout's
  // "controls are in English" notice, LOC-02's pilot decision) and SSR-renders
  // that whole island's English UI text before hydration. Without an
  // exception this would fail the same purity guard as a real Hebrew-headline-
  // over-English-tool page, for a reason that is disclosed rather than an
  // incumbent-style defect - so the marker element that notice renders lets
  // the guard exclude #app's text on exactly those pages.
  it('excludes the #app island from the purity count when the editor-stays-English notice is present', () => {
    const document = page({
      path: '/he/sign/',
      noindex: true,
      body: HEBREW,
      appText: `${ENGLISH} ${ENGLISH} ${ENGLISH} ${ENGLISH}`,
      toolControlsEnglish: true,
    });
    expect(check(document, '/he/sign/')).toEqual([]);
  });

  it('SABOTAGE: an English island still fails purity without the editor-stays-English notice', () => {
    const document = page({
      path: '/he/sign/',
      noindex: true,
      body: HEBREW,
      appText: `${ENGLISH} ${ENGLISH} ${ENGLISH} ${ENGLISH}`,
      toolControlsEnglish: false,
    });
    const problems = check(document, '/he/sign/');
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/language purity 0\.\d+ .* is below 0\.5/);
  });

  // LOC-16: the home page's HeroDemo is translated through
  // src/i18n/heroDemoMessages.ts, so it gets no exemption any more (the
  // data-hero-demo-english-notice marker and its [data-home-demo] exclusion
  // are both gone - see visibleText's own header comment). [data-home-demo]
  // text now counts toward purity exactly like the rest of the page: a real
  // Hebrew demo passes on its own, and an English one fails the same as any
  // other untranslated content would, with no marker able to excuse it.
  function homePage({ body, demoText }) {
    const html = `<!doctype html><html lang="he" dir="rtl"><head>
      <link rel="canonical" href="${SITE}/he/">
      <meta name="robots" content="noindex, follow">
    </head><body>
      <h1>${body}</h1>
      <section data-home-demo>${demoText}</section>
    </body></html>`;
    return new JSDOM(html).window.document;
  }

  it('passes a home page whose demo copy is in the target script too, with no exemption needed', () => {
    const document = homePage({ body: HEBREW, demoText: HEBREW });
    expect(check(document, '/he/')).toEqual([]);
  });

  it('SABOTAGE: an English demo fails purity, with no marker able to exempt it any more', () => {
    const document = homePage({ body: HEBREW, demoText: `${ENGLISH} ${ENGLISH} ${ENGLISH} ${ENGLISH}` });
    const problems = check(document, '/he/');
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/language purity 0\.\d+ .* is below 0\.5/);
  });
});

describe('sitemap membership follows publication (guard 4)', () => {
  it('passes a draft that is not listed and a published page that is', () => {
    expect(check(page({ path: '/he/merge/', noindex: true, body: HEBREW }), '/he/merge/', { sitemap: ['/merge/'] })).toEqual([]);
    expect(check(page({ path: '/he/merge/', body: HEBREW }), '/he/merge/', { sitemap: ['/merge/', '/he/merge/'] })).toEqual([]);
  });

  it('SABOTAGE: fails a draft (noindex) tool page that is listed in the sitemap', () => {
    const problems = check(page({ path: '/he/merge/', noindex: true, body: HEBREW }), '/he/merge/', { sitemap: ['/he/merge/'] });
    expect(problems).toEqual([expect.stringContaining('draft (noindex) localized tool page is listed in sitemap.xml')]);
  });

  it('SABOTAGE: fails a published tool page missing from the sitemap', () => {
    const problems = check(page({ path: '/he/merge/', body: HEBREW }), '/he/merge/', { sitemap: ['/merge/'] });
    expect(problems).toEqual([expect.stringContaining('published localized tool page is missing from sitemap.xml')]);
  });

  it('reads <loc> entries out of a sitemap document', () => {
    expect(sitemapLocations('<urlset><url><loc>https://pdkef.com/merge/</loc></url><url><loc> https://pdkef.com/he/merge/ </loc></url></urlset>'))
      .toEqual(new Set(['https://pdkef.com/merge/', 'https://pdkef.com/he/merge/']));
  });
});

describe('offline locale pack names only this edition\'s published pages (guard 5)', () => {
  const published = { '/he/compress/': false, '/he/how-to-sign-a-pdf-on-android/': false };

  it('passes a pack of built, published pages under the same prefix', () => {
    const document = page({ path: '/he/merge/', body: HEBREW, pack: { prefix: 'he', urls: ['/he/merge/', '/he/compress/'] } });
    expect(check(document, '/he/merge/', { sitemap: ['/he/merge/'], built: published })).toEqual([]);
  });

  it('SABOTAGE: fails a pack that names a page outside the edition', () => {
    const document = page({ path: '/he/merge/', body: HEBREW, pack: { prefix: 'he', urls: ['/he/merge/', '/merge/'] } });
    expect(check(document, '/he/merge/', { sitemap: ['/he/merge/'], built: published }))
      .toEqual([expect.stringContaining('outside this edition: /merge/')]);
  });

  it('SABOTAGE: fails a pack that names a draft or an unbuilt page', () => {
    const document = page({
      path: '/he/merge/',
      body: HEBREW,
      pack: { prefix: 'he', urls: ['/he/merge/', '/he/split/', '/he/sign/'] },
    });
    const problems = check(document, '/he/merge/', { sitemap: ['/he/merge/'], built: { ...published, '/he/split/': true } });
    expect(problems).toEqual([
      expect.stringContaining('names a draft (noindex) page: /he/split/'),
      expect.stringContaining('names a page that is not built: /he/sign/'),
    ]);
  });

  it('SABOTAGE: fails a pack whose prefix is not the page\'s own locale', () => {
    const document = page({ path: '/he/merge/', body: HEBREW, pack: { prefix: 'ar', urls: ['/ar/merge/'] } });
    const problems = check(document, '/he/merge/', { sitemap: ['/he/merge/'] });
    expect(problems[0]).toContain('does not match the page\'s locale "he"');
  });
});
