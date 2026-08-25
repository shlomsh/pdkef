import { useEffect, useRef, useState } from 'preact/hooks';
import { unsupportedCharactersInDocument } from './liveFontCoverage.js';
import { describeUnrepresentableText } from './textCoverage.js';

/**
 * The "some of this will not survive the download" warning, computed while the
 * user is still typing instead of when they finally press Download.
 *
 * Why this exists: the editor paints text through `@font-face`, where the
 * browser quietly borrows a system font per character for glyphs the chosen
 * file lacks. So Arabic, Chinese and emoji all look perfect on screen while
 * being impossible to embed. `signPdf` refuses rather than ship a corrupted
 * file, but a refusal at save time is the last possible moment to find out -
 * the document is already finished. This is the same check, moved to the
 * earliest point that has the information.
 *
 * Scope is narrower than it looks, and deliberately so: the check runs through
 * `resolveFontFamily`, so every script the catalogue can rescue by
 * substitution (Hebrew, Devanagari, Thai, Cyrillic, Greek) has already been
 * handled silently by the time this runs and never produces a warning. Only
 * genuinely undrawable characters reach here.
 */
const DEBOUNCE_MS = 300;

export default function useFontCoverageNotice(elements) {
  const [message, setMessage] = useState('');
  // Guards against an out-of-order result: clearTimeout cancels a pending
  // check, but one already past its timer and awaiting a font fetch cannot be
  // cancelled, and must not be allowed to overwrite a newer answer.
  //
  // **Every path that ends a check must bump this, not just the ones that
  // start another.** Emptying the document returns early without scheduling
  // anything, so if that path left the counter alone, an in-flight check still
  // matched its own id when it resolved and repainted its warning onto a
  // document with no text left in it - where it then stuck, because nothing
  // recomputes until the signature changes again. Bumping in the cleanup
  // covers unmount for the same reason.
  const runId = useRef(0);

  // Keyed on content, not on the elements array, so the check re-runs when
  // text or font changes and stays quiet through dragging, resizing and
  // selection - none of which can alter which characters need a glyph.
  //
  // Joined on control characters, written as escapes rather than pasted in
  // literally so they survive an editor that trims invisible bytes. A
  // separator the user can also type (a space, a comma) would let two
  // different documents collide into one signature and silently skip a
  // re-check; \u0000 and \u0001 are stripped from anything drawn
  // (stripInvisibleFormatting), so they cannot occur in a compared value.
  //
  // `width` and `combCells` are in here because the coverage policy reads
  // them: a comb only draws the characters that fit its cells (isComb keys off
  // `width`, combCellCount off `combCells`), so both decide which characters
  // get judged. Leaving them out meant that changing the font size on a comb -
  // which clears `width` by design, un-combing it and sending every character
  // to the page - produced an identical signature, skipped the re-check, and
  // let the warning and signPdf's refusal disagree. **Anything
  // findUnrepresentableCharacters reads belongs in this key.**
  const signature = (elements || [])
    .filter((el) => el.type === 'text' && (el.text || '').trim())
    .map((el) => [el.id, el.pageIndex, el.fontFamily, el.fontWeight, el.fontStyle, el.width, el.combCells, el.text].join('\u0000'))
    .join('\u0001');

  useEffect(() => {
    const id = ++runId.current;
    if (!signature) {
      setMessage('');
      return undefined;
    }
    const timer = setTimeout(async () => {
      // `elements` is intentionally read from the render that produced this
      // signature: the signature already encodes every field the check reads,
      // so that snapshot is the one this result belongs to.
      const { characters, pageNumbers } = await unsupportedCharactersInDocument(elements);
      if (id !== runId.current) return;
      setMessage(characters.length > 0 ? describeUnrepresentableText(characters, pageNumbers) : '');
    }, DEBOUNCE_MS);
    // Bumping here too retires a check that already fired and is awaiting its
    // font fetch, which clearTimeout can no longer reach - including on
    // unmount, so nothing calls setMessage against a gone component.
    return () => { clearTimeout(timer); runId.current += 1; };
  }, [signature]);

  return message;
}
