/**
 * The canonical bundled-font manifest.
 *
 * Add, remove, or replace a font here, then run `npm run generate:font-manifest`.
 * Runtime catalogue data and editor CSS are generated from this file; the
 * license page, coverage generator, and precache policy read it directly at
 * build time. Keeping copyright prose out of the generated runtime module
 * avoids charging every Sign session for build-only metadata.
 */

const normal = (regular, bold) => ({
  normal: regular,
  ...(bold ? { bold } : {}),
});

const full = (regular, bold, italic, boldItalic) => ({ normal: regular, bold, italic, boldItalic });

export const FONT_MANIFEST = [
  {
    family: 'Caveat', kind: 'handwriting', styleTag: 'handwriting',
    metrics: { ascent: 0.960, descent: 0.300 },
    faces: normal('Caveat-Regular.ttf', 'Caveat-Bold.ttf'),
    license: { version: '1.1', url: 'https://fonts.google.com/specimen/Caveat', copyright: 'Copyright The Caveat Project Authors' },
  },
  {
    family: 'Dancing Script', kind: 'handwriting', styleTag: 'handwriting',
    metrics: { ascent: 0.920, descent: 0.280 },
    faces: normal('DancingScript-Regular.ttf', 'DancingScript-Bold.ttf'),
    license: { version: '1.1', url: 'https://fonts.google.com/specimen/Dancing+Script', copyright: 'Copyright The Dancing Script Project Authors' },
  },
  {
    family: 'Great Vibes', kind: 'handwriting', styleTag: 'handwriting',
    metrics: { ascent: 0.851, descent: 0.401 },
    faces: normal('GreatVibes-Regular.ttf'),
    license: { version: '1.1', url: 'https://fonts.google.com/specimen/Great+Vibes', copyright: 'Copyright The Great Vibes Project Authors' },
  },
  {
    family: 'Gveret Levin', kind: 'handwriting', styleTag: 'handwriting',
    metrics: { ascent: 0.990, descent: 0.310 },
    faces: normal('GveretLevin-Regular.ttf'),
    acceptance: { hebrewMarkPlacement: true },
    license: { version: '1.1', url: 'https://fonts.google.com/specimen/Gveret+Levin', copyright: 'Copyright The Gveret Levin Project Authors' },
  },
  {
    family: 'Kalam', kind: 'handwriting', styleTag: 'handwriting',
    metrics: { ascent: 1.063, descent: 0.531 },
    faces: normal('Kalam-Regular.ttf', 'Kalam-Bold.ttf'),
    license: { version: '2.001', url: 'https://fonts.google.com/specimen/Kalam', copyright: 'Copyright (c) 2014, Indian Type Foundry (info@indiantypefoundry.com)' },
  },
  {
    family: 'Mali', kind: 'handwriting', styleTag: 'handwriting',
    metrics: { ascent: 1.050, descent: 0.250 },
    faces: full('Mali-Regular.ttf', 'Mali-Bold.ttf', 'Mali-Italic.ttf', 'Mali-BoldItalic.ttf'),
    license: { version: '1.000', url: 'https://fonts.google.com/specimen/Mali', copyright: 'Copyright 2018 The Mali Project Authors' },
  },
  {
    family: 'Pacifico', kind: 'handwriting', styleTag: 'handwriting',
    metrics: { ascent: 1.303, descent: 0.453 },
    faces: normal('Pacifico-Regular.ttf'),
    license: { version: '1.1', url: 'https://fonts.google.com/specimen/Pacifico', copyright: 'Copyright The Pacifico Project Authors' },
  },
  {
    family: 'Sacramento', kind: 'handwriting', styleTag: 'handwriting',
    metrics: { ascent: 0.930, descent: 0.529 },
    faces: normal('Sacramento-Regular.ttf'),
    license: { version: '1.1', url: 'https://fonts.google.com/specimen/Sacramento', copyright: 'Copyright The Sacramento Project Authors' },
  },
  {
    family: 'Arimo', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 0.905, descent: 0.212 },
    faces: full('Arimo-Regular.ttf', 'Arimo-Bold.ttf', 'Arimo-Italic.ttf', 'Arimo-BoldItalic.ttf'),
    acceptance: { hebrewMarkPlacement: true },
    license: { version: '1.33', url: 'https://fonts.google.com/specimen/Arimo', copyright: 'Copyright 2020 The Arimo Project Authors (https://github.com/googlefonts/arimo)' },
  },
  {
    family: 'Tinos', kind: 'text', styleTag: 'serif',
    metrics: { ascent: 0.891, descent: 0.216 },
    faces: full('Tinos-Regular.ttf', 'Tinos-Bold.ttf', 'Tinos-Italic.ttf', 'Tinos-BoldItalic.ttf'),
    acceptance: { hebrewMarkPlacement: true },
    license: { version: '1.340', url: 'https://fonts.google.com/specimen/Tinos', copyright: 'Copyright 2026 The Tinos Project Authors (https://github.com/googlefonts/tinos)' },
  },
  {
    family: 'Cousine', kind: 'text', styleTag: 'mono',
    metrics: { ascent: 0.833, descent: 0.300 },
    faces: full('Cousine-Regular.ttf', 'Cousine-Bold.ttf', 'Cousine-Italic.ttf', 'Cousine-BoldItalic.ttf'),
    acceptance: { hebrewMarkPlacement: true },
    license: { version: '1.241', url: 'https://fonts.google.com/specimen/Cousine', copyright: 'Copyright 2026 The Cousine Project Authors (https://github.com/googlefonts/cousine)' },
  },
  {
    family: 'Assistant', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 1.021, descent: 0.287 },
    faces: normal('Assistant-Regular.ttf', 'Assistant-Bold.ttf'),
    acceptance: { hebrewMarkPlacement: true },
    license: { version: '3.000', url: 'https://fonts.google.com/specimen/Assistant', copyright: "Copyright 2020 The Assistant Project Authors (https://github.com/hafontia/Assistant). Copyright 2010 The Source Sans Pro Authors (https://github.com/adobe-fonts/source-sans-pro), with Reserved Font Name 'Source'." },
  },
  {
    family: 'Heebo', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 1.048, descent: 0.421 },
    faces: normal('Heebo-Regular.ttf', 'Heebo-Bold.ttf'),
    acceptance: { hebrewMarkPlacement: true },
    license: { version: '3.100', url: 'https://fonts.google.com/specimen/Heebo', copyright: 'Copyright 2014 The Heebo Project Authors (https://github.com/OdedEzer/heebo)' },
  },
  {
    family: 'Alef', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 1.009, descent: 0.353 },
    faces: normal('Alef-Regular.ttf', 'Alef-Bold.ttf'),
    acceptance: { hebrewMarkPlacement: true },
    license: { version: '1.1', url: 'https://fonts.google.com/specimen/Alef', copyright: 'Copyright (c) 2012, HaGilda & Mushon Zer-Aviv (alef@hagilda.com), with Reserved Font Name Alef' },
  },
  {
    family: 'PT Sans', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 1.018, descent: 0.276 },
    faces: full('PTSans-Regular.ttf', 'PTSans-Bold.ttf', 'PTSans-Italic.ttf', 'PTSans-BoldItalic.ttf'),
    license: { version: '2.003', url: 'https://fonts.google.com/specimen/PT+Sans', copyright: 'Copyright (c) 2010, ParaType Ltd. (http://www.paratype.com/public), with Reserved Font Names "PT Sans" and "ParaType"' },
  },
  {
    family: 'Scheherazade New', kind: 'text', styleTag: 'serif',
    metrics: { ascent: 1.343, descent: 0.697 },
    faces: normal('ScheherazadeNew-Regular.ttf', 'ScheherazadeNew-Bold.ttf'),
    license: { version: '4.500', url: 'https://fonts.google.com/specimen/Scheherazade+New', copyright: 'Copyright (c) 1994-2026, SIL Global (https://www.sil.org/), with Reserved Font Names "Scheherazade" and "SIL"' },
  },
  {
    family: 'Noto Sans JP', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 1.160, descent: 0.288 },
    faces: normal('NotoSansJP-Regular.ttf', 'NotoSansJP-Bold.ttf'),
    license: { version: '2.004-H2', url: 'https://fonts.google.com/specimen/Noto+Sans+JP', copyright: "(c) 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'." },
  },
  {
    family: 'Noto Sans SC', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 1.160, descent: 0.288 },
    faces: normal('NotoSansSC-Regular.ttf', 'NotoSansSC-Bold.ttf'),
    license: { version: '2.004-H2', url: 'https://fonts.google.com/specimen/Noto+Sans+SC', copyright: "(c) 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'." },
  },
  {
    family: 'Noto Sans TC', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 1.160, descent: 0.288 },
    faces: normal('NotoSansTC-Regular.ttf', 'NotoSansTC-Bold.ttf'),
    license: { version: '2.004-H2', url: 'https://fonts.google.com/specimen/Noto+Sans+TC', copyright: "(c) 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'." },
  },
  {
    family: 'Noto Sans KR', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 1.160, descent: 0.288 },
    faces: normal('NotoSansKR-Regular.ttf', 'NotoSansKR-Bold.ttf'),
    license: { version: '2.004-H2', url: 'https://fonts.google.com/specimen/Noto+Sans+KR', copyright: "(c) 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'." },
  },
  {
    family: 'Noto Sans Bengali', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 0.917, descent: 0.408 },
    faces: normal('NotoSansBengali-Regular.ttf', 'NotoSansBengali-Bold.ttf'),
    license: { version: '3.011', url: 'https://fonts.google.com/specimen/Noto+Sans+Bengali', copyright: 'Copyright 2025 The Noto Project Authors (https://github.com/notofonts/bengali)' },
  },
  {
    family: 'Mukta Mahee', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 1.130, descent: 0.532 },
    faces: normal('MuktaMahee-Regular.ttf', 'MuktaMahee-Bold.ttf'),
    license: { version: '2.538', url: 'https://fonts.google.com/specimen/Mukta+Mahee', copyright: 'Copyright (c) 2017, Ek Type. All rights reserved.' },
  },
  {
    family: 'Anek Telugu', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 0.900, descent: 0.600 },
    faces: normal('AnekTelugu-Regular.ttf', 'AnekTelugu-Bold.ttf'),
    license: { version: '1.003', url: 'https://fonts.google.com/specimen/Anek+Telugu', copyright: 'Copyright 2021 The Anek Project Authors (https://github.com/EkType/Anek)' },
  },
  {
    family: 'Noto Sans Tamil', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 0.870, descent: 0.370 },
    faces: normal('NotoSansTamil-Regular.ttf', 'NotoSansTamil-Bold.ttf'),
    license: { version: '2.004', url: 'https://fonts.google.com/specimen/Noto+Sans+Tamil', copyright: 'Copyright 2022 The Noto Project Authors (https://github.com/notofonts/tamil)' },
  },
  {
    family: 'Mukta', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 1.130, descent: 0.532 },
    faces: normal('Mukta-Regular.ttf', 'Mukta-Bold.ttf'),
    license: { version: '2.538', url: 'https://fonts.google.com/specimen/Mukta', copyright: 'Copyright (c) 2014, Girish Dalvi, Ek Type. All rights reserved.' },
  },
  {
    family: 'IBM Plex Sans Thai', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 1.116, descent: 0.534 },
    faces: normal('IBMPlexSansThai-Regular.ttf', 'IBMPlexSansThai-Bold.ttf'),
    license: { version: '1.1', url: 'https://fonts.google.com/specimen/IBM+Plex+Sans+Thai', copyright: 'Copyright © 2017 IBM Corp. with Reserved Font Name "Plex"' },
  },
  {
    family: 'Anek Malayalam', kind: 'text', styleTag: 'sans',
    metrics: { ascent: 1.018, descent: 0.415 },
    faces: normal('AnekMalayalam-Regular.ttf', 'AnekMalayalam-Bold.ttf'),
    license: { version: '1.003', url: 'https://fonts.google.com/specimen/Anek+Malayalam', copyright: 'Copyright 2021 The Anek Project Authors (https://github.com/EkType/Anek)' },
  },
];

export const FONT_FILES = FONT_MANIFEST.flatMap((font) => Object.values(font.faces));
export const PRECACHED_FONT_FILES = FONT_MANIFEST
  .filter((font) => font.precache === true)
  .flatMap((font) => Object.values(font.faces));

export const DEFAULT_FONT_FAMILY = 'Arimo';

// Persisted drafts can still carry retired names for 14 days. Mapping them
// here keeps editor and export on the same replacement after files disappear.
export const RETIRED_FONTS = {
  'Playpen Sans Hebrew': 'Gveret Levin',
  Almarai: 'Scheherazade New',
};
