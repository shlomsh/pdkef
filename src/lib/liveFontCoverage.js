import fontkit from '@pdf-lib/fontkit';
import { resolveFontFamily } from '../editor/text/fonts.js';
import { unrepresentableCharacters } from '../editor/registry/text.ts';
import { findUnrepresentableCharacters } from '../editor/text/textCoverage.js';

/**
 * Live coverage checking for the editor, so a character no bundled font can
 * draw is caught **while the user is still typing** rather than at save time.
 *
 * Named `liveFontCoverage`, not `fontCoverage`, deliberately: `fontCoverage.test.js`
 * already exists and tests the *catalogue* claim in `fonts.js` against the real
 * asset bytes. Two files a character apart, one testing a module and one testing
 * a policy, is a trap - this file is the runtime check, that one is the build-time
 * claim.
 *
 * Why this exists at all: the export embeds one font per element with no
 * fallback, while the editor's `@font-face` text falls back per character to a
 * system font. So Arabic, Thai or an emoji looks perfectly fine on screen and
 * is simply absent from the downloaded, signed document
 * (docs/hebrew-text-shaping-export.md, "Layer 3"). `signPdf` refuses rather
 * than ship that, but a refusal at the moment of saving is the latest possible
 * time to learn about it - the user has already finished the document. This
 * module is the same check, moved to the earliest point that has the
 * information.
 *
 * **`document.fonts.check()` cannot do this job**, which is worth recording so
 * nobody swaps it in as the lighter option: it reports whether the matched
 * faces are *loaded*, and a character the chosen face lacks is rendered from a
 * fallback face that is itself loaded, so it answers `true` for exactly the
 * case we need to catch. Reading the real font bytes is the only way.
 *
 * The fetch is the same URL the export uses and the same one `@font-face`
 * already pulled for the editor, so in practice it is served from cache. One
 * fontkit instance is kept per file for the life of the page.
 */
const instances = new Map();

function fileNameFor(family, fontWeight, fontStyle) {
  let styleStr = 'Regular';
  if (fontWeight === 'bold' && fontStyle === 'italic') styleStr = 'BoldItalic';
  else if (fontWeight === 'bold') styleStr = 'Bold';
  else if (fontStyle === 'italic') styleStr = 'Italic';
  return `${family.replace(/\s+/g, '')}-${styleStr}.ttf`;
}

async function loadInstance(fileName) {
  if (instances.has(fileName)) return instances.get(fileName);
  const pending = (async () => {
    const res = await fetch(`/fonts/${fileName}`);
    if (!res.ok) throw new Error(`${fileName}: ${res.status}`);
    return fontkit.create(new Uint8Array(await res.arrayBuffer()));
  })();
  instances.set(fileName, pending);
  try {
    return await pending;
  } catch (error) {
    // An offline/network failure must not disable coverage checks for the
    // rest of the session. Retain pending/successful deduplication, and do
    // not let an older rejection evict a newer entry after a cache reset.
    if (instances.get(fileName) === pending) instances.delete(fileName);
    throw error;
  }
}

/**
 * The characters in `text` the font this element will actually be exported
 * with cannot draw, deduplicated and in first-seen order.
 *
 * Resolves the family exactly the way `serialize` does (`resolveFontFamily`,
 * then the Arimo fallback), so the warning can never disagree with what the
 * export later refuses on. Returns `[]` on any loading failure: a font that
 * will not load is a different problem, already surfaced elsewhere, and this
 * check must never invent a warning out of its own failure.
 */
export async function unsupportedCharacters(text, { fontFamily, fontWeight, fontStyle } = {}) {
  const value = (text || '').trim();
  if (!value) return [];
  const family = resolveFontFamily(fontFamily, value);
  try {
    let font;
    try {
      font = await loadInstance(fileNameFor(family, fontWeight, fontStyle));
    } catch {
      font = await loadInstance(fileNameFor(family, undefined, undefined));
    }
    // unrepresentableCharacters takes a pdf-lib font and reaches its fontkit
    // instance through `.embedder.font`; hand it the shape it expects so the
    // editor and the export run literally the same code.
    return unrepresentableCharacters({ embedder: { font } }, value);
  } catch {
    return [];
  }
}

/**
 * The characters across a whole document that no bundled font can draw, for
 * the editor to warn about while the user is still typing.
 *
 * Runs the same policy `signPdf` refuses on - `findUnrepresentableCharacters`
 * in textCoverage.js - differing only in how a font is loaded: fetched and
 * parsed here, embedded by pdf-lib there. That shared call is what guarantees
 * the warning and the refusal never disagree.
 *
 * Because the policy resolves each element through `resolveFontFamily` first,
 * anything a script substitution already rescued (Hindi, Thai, Hebrew,
 * Ukrainian) never reaches this list. What is left is the genuinely
 * undrawable: Arabic, CJK, emoji.
 *
 * Returns `[]` on any loading failure, same as `unsupportedCharacters` above:
 * a font that will not load is a different problem, and this must never invent
 * a warning out of its own failure.
 */
export async function unsupportedCharactersInDocument(elements) {
  try {
    return await findUnrepresentableCharacters(elements, async (family, fontWeight, fontStyle) => {
      try {
        const font = await loadInstance(fileNameFor(family, fontWeight, fontStyle));
        return { embedder: { font } };
      } catch {
        try {
          const font = await loadInstance(fileNameFor(family, undefined, undefined));
          return { embedder: { font } };
        } catch {
          return null;
        }
      }
    });
  } catch {
    return { characters: [], pageNumbers: [] };
  }
}

/** Test seam: drop the cached instances between cases. */
export function resetLiveFontCoverageCache() {
  instances.clear();
}
