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
    coverageIds: ['latin', 'latinExt'], families: ['Kalam', 'Mali', 'Arimo', 'Tinos', 'Cousine', 'Heebo', 'Alef', 'PT Sans', 'Noto Sans Bengali', 'Mukta Mahee', 'Noto Sans Tamil', 'Mukta'],
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
    regions: ['India; Marathi includes ळ and ऱ'], coverageIds: ['devanagari', 'marathi'], families: ['Kalam', 'Mukta'],
    sample: 'नमस्ते भारत २०२६', direction: 'ltr',
    shaping: { status: 'guarded', guards: ['e2e/sign/devanagari-shaping-guard.spec.js', 'e2e/sign/devanagari-mukta-shaping-guard.spec.js'] },
    visual: { guards: ['e2e/sign/devanagari-shaping-guard.spec.js', 'e2e/sign/devanagari-mukta-shaping-guard.spec.js', 'e2e/sign/export-render-guard.spec.js'], cases: ['devanagari-kalam'] },
  },
  {
    order: 5, status: 'shipped', id: 'arabic', languages: ['Arabic'],
    regions: ['Middle East', 'North Africa'], coverageIds: ['arabic'], families: ['Scheherazade New'],
    sample: 'مرحبا ٢٠٢٦', direction: 'rtl',
    shaping: { status: 'guarded', guards: ['e2e/sign/arabic-shaping-guard.spec.js'] },
    visual: { guards: ['e2e/sign/arabic-shaping-guard.spec.js', 'e2e/sign/export-render-guard.spec.js'], cases: ['arabic-scheherazade-new'] },
  },
  {
    order: 6, status: 'shipped', id: 'perso-arabic', languages: ['Dari', 'Farsi', 'Urdu', 'Pashto'],
    regions: ['Afghanistan', 'Iran', 'Pakistan; Urdu exports in Naskh, not conventional Nastaliq'],
    coverageIds: ['farsi', 'urdu', 'pashto'], families: ['Scheherazade New'],
    sample: 'پښتو ۲۰۲۶', direction: 'rtl',
    shaping: { status: 'guarded', guards: ['e2e/sign/arabic-shaping-guard.spec.js'] },
    visual: { guards: ['e2e/sign/arabic-shaping-guard.spec.js', 'e2e/sign/export-render-guard.spec.js'], cases: ['arabic-scheherazade-new'] },
  },
  {
    order: 7, status: 'shipped', id: 'bengali-assamese', languages: ['Bengali (Bangla)', 'Assamese'],
    regions: ['Bangladesh', 'India; Assamese includes ৰ and ৱ'], coverageIds: ['bengali', 'assamese'], families: ['Noto Sans Bengali'],
    sample: 'নমস্কার ২০২৬', direction: 'ltr',
    shaping: { status: 'guarded', guards: ['e2e/sign/bengali-shaping-guard.spec.js'] },
    visual: { guards: ['e2e/sign/bengali-shaping-guard.spec.js', 'e2e/sign/export-render-guard.spec.js'], cases: ['bengali-noto-sans-bengali'] },
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
    order: 9, status: 'shipped', id: 'japanese', languages: ['Japanese'], regions: ['Japan'],
    coverageIds: ['japanese'], families: ['Noto Sans JP'], sample: '佐藤さくら 2026', direction: 'ltr',
    shaping: { status: 'not-applicable', reason: 'Kana and accepted kanji use independent glyphs; advance parity is the shaping risk.' },
    visual: { guards: ['e2e/sign/cjk-advance-parity-guard.spec.js', 'e2e/sign/export-render-guard.spec.js'], cases: ['japanese-noto-sans-jp'] },
  },
  {
    order: 10, status: 'shipped', id: 'korean', languages: ['Korean'], regions: ['South Korea'],
    coverageIds: ['korean'], families: ['Noto Sans KR'], sample: '안녕하세요 2026', direction: 'ltr',
    shaping: { status: 'not-applicable', reason: 'Modern precomposed Hangul syllables use independent glyphs; advance parity is the shaping risk.' },
    visual: { guards: ['e2e/sign/cjk-advance-parity-guard.spec.js', 'e2e/sign/export-render-guard.spec.js'], cases: ['korean-noto-sans-kr'] },
  },
  {
    order: 11, status: 'shipped', id: 'vietnamese', languages: ['Vietnamese'], regions: ['Vietnam'],
    coverageIds: ['vietnamese'], families: ['Arimo', 'Tinos', 'Cousine', 'Mali'], sample: 'Cảm ơn 2026', direction: 'ltr',
    shaping: { status: 'not-applicable', reason: 'The accepted text uses precomposed Latin glyphs without contextual reordering.' },
    visual: { guards: ['e2e/sign/latin-shaping-guard.spec.js'], cases: [] },
  },
  {
    order: 12, status: 'shipped', id: 'thai', languages: ['Thai'], regions: ['Thailand'],
    coverageIds: ['thai'], families: ['Mali', 'IBM Plex Sans Thai'], sample: 'สวัสดี ๒๐๒๖', direction: 'ltr',
    shaping: { status: 'guarded', guards: ['e2e/sign/thai-font-parity.spec.js'] },
    visual: { guards: ['e2e/sign/thai-font-parity.spec.js', 'e2e/sign/export-render-guard.spec.js'], cases: ['thai-mali'] },
  },
  {
    order: 13, status: 'shipped', id: 'telugu', languages: ['Telugu'], regions: ['India'],
    coverageIds: ['telugu'], families: ['Anek Telugu'], sample: 'తెలుగు ౨౦౨౬', direction: 'ltr',
    shaping: { status: 'guarded', guards: ['e2e/sign/telugu-shaping-guard.spec.js'] },
    visual: { guards: ['e2e/sign/telugu-shaping-guard.spec.js'], cases: [] },
  },
  {
    order: 14, status: 'shipped', id: 'tamil', languages: ['Tamil'], regions: ['India', 'Sri Lanka'],
    coverageIds: ['tamil'], families: ['Noto Sans Tamil'], sample: 'வணக்கம் ௨௦௨௬', direction: 'ltr',
    shaping: { status: 'guarded', guards: ['e2e/sign/tamil-shaping-guard.spec.js'] },
    visual: { guards: ['e2e/sign/tamil-shaping-guard.spec.js'], cases: [] },
  },
  {
    order: 15, status: 'shipped', id: 'punjabi', languages: ['Punjabi (Gurmukhi)'], regions: ['India'],
    coverageIds: ['punjabi'], families: ['Mukta Mahee'], sample: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ ੨੦੨੬', direction: 'ltr',
    shaping: { status: 'guarded', guards: ['e2e/sign/gurmukhi-shaping-guard.spec.js'] },
    visual: { guards: ['e2e/sign/gurmukhi-shaping-guard.spec.js'], cases: [] },
  },
  {
    order: 16, status: 'shipped', id: 'malayalam', languages: ['Malayalam'], regions: ['India'],
    coverageIds: ['malayalam'], families: ['Anek Malayalam'], sample: 'നമസ്കാരം ൨൦൨൬', direction: 'ltr',
    shaping: { status: 'guarded', guards: ['e2e/sign/malayalam-shaping-guard.spec.js'] },
    visual: { guards: ['e2e/sign/malayalam-shaping-guard.spec.js', 'e2e/sign/export-render-guard.spec.js'], cases: ['malayalam-anek-malayalam'] },
  },
  {
    order: 17, status: 'shipped', id: 'greek', languages: ['Greek'], regions: ['Greece', 'Cyprus'],
    coverageIds: ['greek'], families: ['Arimo', 'Tinos', 'Cousine'], sample: 'Καλημέρα 2026', direction: 'ltr',
    shaping: { status: 'not-applicable', reason: 'No joining or reordering feature is required for the accepted sample.' },
    visual: { guards: ['e2e/sign/export-render-guard.spec.js'], cases: ['greek-tinos'] },
  },
  {
    order: 18, status: 'shipped', id: 'hebrew', languages: ['Hebrew'], regions: ['Israel'],
    coverageIds: ['hebrew'], families: ['Arimo', 'Tinos', 'Cousine', 'Assistant', 'Heebo', 'Alef', 'Gveret Levin'],
    sample: 'שלום 2026', direction: 'rtl',
    shaping: { status: 'guarded', guards: ['e2e/sign/hebrew-font-parity.spec.js', 'e2e/sign/hebrew-composition-guard.spec.js'] },
    visual: { guards: ['e2e/sign/hebrew-font-parity.spec.js', 'e2e/sign/export-render-guard.spec.js'], cases: ['hebrew-arimo', 'hebrew-heebo', 'substituted-hebrew-handwriting'] },
  },
  {
    order: 19, status: 'planned', id: 'indic-next', languages: ['Gujarati', 'Kannada', 'Odia'],
    regions: ['India'], coverageIds: [], families: [], sample: '', direction: 'ltr',
    shaping: { status: 'pending', guards: [] }, visual: { guards: [], cases: [] },
  },
  {
    order: 20, status: 'planned', id: 'emoji', languages: ['Emoji'], regions: ['Global'],
    coverageIds: [], families: [], sample: '', direction: 'ltr',
    shaping: { status: 'pending', guards: [] }, visual: { guards: [], cases: [] },
  },
];
