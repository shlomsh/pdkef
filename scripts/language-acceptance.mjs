/**
 * Named rollout and acceptance contract for text added by the Sign tool.
 *
 * `coverageIds` point at the real-alphabet definitions in font-languages.mjs.
 * Shipped rows must name the fonts and standing Chrome/PDF guards that prove
 * them. Planned rows deliberately carry no acceptance evidence.
 */
export const LANGUAGE_ACCEPTANCE_MATRIX = [
  {
    order: 1, status: 'shipped', id: 'latin-core',
    languages: ['English', 'Spanish', 'French', 'German', 'Portuguese', 'Indonesian', 'Malay', 'Filipino', 'Irish', 'Polish'],
    regions: ['Latin script; regional accents are covered by the separate Latin Extended set'],
    coverageIds: ['latin', 'latinExt'], families: ['Kalam', 'Mali', 'Sriracha', 'Arimo', 'Tinos', 'Cousine', 'Heebo', 'Alef', 'PT Sans', 'Noto Sans Bengali', 'Mukta Mahee', 'Noto Sans Tamil', 'Mukta'],
    sample: 'Zażółć café 2026', direction: 'ltr',
    shaping: { status: 'guarded', guards: ['e2e/sign/latin-shaping-guard.spec.js'] },
    visual: { guards: ['e2e/sign/latin-shaping-guard.spec.js', 'e2e/sign/export-render-guard.spec.js'], cases: ['latin-arimo', 'latin-pacifico', 'latin-caveat', 'latin-great-vibes'] },
  },
  {
    order: 2, status: 'shipped', id: 'chinese-simplified', languages: ['Chinese (Simplified)'],
    regions: ['Mainland China', 'Singapore'], coverageIds: [], families: ['Noto Sans SC'],
    sample: '你好 2026', direction: 'ltr',
    shaping: { status: 'not-applicable', reason: 'The accepted subset uses independent Han glyphs; advance parity is the shaping risk.' },
    visual: { guards: ['e2e/sign/cjk-advance-parity-guard.spec.js', 'e2e/sign/export-render-guard.spec.js'], cases: ['chinese-simplified-noto-sans-sc'] },
  },
  {
    order: 3, status: 'shipped', id: 'chinese-traditional', languages: ['Chinese (Traditional)'],
    regions: ['Taiwan', 'Hong Kong', 'Macao'], coverageIds: [], families: ['Noto Sans TC'],
    sample: '謝謝 2026', direction: 'ltr',
    shaping: { status: 'not-applicable', reason: 'The accepted subset uses independent Han glyphs; advance parity is the shaping risk.' },
    visual: { guards: ['e2e/sign/cjk-advance-parity-guard.spec.js', 'e2e/sign/export-render-guard.spec.js'], cases: ['chinese-traditional-noto-sans-tc'] },
  },
  {
    order: 4, status: 'shipped', id: 'devanagari', languages: ['Hindi', 'Marathi'],
    regions: ['India; Marathi includes ळ and ऱ'], coverageIds: ['devanagari', 'marathi'], families: ['Kalam', 'Mukta', 'Tillana'],
    sample: 'नमस्ते भारत २०२६', direction: 'ltr',
    shaping: { status: 'guarded', guards: ['e2e/sign/devanagari-shaping-guard.spec.js', 'e2e/sign/devanagari-mukta-shaping-guard.spec.js', 'e2e/sign/devanagari-tillana-shaping-guard.spec.js'] },
    visual: { guards: ['e2e/sign/devanagari-shaping-guard.spec.js', 'e2e/sign/devanagari-mukta-shaping-guard.spec.js', 'e2e/sign/export-render-guard.spec.js', 'e2e/sign/devanagari-tillana-shaping-guard.spec.js'], cases: ['devanagari-kalam', 'devanagari-tillana'] },
  },
  {
    order: 5, status: 'shipped', id: 'arabic', languages: ['Arabic'],
    regions: ['Middle East', 'North Africa'], coverageIds: ['arabic'], families: ['Scheherazade New', 'Vazirmatn'],
    sample: 'مرحبا ٢٠٢٦', direction: 'rtl',
    shaping: { status: 'guarded', guards: ['e2e/sign/arabic-shaping-guard.spec.js', 'e2e/sign/arabic-vazirmatn-shaping-guard.spec.js', 'e2e/sign/arabic-vazirmatn-font-parity.spec.js'] },
    visual: { guards: ['e2e/sign/arabic-shaping-guard.spec.js', 'e2e/sign/export-render-guard.spec.js', 'e2e/sign/arabic-vazirmatn-shaping-guard.spec.js', 'e2e/sign/arabic-vazirmatn-font-parity.spec.js'], cases: ['arabic-scheherazade-new', 'arabic-vazirmatn'] },
  },
  {
    order: 6, status: 'shipped', id: 'perso-arabic', languages: ['Dari', 'Farsi', 'Urdu', 'Pashto'],
    regions: ['Afghanistan', 'Iran', 'Pakistan; Urdu exports in Naskh, not conventional Nastaliq'],
    coverageIds: ['farsi', 'urdu', 'pashto'], families: ['Scheherazade New', 'Vazirmatn'],
    sample: 'پښتو ۲۰۲۶', direction: 'rtl',
    shaping: { status: 'guarded', guards: ['e2e/sign/arabic-shaping-guard.spec.js', 'e2e/sign/arabic-vazirmatn-shaping-guard.spec.js', 'e2e/sign/arabic-vazirmatn-font-parity.spec.js'] },
    visual: { guards: ['e2e/sign/arabic-shaping-guard.spec.js', 'e2e/sign/export-render-guard.spec.js', 'e2e/sign/arabic-vazirmatn-shaping-guard.spec.js', 'e2e/sign/arabic-vazirmatn-font-parity.spec.js'], cases: ['arabic-scheherazade-new', 'arabic-vazirmatn'] },
  },
  {
    order: 7, status: 'shipped', id: 'bengali-assamese', languages: ['Bengali (Bangla)', 'Assamese'],
    regions: ['Bangladesh', 'India; Assamese includes ৰ and ৱ'], coverageIds: ['bengali', 'assamese'], families: ['Noto Sans Bengali', 'Hind Siliguri'],
    sample: 'নমস্কার ২০২৬', direction: 'ltr',
    shaping: { status: 'guarded', guards: ['e2e/sign/bengali-shaping-guard.spec.js', 'e2e/sign/bengali-hind-siliguri-shaping-guard.spec.js'] },
    visual: { guards: ['e2e/sign/bengali-shaping-guard.spec.js', 'e2e/sign/export-render-guard.spec.js', 'e2e/sign/bengali-hind-siliguri-shaping-guard.spec.js'], cases: ['bengali-noto-sans-bengali', 'bengali-hind-siliguri'] },
  },
  {
    order: 8, status: 'shipped', id: 'cyrillic',
    languages: ['Russian', 'Ukrainian', 'Belarusian', 'Bulgarian', 'Serbian (Cyrillic)', 'Macedonian', 'Kazakh (Cyrillic)'],
    regions: ['Eastern Europe', 'Central Asia'],
    coverageIds: ['cyrillicRussian', 'cyrillicUkrainian', 'cyrillicBelarusian', 'cyrillicBulgarian', 'cyrillicSerbian', 'cyrillicMacedonian', 'cyrillicKazakh'],
    families: ['PT Sans'], sample: 'Привіт 2026', direction: 'ltr',
    shaping: { status: 'not-applicable', reason: 'No joining or reordering feature is required for the accepted sample.' },
    visual: { guards: ['e2e/sign/export-render-guard.spec.js'], cases: ['cyrillic-pt-sans'] },
  },
  {
    // FONT-08b: Neucha, the first Cyrillic handwriting face, as its own row
    // rather than added to 'cyrillic' above - it does not cover Kazakh's
    // eight extra letters (ә, ғ, қ, ң, ө, ұ, ү, һ; see fontCoverageReport.js's
    // cyrillicKazakh row, 0.805 partial, Neucha absent from .full), and
    // languageAcceptance.test.js requires every family in a row to be full
    // on every coverageId the row declares - PT Sans is full on all seven
    // anchor languages, Neucha only on six, so the two cannot share a row.
    order: 9, status: 'shipped', id: 'cyrillic-handwriting',
    languages: ['Russian', 'Ukrainian', 'Belarusian', 'Bulgarian', 'Serbian (Cyrillic)', 'Macedonian'],
    regions: ['Eastern Europe'],
    coverageIds: ['cyrillicRussian', 'cyrillicUkrainian', 'cyrillicBelarusian', 'cyrillicBulgarian', 'cyrillicSerbian', 'cyrillicMacedonian'],
    families: ['Neucha', 'Amatic SC'], sample: 'Привіт 2026', direction: 'ltr',
    shaping: { status: 'guarded', guards: ['e2e/sign/cyrillic-shaping-guard.spec.js'] },
    visual: { guards: ['e2e/sign/cyrillic-shaping-guard.spec.js', 'e2e/sign/export-render-guard.spec.js'], cases: ['cyrillic-neucha', 'cyrillic-amatic-sc'] },
  },
  {
    order: 10, status: 'shipped', id: 'japanese', languages: ['Japanese'], regions: ['Japan'],
    coverageIds: ['japanese'], families: ['Noto Sans JP'], sample: '佐藤さくら 2026', direction: 'ltr',
    shaping: { status: 'not-applicable', reason: 'Kana and accepted kanji use independent glyphs; advance parity is the shaping risk.' },
    visual: { guards: ['e2e/sign/cjk-advance-parity-guard.spec.js', 'e2e/sign/export-render-guard.spec.js'], cases: ['japanese-noto-sans-jp'] },
  },
  {
    order: 11, status: 'shipped', id: 'korean', languages: ['Korean'], regions: ['South Korea'],
    coverageIds: ['korean'], families: ['Noto Sans KR'], sample: '안녕하세요 2026', direction: 'ltr',
    shaping: { status: 'not-applicable', reason: 'Modern precomposed Hangul syllables use independent glyphs; advance parity is the shaping risk.' },
    visual: { guards: ['e2e/sign/cjk-advance-parity-guard.spec.js', 'e2e/sign/export-render-guard.spec.js'], cases: ['korean-noto-sans-kr'] },
  },
  {
    order: 12, status: 'shipped', id: 'vietnamese', languages: ['Vietnamese'], regions: ['Vietnam'],
    coverageIds: ['vietnamese'], families: ['Arimo', 'Tinos', 'Cousine', 'Mali', 'Amatic SC', 'Sriracha'], sample: 'Cảm ơn 2026', direction: 'ltr',
    shaping: { status: 'not-applicable', reason: 'The accepted text uses precomposed Latin glyphs without contextual reordering.' },
    visual: { guards: ['e2e/sign/latin-shaping-guard.spec.js'], cases: [] },
  },
  {
    order: 13, status: 'shipped', id: 'thai', languages: ['Thai'], regions: ['Thailand'],
    coverageIds: ['thai'], families: ['Mali', 'Sriracha', 'IBM Plex Sans Thai'], sample: 'สวัสดี ๒๐๒๖', direction: 'ltr',
    // FONT-08b, 2026-09-12: Sriracha joined Mali as Thai's second handwriting
    // face. Guard A (thai-sriracha-font-parity.spec.js) is clean on every
    // Thai sample (0.000px); it landed with one recorded Latin-kerning delta
    // (1.024px on "Sarah Levi", test.fixme, same debt class as Caveat's own
    // known-red Latin case under SIGN-20) - see backlog/tasks/FONT-08.md.
    shaping: { status: 'guarded', guards: ['e2e/sign/thai-font-parity.spec.js', 'e2e/sign/thai-sriracha-font-parity.spec.js'] },
    visual: { guards: ['e2e/sign/thai-font-parity.spec.js', 'e2e/sign/thai-sriracha-font-parity.spec.js', 'e2e/sign/export-render-guard.spec.js'], cases: ['thai-mali', 'thai-sriracha'] },
  },
  {
    order: 14, status: 'shipped', id: 'telugu', languages: ['Telugu'], regions: ['India'],
    coverageIds: ['telugu'], families: ['Anek Telugu', 'Suranna'], sample: 'తెలుగు ౨౦౨౬', direction: 'ltr',
    shaping: { status: 'guarded', guards: ['e2e/sign/telugu-shaping-guard.spec.js', 'e2e/sign/telugu-suranna-shaping-guard.spec.js'] },
    visual: { guards: ['e2e/sign/telugu-shaping-guard.spec.js', 'e2e/sign/telugu-suranna-shaping-guard.spec.js', 'e2e/sign/export-render-guard.spec.js'], cases: ['telugu-suranna'] },
  },
  {
    order: 15, status: 'shipped', id: 'tamil', languages: ['Tamil'], regions: ['India', 'Sri Lanka'],
    coverageIds: ['tamil'], families: ['Noto Sans Tamil', 'Tiro Tamil'], sample: 'வணக்கம் ௨௦௨௬', direction: 'ltr',
    shaping: { status: 'guarded', guards: ['e2e/sign/tamil-shaping-guard.spec.js', 'e2e/sign/tamil-tiro-shaping-guard.spec.js'] },
    visual: { guards: ['e2e/sign/tamil-shaping-guard.spec.js', 'e2e/sign/tamil-tiro-shaping-guard.spec.js', 'e2e/sign/export-render-guard.spec.js'], cases: ['tamil-tiro-tamil'] },
  },
  {
    order: 16, status: 'shipped', id: 'punjabi', languages: ['Punjabi (Gurmukhi)'], regions: ['India'],
    coverageIds: ['punjabi'], families: ['Mukta Mahee', 'Tiro Gurmukhi'], sample: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ ੨੦੨੬', direction: 'ltr',
    shaping: { status: 'guarded', guards: ['e2e/sign/gurmukhi-shaping-guard.spec.js', 'e2e/sign/gurmukhi-tiro-shaping-guard.spec.js'] },
    visual: { guards: ['e2e/sign/gurmukhi-shaping-guard.spec.js', 'e2e/sign/gurmukhi-tiro-shaping-guard.spec.js'], cases: ['gurmukhi-tiro-gurmukhi'] },
  },
  {
    order: 17, status: 'shipped', id: 'malayalam', languages: ['Malayalam'], regions: ['India'],
    coverageIds: ['malayalam'], families: ['Anek Malayalam', 'Gayathri'], sample: 'നമസ്കാരം ൨൦൨൬', direction: 'ltr',
    shaping: { status: 'guarded', guards: ['e2e/sign/malayalam-shaping-guard.spec.js', 'e2e/sign/malayalam-gayathri-shaping-guard.spec.js'] },
    visual: { guards: ['e2e/sign/malayalam-shaping-guard.spec.js', 'e2e/sign/export-render-guard.spec.js', 'e2e/sign/malayalam-gayathri-shaping-guard.spec.js'], cases: ['malayalam-anek-malayalam', 'malayalam-gayathri'] },
  },
  {
    order: 18, status: 'shipped', id: 'greek', languages: ['Greek'], regions: ['Greece', 'Cyprus'],
    coverageIds: ['greek'], families: ['Arimo', 'Tinos', 'Cousine', 'Mynerve'], sample: 'Καλημέρα 2026', direction: 'ltr',
    // FONT-08: Mynerve (handwriting) carries `calt`, so "no joining or
    // reordering feature is required" stopped being true for the whole row
    // the moment it joined - greek-shaping-guard.spec.js and
    // greek-font-parity.spec.js are the guards that actually proved fontkit
    // and the browser agree on it.
    shaping: { status: 'guarded', guards: ['e2e/sign/greek-shaping-guard.spec.js', 'e2e/sign/greek-font-parity.spec.js'] },
    visual: { guards: ['e2e/sign/greek-shaping-guard.spec.js', 'e2e/sign/greek-font-parity.spec.js', 'e2e/sign/export-render-guard.spec.js'], cases: ['greek-tinos', 'greek-mynerve-handwriting'] },
  },
  {
    order: 19, status: 'shipped', id: 'hebrew', languages: ['Hebrew'], regions: ['Israel'],
    coverageIds: ['hebrew'], families: ['Arimo', 'Tinos', 'Cousine', 'Assistant', 'Heebo', 'Alef', 'Gveret Levin', 'Amatic SC'],
    sample: 'שלום 2026', direction: 'rtl',
    shaping: { status: 'guarded', guards: ['e2e/sign/hebrew-font-parity.spec.js', 'e2e/sign/hebrew-composition-guard.spec.js'] },
    visual: { guards: ['e2e/sign/hebrew-font-parity.spec.js', 'e2e/sign/export-render-guard.spec.js'], cases: ['hebrew-arimo', 'hebrew-heebo', 'substituted-hebrew-handwriting', 'hebrew-nikud-amatic-sc'] },
  },
  {
    order: 20, status: 'planned', id: 'indic-next', languages: ['Gujarati', 'Kannada', 'Odia'],
    regions: ['India'], coverageIds: [], families: [], sample: '', direction: 'ltr',
    shaping: { status: 'pending', guards: [] }, visual: { guards: [], cases: [] },
  },
  {
    order: 21, status: 'planned', id: 'emoji', languages: ['Emoji'], regions: ['Global'],
    coverageIds: [], families: [], sample: '', direction: 'ltr',
    shaping: { status: 'pending', guards: [] }, visual: { guards: [], cases: [] },
  },
];
