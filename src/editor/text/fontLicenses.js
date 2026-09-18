/**
 * Per-family OFL license metadata (version, spec URL, copyright line), keyed
 * by family name exactly as it appears in src/editor/text/fontManifest.js.
 *
 * Kept out of fontManifest.js on purpose: the editor and the exporter both
 * import that module on every Sign session, and copyright prose has no
 * runtime use there - only the build-time /licenses/ page
 * (src/pages/licenses.astro) and scripts/generate-font-manifest.mjs (which
 * writes the THIRD_PARTY_LICENSES.md font lists) read this file. Nothing
 * under src/ should import it outside licenses.astro and this module's own
 * test; fontLicenses.test.js asserts the two modules' family key sets are
 * identical, so a font added to one and not the other fails fast.
 */
import { FONT_MANIFEST } from './fontManifest.js';

export const FONT_LICENSES = Object.freeze({
  Caveat: { version: '1.1', url: 'https://fonts.google.com/specimen/Caveat', copyright: 'Copyright The Caveat Project Authors' },
  'Dancing Script': { version: '1.1', url: 'https://fonts.google.com/specimen/Dancing+Script', copyright: 'Copyright The Dancing Script Project Authors' },
  'Great Vibes': { version: '1.1', url: 'https://fonts.google.com/specimen/Great+Vibes', copyright: 'Copyright The Great Vibes Project Authors' },
  'Gveret Levin': { version: '1.1', url: 'https://fonts.google.com/specimen/Gveret+Levin', copyright: 'Copyright The Gveret Levin Project Authors' },
  Kalam: { version: '2.001', url: 'https://fonts.google.com/specimen/Kalam', copyright: 'Copyright (c) 2014, Indian Type Foundry (info@indiantypefoundry.com)' },
  Mali: { version: '1.000', url: 'https://fonts.google.com/specimen/Mali', copyright: 'Copyright 2018 The Mali Project Authors' },
  Neucha: { version: '1.1', url: 'https://fonts.google.com/specimen/Neucha', copyright: 'Copyright (c) 2008-2010 by Jovanny Lemonad (http://www.jovanny.ru)' },
  Pacifico: { version: '1.1', url: 'https://fonts.google.com/specimen/Pacifico', copyright: 'Copyright The Pacifico Project Authors' },
  Sacramento: { version: '1.1', url: 'https://fonts.google.com/specimen/Sacramento', copyright: 'Copyright The Sacramento Project Authors' },
  'Amatic SC': { version: '1.1', url: 'https://fonts.google.com/specimen/Amatic+SC', copyright: 'Copyright 2015 The Amatic SC Project Authors (https://github.com/googlefonts/AmaticSC)' },
  Sriracha: { version: '1.1', url: 'https://fonts.google.com/specimen/Sriracha', copyright: 'Copyright (c) 2015, Cadson Demak (info@cadsondemak.com), Copyright (c) 2014, Pablo Impallari (www.impallari.com|impallari@gmail.com)' },
  Arimo: { version: '1.33', url: 'https://fonts.google.com/specimen/Arimo', copyright: 'Copyright 2020 The Arimo Project Authors (https://github.com/googlefonts/arimo)' },
  Tinos: { version: '1.340', url: 'https://fonts.google.com/specimen/Tinos', copyright: 'Copyright 2026 The Tinos Project Authors (https://github.com/googlefonts/tinos)' },
  Cousine: { version: '1.241', url: 'https://fonts.google.com/specimen/Cousine', copyright: 'Copyright 2026 The Cousine Project Authors (https://github.com/googlefonts/cousine)' },
  Assistant: { version: '3.000', url: 'https://fonts.google.com/specimen/Assistant', copyright: "Copyright 2020 The Assistant Project Authors (https://github.com/hafontia/Assistant). Copyright 2010 The Source Sans Pro Authors (https://github.com/adobe-fonts/source-sans-pro), with Reserved Font Name 'Source'." },
  Heebo: { version: '3.100', url: 'https://fonts.google.com/specimen/Heebo', copyright: 'Copyright 2014 The Heebo Project Authors (https://github.com/OdedEzer/heebo)' },
  Alef: { version: '1.1', url: 'https://fonts.google.com/specimen/Alef', copyright: 'Copyright (c) 2012, HaGilda & Mushon Zer-Aviv (alef@hagilda.com), with Reserved Font Name Alef' },
  'PT Sans': { version: '2.003', url: 'https://fonts.google.com/specimen/PT+Sans', copyright: 'Copyright (c) 2010, ParaType Ltd. (http://www.paratype.com/public), with Reserved Font Names "PT Sans" and "ParaType"' },
  'Scheherazade New': { version: '4.500', url: 'https://fonts.google.com/specimen/Scheherazade+New', copyright: 'Copyright (c) 1994-2026, SIL Global (https://www.sil.org/), with Reserved Font Names "Scheherazade" and "SIL"' },
  Vazirmatn: { version: '33.003', url: 'https://fonts.google.com/specimen/Vazirmatn', copyright: 'Copyright 2015 The Vazirmatn Project Authors (https://github.com/rastikerdar/vazirmatn). Latin glyphs combined from Roboto: Copyright 2011 The Roboto Project Authors (https://github.com/googlefonts/roboto-classic), also OFL 1.1.' },
  'Noto Sans JP': { version: '2.004-H2', url: 'https://fonts.google.com/specimen/Noto+Sans+JP', copyright: "(c) 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'." },
  'Noto Sans SC': { version: '2.004-H2', url: 'https://fonts.google.com/specimen/Noto+Sans+SC', copyright: "(c) 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'." },
  'Noto Sans TC': { version: '2.004-H2', url: 'https://fonts.google.com/specimen/Noto+Sans+TC', copyright: "(c) 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'." },
  'Noto Sans KR': { version: '2.004-H2', url: 'https://fonts.google.com/specimen/Noto+Sans+KR', copyright: "(c) 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source'." },
  'Noto Sans Bengali': { version: '3.011', url: 'https://fonts.google.com/specimen/Noto+Sans+Bengali', copyright: 'Copyright 2025 The Noto Project Authors (https://github.com/notofonts/bengali)' },
  'Mukta Mahee': { version: '2.538', url: 'https://fonts.google.com/specimen/Mukta+Mahee', copyright: 'Copyright (c) 2017, Ek Type. All rights reserved.' },
  'Anek Telugu': { version: '1.003', url: 'https://fonts.google.com/specimen/Anek+Telugu', copyright: 'Copyright 2021 The Anek Project Authors (https://github.com/EkType/Anek)' },
  'Noto Sans Tamil': { version: '2.004', url: 'https://fonts.google.com/specimen/Noto+Sans+Tamil', copyright: 'Copyright 2022 The Noto Project Authors (https://github.com/notofonts/tamil)' },
  Mukta: { version: '2.538', url: 'https://fonts.google.com/specimen/Mukta', copyright: 'Copyright (c) 2014, Girish Dalvi, Ek Type. All rights reserved.' },
  'IBM Plex Sans Thai': { version: '1.1', url: 'https://fonts.google.com/specimen/IBM+Plex+Sans+Thai', copyright: 'Copyright © 2017 IBM Corp. with Reserved Font Name "Plex"' },
  'Anek Malayalam': { version: '1.003', url: 'https://fonts.google.com/specimen/Anek+Malayalam', copyright: 'Copyright 2021 The Anek Project Authors (https://github.com/EkType/Anek)' },
  Gayathri: { version: '1.1', url: 'https://fonts.google.com/specimen/Gayathri', copyright: 'Copyright 2019 The Gayathri Project Authors (https://gitlab.com/smc/fonts/gayathri)' },
  Suranna: { version: '1.0.5', url: 'https://fonts.google.com/specimen/Suranna', copyright: "Copyright (c) 2012 Andhrapradesh Society for Knowledge Networks (fonts.siliconandhra.org). Copyright (c) 2011, Cyreal (www.cyreal.org) with Reserved Font Name 'Prata'" },
  'Tiro Tamil': { version: '1.52', url: 'https://fonts.google.com/specimen/Tiro+Tamil', copyright: 'Copyright 2020 The Indigo Project Authors (https://github.com/TiroTypeworks/Indigo)' },
  'Tiro Gurmukhi': { version: '1.52', url: 'https://fonts.google.com/specimen/Tiro+Gurmukhi', copyright: 'Copyright 2020 The Indigo Project Authors (https://github.com/TiroTypeworks/Indigo)' },
  Tillana: { version: '1.1', url: 'https://fonts.google.com/specimen/Tillana', copyright: 'Copyright (c) 2014, Indian Type Foundry (info@indiantypefoundry.com)' },
  'Hind Siliguri': { version: '1.001', url: 'https://fonts.google.com/specimen/Hind+Siliguri', copyright: 'Copyright (c) 2015 Indian Type Foundry (info@indiantypefoundry.com)' },
  Mynerve: { version: '1.000', url: 'https://fonts.google.com/specimen/Mynerve', copyright: 'Copyright 2022 The Mynerve Project Authors (https://github.com/carolinashort/MyNerve)' },
});

/** `FONT_LICENSES[family]`, or throws - every catalogue family must have one. */
export function licenseFor(family) {
  const license = FONT_LICENSES[family];
  if (!license) throw new Error(`No license metadata for font family "${family}"`);
  return license;
}

// Referenced only so a future edit cannot silently narrow this file's scope
// to "some families" - every FONT_MANIFEST family must have a license entry,
// checked at module load rather than only in the test.
for (const font of FONT_MANIFEST) {
  if (!FONT_LICENSES[font.family]) {
    throw new Error(`fontLicenses.js is missing a license entry for "${font.family}"`);
  }
}
