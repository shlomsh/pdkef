// LOC-02 guards 3, 4 and the pack half of 5, as pure functions so
// verify-seo.js can run them over dist/ and src/lib/localizedSeoChecks.test.js
// can run them over sabotage fixtures without a build. Guards 1 and 2
// (reciprocal hreflang with x-default, lang/dir from the registry) were
// already generic in verify-seo.js and cover tool pages unchanged.
import { LOCALIZED_PATH_PREFIXES } from '../src/i18n/localePrefixes.js';

/**
 * Which Unicode block a locale's own text lives in. A locale absent here gets
 * no purity check rather than a guessed one; add a row when its first page
 * is measured.
 */
export const TARGET_SCRIPTS = {
  he: /[֐-׿]/g,
};

/**
 * Language purity floor per locale, as the share of Unicode letters on the
 * page that are in the target script. Set from the first page, deliberately
 * below the measurement so an ordinary copy edit cannot trip it, and never
 * raised without a new measurement.
 *
 * he: 0.5308 measured on /he/merge/ (2026-09-11, LOC-02's draft fixture,
 * 1,223 Hebrew of 2,304 letters). What holds it at ~53% rather than higher,
 * in order of weight: the eight cross-link cards' titles and descriptions
 * (English by design - tools.js is untouched and they link to English
 * pages), the shared dropzone/dialog shell strings in BasePdfTool (out of
 * LOC-02's scope, see the ticket), the three trust chips, the footer
 * credit, and PDkef/PDF/Chrome/Mac/Windows/iOS as terms. A Hebrew headline
 * over an English tool - the incumbent failure this guard exists to catch -
 * measured 0.46 before the island and About-card chrome were localized,
 * so 0.50 separates the two cases with a margin on both sides.
 */
export const MIN_SCRIPT_PURITY = {
  he: 0.5,
};

const NON_VISIBLE = 'script, style, noscript, template';

/** The text a reader sees: body content minus scripts, styles and templates. */
export function visibleText(document) {
  const clone = document.body.cloneNode(true);
  clone.querySelectorAll(NON_VISIBLE).forEach((node) => node.remove());
  return clone.textContent ?? '';
}

export function scriptPurity(text, pattern) {
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  const scriptLetters = (text.match(pattern) ?? []).length;
  return { letters, scriptLetters, purity: letters === 0 ? 0 : scriptLetters / letters };
}

/**
 * The locale prefix of a built page, from its dist-relative path
 * (`dist/he/merge/index.html` -> { prefix: 'he' }), or null for an
 * English-root page. Read off localePrefixes.js (plain JS, so this runs
 * under Node without a TypeScript loader), which a unit test pins to the
 * registry in documentationLocales.ts.
 */
export function localeForRelPath(relPath) {
  const match = /^dist\/([a-z]{2,3}(?:-[a-z0-9]+)?)\//.exec(relPath);
  return match && LOCALIZED_PATH_PREFIXES.includes(match[1]) ? { prefix: match[1] } : null;
}

/**
 * Problems with one localized page. `sitemapLocs` is the set of absolute
 * <loc> URLs in dist/sitemap.xml; `builtCanonicals` is the map of absolute
 * canonical URL -> { isNoindex } for every built page; `siteBase` is the
 * origin the canonicals are absolute against.
 */
export function localizedPageProblems({ relPath, document, sitemapLocs, builtCanonicals, siteBase }) {
  const problems = [];
  const locale = localeForRelPath(relPath);
  if (!locale) return problems;

  const html = document.documentElement;
  const isNoindex = Boolean(document.querySelector('meta[name="robots"][content*="noindex"]'));
  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '';
  const isToolPage = Boolean(document.querySelector('#app'));

  // Guard 3: language purity.
  const lang = html.getAttribute('lang') ?? '';
  const pattern = TARGET_SCRIPTS[lang];
  const floor = MIN_SCRIPT_PURITY[lang];
  if (pattern && floor !== undefined) {
    const { purity, letters, scriptLetters } = scriptPurity(visibleText(document), pattern);
    if (purity < floor) {
      problems.push(
        `language purity ${purity.toFixed(3)} (${scriptLetters} of ${letters} letters in the ${lang} script) is below ${floor}: ` +
          'a localized page must not be a translated headline over English content',
      );
    }
  }

  // Guard 4: sitemap membership follows publication. Tool pages only - the
  // guides' sitemap rule predates LOC-02 and is unchanged here.
  if (isToolPage && canonical) {
    const listed = sitemapLocs.has(canonical);
    if (isNoindex && listed) problems.push(`draft (noindex) localized tool page is listed in sitemap.xml: ${canonical}`);
    if (!isNoindex && !listed) problems.push(`published localized tool page is missing from sitemap.xml: ${canonical}`);
  }

  // Guard 5 (page half): the offline pack names only this edition's
  // published pages, and every one of them is built.
  const packBlock = document.querySelector('[data-locale-pack]');
  if (packBlock) {
    const prefix = packBlock.getAttribute('data-locale-pack');
    const urls = (packBlock.getAttribute('data-locale-pack-urls') ?? '').split(',').filter(Boolean);
    if (prefix !== locale.prefix) problems.push(`locale pack prefix "${prefix}" does not match the page's locale "${locale.prefix}"`);
    if (urls.length === 0) problems.push('locale pack block present but empty');
    for (const url of urls) {
      if (!url.startsWith(`/${locale.prefix}/`)) {
        problems.push(`locale pack names a page outside this edition: ${url}`);
        continue;
      }
      const target = builtCanonicals.get(`${siteBase}${url}`);
      if (!target) problems.push(`locale pack names a page that is not built: ${url}`);
      else if (target.isNoindex) problems.push(`locale pack names a draft (noindex) page: ${url}`);
    }
  }

  return problems;
}

/** All <loc> URLs in a sitemap document. */
export function sitemapLocations(xml) {
  return new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim()));
}
