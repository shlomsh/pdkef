/**
 * The canonical bundled-font manifest.
 *
 * This is hand-edited source under src/editor/text/, not a generated file:
 * add, remove, or replace a font here, then run `npm run generate:font-manifest`
 * to refresh the derived CSS (src/styles/editorFonts.css) and the
 * THIRD_PARTY_LICENSES.md font lists. The editor, the exporter, the license
 * page and the precache policy all import this module directly at build and
 * run time. Per-family license text (copyright, license URL, spec version)
 * lives in the sibling src/editor/text/fontLicenses.js instead of here, so a
 * Sign session never downloads copyright prose it has no use for - a unit
 * test (fontLicenses.test.js) keeps the two modules' family keys identical.
 */

const normal = (regular, bold) => ({
  normal: regular,
  ...(bold ? { bold } : {}),
});

const full = (regular, bold, italic, boldItalic) => ({ normal: regular, bold, italic, boldItalic });

export const FONT_MANIFEST = Object.freeze([
  {
    family: 'Caveat', kind: 'handwriting', styleTag: 'handwriting',
    metrics: { ascent: 0.960, descent: 0.300 },
    faces: normal('Caveat-Regular.ttf', 'Caveat-Bold.ttf'),
  },
  {
    family: 'Dancing Script', kind: 'handwriting', styleTag: 'handwriting',
    metrics: { ascent: 0.920, descent: 0.280 },
    faces: normal('DancingScript-Regular.ttf', 'DancingScript-Bold.ttf'),
  },
  {
    family: 'Great Vibes', kind: 'handwriting', styleTag: 'handwriting',
    metrics: { ascent: 0.851, descent: 0.401 },
    faces: normal('GreatVibes-Regular.ttf'),
  },
  {
    family: 'Gveret Levin', kind: 'handwriting', styleTag: 'handwriting',
    metrics: { ascent: 0.990, descent: 0.310 },
    faces: normal('GveretLevin-Regular.ttf'),
    acceptance: { hebrewMarkPlacement: true },
  },
  {
    family: 'Kalam', kind: 'handwriting', styleTag: 'handwriting',
    metrics: { ascent: 1.063, descent: 0.531 },
    faces: normal('Kalam-Regular.ttf', 'Kalam-Bold.ttf'),
  },
  {
    family: 'Mali', kind: 'handwriting', styleTag: 'handwriting',
    metrics: { ascent: 1.050, descent: 0.250 },
    faces: full('Mali-Regular.ttf', 'Mali-Bold.ttf', 'Mali-Italic.ttf', 'Mali-BoldItalic.ttf'),
  },
  {
    family: 'Neucha', kind: 'handwriting', styleTag: 'handwriting',
    metrics: { ascent: 0.769, descent: 0.285 },
    faces: normal('Neucha-Regular.ttf'),
  },
  {
    family: 'Pacifico', kind: 'handwriting', styleTag: 'handwriting',
    metrics: { ascent: 1.303, descent: 0.453 },
    faces: normal('Pacifico-Regular.ttf'),
  },
  {
    family: 'Sacramento', kind: 'handwriting', styleTag: 'handwriting',
    metrics: { ascent: 0.930, descent: 0.529 },
    faces: normal('Sacramento-Regular.ttf'),
  },
  {
    family: 'Amatic SC', kind: 'handwriting', styleTag: 'handwriting',
    metrics: { ascent: 1.016, descent: 0.245 },
    faces: normal('AmaticSC-Regular.ttf', 'AmaticSC-Bold.ttf'),
    acceptance: { hebrewMarkPlacement: true },
  },
  {
    family: 'Sriracha', kind: 'handwriting', styleTag: 'handwriting',
    metrics: { ascent: 1.220, descent: 0.550 },
    faces: normal('Sriracha-Regular.ttf'),
  },
  {
    family: 'Arimo', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 0.905, descent: 0.212 },
    faces: full('Arimo-Regular.ttf', 'Arimo-Bold.ttf', 'Arimo-Italic.ttf', 'Arimo-BoldItalic.ttf'),
    acceptance: { hebrewMarkPlacement: true },
  },
  {
    family: 'Tinos', kind: 'text', styleTag: 'serif',
    metrics: { ascent: 0.891, descent: 0.216 },
    faces: full('Tinos-Regular.ttf', 'Tinos-Bold.ttf', 'Tinos-Italic.ttf', 'Tinos-BoldItalic.ttf'),
    acceptance: { hebrewMarkPlacement: true },
  },
  {
    family: 'Cousine', kind: 'text', styleTag: 'mono',
    metrics: { ascent: 0.833, descent: 0.300 },
    faces: full('Cousine-Regular.ttf', 'Cousine-Bold.ttf', 'Cousine-Italic.ttf', 'Cousine-BoldItalic.ttf'),
    acceptance: { hebrewMarkPlacement: true },
  },
  {
    family: 'Assistant', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 1.021, descent: 0.287 },
    faces: normal('Assistant-Regular.ttf', 'Assistant-Bold.ttf'),
    acceptance: { hebrewMarkPlacement: true },
  },
  {
    family: 'Heebo', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 1.048, descent: 0.421 },
    faces: normal('Heebo-Regular.ttf', 'Heebo-Bold.ttf'),
    acceptance: { hebrewMarkPlacement: true },
  },
  {
    family: 'Alef', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 1.009, descent: 0.353 },
    faces: normal('Alef-Regular.ttf', 'Alef-Bold.ttf'),
    acceptance: { hebrewMarkPlacement: true },
  },
  {
    family: 'PT Sans', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 1.018, descent: 0.276 },
    faces: full('PTSans-Regular.ttf', 'PTSans-Bold.ttf', 'PTSans-Italic.ttf', 'PTSans-BoldItalic.ttf'),
  },
  {
    family: 'Scheherazade New', kind: 'text', styleTag: 'serif',
    metrics: { ascent: 1.343, descent: 0.697 },
    faces: normal('ScheherazadeNew-Regular.ttf', 'ScheherazadeNew-Bold.ttf'),
  },
  {
    family: 'Vazirmatn', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 1.025, descent: 0.537 },
    faces: normal('Vazirmatn-Regular.ttf', 'Vazirmatn-Bold.ttf'),
  },
  {
    family: 'Noto Sans JP', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 1.160, descent: 0.288 },
    faces: normal('NotoSansJP-Regular.ttf', 'NotoSansJP-Bold.ttf'),
  },
  {
    family: 'Noto Sans SC', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 1.160, descent: 0.288 },
    faces: normal('NotoSansSC-Regular.ttf', 'NotoSansSC-Bold.ttf'),
  },
  {
    family: 'Noto Sans TC', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 1.160, descent: 0.288 },
    faces: normal('NotoSansTC-Regular.ttf', 'NotoSansTC-Bold.ttf'),
  },
  {
    family: 'Noto Sans KR', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 1.160, descent: 0.288 },
    faces: normal('NotoSansKR-Regular.ttf', 'NotoSansKR-Bold.ttf'),
  },
  {
    family: 'Noto Sans Bengali', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 0.917, descent: 0.408 },
    faces: normal('NotoSansBengali-Regular.ttf', 'NotoSansBengali-Bold.ttf'),
  },
  {
    family: 'Mukta Mahee', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 1.130, descent: 0.532 },
    faces: normal('MuktaMahee-Regular.ttf', 'MuktaMahee-Bold.ttf'),
  },
  {
    family: 'Anek Telugu', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 0.900, descent: 0.600 },
    faces: normal('AnekTelugu-Regular.ttf', 'AnekTelugu-Bold.ttf'),
  },
  {
    family: 'Noto Sans Tamil', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 0.870, descent: 0.370 },
    faces: normal('NotoSansTamil-Regular.ttf', 'NotoSansTamil-Bold.ttf'),
  },
  {
    family: 'Mukta', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 1.130, descent: 0.532 },
    faces: normal('Mukta-Regular.ttf', 'Mukta-Bold.ttf'),
  },
  {
    family: 'IBM Plex Sans Thai', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 1.116, descent: 0.534 },
    faces: normal('IBMPlexSansThai-Regular.ttf', 'IBMPlexSansThai-Bold.ttf'),
  },
  {
    family: 'Anek Malayalam', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 1.018, descent: 0.415 },
    faces: normal('AnekMalayalam-Regular.ttf', 'AnekMalayalam-Bold.ttf'),
  },
  {
    family: 'Gayathri', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 0.732, descent: 0.488 },
    faces: normal('Gayathri-Regular.ttf', 'Gayathri-Bold.ttf'),
  },
  {
    family: 'Suranna', kind: 'text', styleTag: 'serif',
    metrics: { ascent: 1.412, descent: 0.778 },
    faces: normal('Suranna-Regular.ttf'),
  },
  {
    // FONT-08b: second choice for Tamil (upright, alongside the existing
    // Noto Sans Tamil). No Bold upstream - faces is a plain object rather
    // than normal()/full() since neither helper expresses "normal + italic,
    // no bold"; hasRealFace()/requestedFontFile() key off individual face
    // entries, so Bold is simply absent and the picker disables it honestly
    // (docs/wysiwyg-text-architecture.md §3.4) rather than synthesizing one.
    family: 'Tiro Tamil', kind: 'text', styleTag: 'serif',
    metrics: { ascent: 0.755, descent: 0.245 },
    faces: { normal: 'TiroTamil-Regular.ttf', italic: 'TiroTamil-Italic.ttf' },
  },
  {
    // FONT-08b second choice for Punjabi/Gurmukhi (Mukta Mahee is the
    // first): a serif, not a second sans, and ships Regular + Italic only -
    // there is no Bold. `hasRealFace`/`resolveTypography` (src/editor/text/fonts.js)
    // already clamp Bold/Italic per exact file, so an italic-without-bold
    // face needs no special casing - the same generic mechanism that
    // disables Bold for every Regular-only handwriting face above disables
    // it here too.
    family: 'Tiro Gurmukhi', kind: 'text', styleTag: 'serif',
    metrics: { ascent: 0.755, descent: 0.245 },
    faces: { normal: 'TiroGurmukhi-Regular.ttf', italic: 'TiroGurmukhi-Italic.ttf' },
  },
  {
    family: 'Tillana', kind: 'handwriting', styleTag: 'handwriting',
    metrics: { ascent: 1.158, descent: 0.484 },
    faces: normal('Tillana-Regular.ttf', 'Tillana-Bold.ttf'),
  },
  {
    family: 'Hind Siliguri', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 1.116, descent: 0.501 },
    faces: normal('HindSiliguri-Regular.ttf', 'HindSiliguri-Bold.ttf'),
  },
  {
    family: 'Mynerve', kind: 'handwriting', styleTag: 'handwriting',
    metrics: { ascent: 0.930, descent: 0.380 },
    faces: normal('Mynerve-Regular.ttf'),
  },
]);

export const FONT_FILES = FONT_MANIFEST.flatMap((font) => Object.values(font.faces));
export const DEFAULT_FONT_FAMILY = 'Arimo';

// Persisted drafts can still carry retired names for 14 days. Mapping them
// here keeps editor and export on the same replacement after files disappear.
export const RETIRED_FONTS = {
  'Playpen Sans Hebrew': 'Gveret Levin',
  Almarai: 'Scheherazade New',
};

export const FONT_BY_FAMILY = Object.freeze(Object.fromEntries(FONT_MANIFEST.map((font) => [font.family, font])));

/**
 * ARCH-22: the one bundled font file the service worker precaches
 * unconditionally, independent of any pack a visitor chooses - today, the
 * default family's normal face (see src/site-lib/precachePolicy.js for why:
 * a first-ever offline Sign session needs at least one embeddable font).
 * `src/tools/sign/fontOfflinePacks.js` reads the same predicate to know the
 * default family needs no separate offline pack, rather than restating
 * "family === DEFAULT_FONT_FAMILY" a second time - a tool may not import
 * src/site-lib/ (docs/module-boundaries.md rule 1), so this lives here,
 * next to the manifest both call sites already import.
 */
export function isPrecachedFontFile(file) {
  return file === FONT_BY_FAMILY[DEFAULT_FONT_FAMILY].faces.normal;
}

/**
 * `@font-face` weight/style for each face key. Policy about faces, not about
 * generation, so it moved here (out of scripts/generate-font-manifest.mjs)
 * alongside the manifest it describes; the generator imports it to emit
 * src/styles/editorFonts.css.
 */
export const FACE_CSS = Object.freeze({
  normal: { weight: 400, style: 'normal' },
  bold: { weight: 700, style: 'normal' },
  italic: { weight: 400, style: 'italic' },
  boldItalic: { weight: 700, style: 'italic' },
});
