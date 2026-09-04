/**
 * English copy for text-policy facts. Keeping this at the component boundary
 * means editor/text can stay locale-neutral and this module can become an
 * i18n catalog adapter without changing policy or export behavior.
 */

/** Bounded, direction-isolated text excerpts for English UI sentences. */
export function quoteText(text: string) {
  const chars = [...text.trim()];
  return `“\u2068${chars.slice(0, 36).join('')}${chars.length > 36 ? '…' : ''}\u2069”`;
}

export function describeFontSubstitution({ requested, family, missing }: { requested: string; family: string; missing: string[] }) {
  if (family === requested) return '';
  return `${requested} has no match for: ${missing.join(', ')}, so this text box is using ${family} instead. ${family} is what will be embedded in your download.`;
}

export function describeUnrepresentableText(characters: string[], pageNumbers: number[] = [], { saving = false }: { saving?: boolean } = {}) {
  const where = pageNumbers.length === 0 ? ''
    : pageNumbers.length === 1 ? ` on page ${pageNumbers[0]}`
      : ` on pages ${pageNumbers.slice(0, -1).join(', ')} and ${pageNumbers[pageNumbers.length - 1]}`;
  const list = characters.join(', ');
  return saving
    ? `Some text${where} needs attention: ${list}. Select its text box for font suggestions. You may need separate text boxes for different fonts, or to replace these characters, then save again.`
    : `Some characters${where} need a different font: ${list}. Select the marked text box for help choosing fonts or separating the text into boxes.`;
}

export interface TextFontSupportMessageInput {
  status: 'supported' | 'fallback' | 'incompatible';
  family: string;
  requested: string;
  missing: string[];
  pieces: Array<{ text: string; family: string | null }>;
}

export function describeTextFontSupport(support: TextFontSupportMessageInput) {
  if (support.status === 'supported') return '';
  if (support.status === 'fallback') {
    return `Using ${support.family} so all your text is included. ${support.requested} is missing ${quoteText(support.missing.join(''))}. You can choose another matching font in the font menu.`;
  }
  const unavailable = support.pieces.filter((piece) => !piece.family);
  if (unavailable.length) {
    return `No available font includes ${quoteText(unavailable.map((piece) => piece.text).join(''))}. Please replace or remove those characters; you can keep the rest of your text.`;
  }
  const examples = support.pieces.slice(0, 3)
    .map((piece) => `${quoteText(piece.text)} in ${piece.family}`).join('; ');
  return `No single available font includes all this text. Keep the text by placing the parts in separate text boxes: ${examples}${support.pieces.length > 3 ? '; continue with the remaining parts' : ''}.`;
}
