/**
 * Display-only bundled fonts: TTFs in `public/fonts/` that exist purely for
 * marketing/demo chrome - never selectable in the Sign editor's font picker,
 * never passed to `signPdf`/fontkit - so they are deliberately kept out of
 * `scripts/font-manifest.mjs`. That manifest drives the editor's runtime
 * catalogue, its generated `@font-face` CSS, and the export path; none of
 * that applies to a font a document can never actually use.
 *
 * `src/lib/fontAttribution.test.js`'s "every TTF on disk has a catalogue
 * entry" check only knows about `FONT_MANIFEST` by default, so without this
 * file a display-only font would be silently invisible to it - exactly the
 * failure mode that test exists to prevent (see its own comment: "a font
 * bundled but never registered would be invisible to it"). Registering a
 * font here, instead of adding a bare exception inside the test, keeps that
 * guarantee intact: a future font in *neither* list still fails the build,
 * and an entry here still has to point at a real, currently-shipping
 * catalogue family (checked by the test) whose OFL notice already covers it
 * - it does not get to invent its own unverified license metadata.
 */
export const DISPLAY_ONLY_FONTS = [
  {
    file: 'CaveatDemo-Bold.ttf',
    // The family already credited in THIRD_PARTY_LICENSES.md / /licenses/
    // (via FONT_MANIFEST) whose OFL 1.1 grant covers this file too - it is
    // the same upstream bytes, just subset.
    sourceFamily: 'Caveat',
    reason:
      "A Latin-range (Basic Latin + Latin-1 Supplement + Latin Extended-A, " +
      "plus common punctuation) subset of the bundled editor face " +
      "Caveat-Bold.ttf, built by scripts/fonts/build-demo-font-subset.py. " +
      "Declared under the CSS family name 'Caveat Demo' in " +
      "src/components/HeroDemo/HeroDemo.module.css and used only by the " +
      "homepage hero demo's handwritten caption, to keep the full ~303KB " +
      "editor face off the homepage's critical rendering path. Never " +
      "registered in src/editor/text/fontManifest.js and never handed to " +
      "signPdf, so it carries no export/shaping obligations of its own.",
  },
  {
    file: 'GveretLevinDemo-Regular.ttf',
    // Already credited in THIRD_PARTY_LICENSES.md / /licenses/ (via
    // FONT_MANIFEST, as the editor's Hebrew handwriting fallback face)
    // whose OFL 1.1 grant covers this file too - it is the same upstream
    // bytes, just subset.
    sourceFamily: 'Gveret Levin',
    reason:
      "A Hebrew-range (niqqud, the Hebrew letters, Hebrew punctuation, " +
      "Basic Latin, plus common punctuation) subset of the bundled editor " +
      "face GveretLevin-Regular.ttf, built by " +
      "scripts/fonts/build-hebrew-demo-font-subset.py. Declared under the " +
      "CSS family name 'Gveret Levin Demo' in " +
      "src/components/HeroDemo/HeroDemo.module.css and used only by the " +
      "Hebrew edition of the homepage hero demo's handwritten caption " +
      "(LOC-09), the Hebrew counterpart to 'Caveat Demo' above. Never " +
      "registered in src/editor/text/fontManifest.js and never handed to " +
      "signPdf, so it carries no export/shaping obligations of its own.",
  },
];
