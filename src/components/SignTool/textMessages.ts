/**
 * English-default copy for text-policy facts, LOC-16 stage 2-5: every
 * function below now takes an optional trailing `t` (a merged
 * `SignMessages`, same shape every other Sign component takes as `messages`)
 * and defaults to `englishSignMessages` when omitted, so every existing
 * caller (including the tests that call these positionally with no locale)
 * keeps producing byte-identical English output. TextNode.tsx and
 * PdfSignTool.tsx pass their own resolved `t` through so a Hebrew page gets
 * Hebrew text-policy sentences too.
 */
import { englishSignMessages, formatMessage, type SignMessages } from '../../i18n/toolMessages';

/** Bounded, direction-isolated text excerpts for UI sentences - script-agnostic, so this needs no locale parameter. */
export function quoteText(text: string) {
  const chars = [...text.trim()];
  return `“⁨${chars.slice(0, 36).join('')}${chars.length > 36 ? '…' : ''}⁩”`;
}

export function describeFontSubstitution(
  { requested, family, missing }: { requested: string; family: string; missing: string[] },
  t: SignMessages = englishSignMessages,
) {
  if (family === requested) return '';
  return formatMessage(t.fontSubstitutionTemplate, { requested, family, missing: missing.join(', ') });
}

function wherePagesClause(pageNumbers: number[], t: SignMessages) {
  if (pageNumbers.length === 0) return '';
  if (pageNumbers.length === 1) return formatMessage(t.wherePageOneTemplate, { number: pageNumbers[0] });
  const list = `${pageNumbers.slice(0, -1).join(', ')}${t.pageListAndWord}${pageNumbers[pageNumbers.length - 1]}`;
  return formatMessage(t.wherePagesManyTemplate, { list });
}

export function describeUnrepresentableText(
  characters: string[],
  pageNumbers: number[] = [],
  { saving = false }: { saving?: boolean } = {},
  t: SignMessages = englishSignMessages,
) {
  const where = wherePagesClause(pageNumbers, t);
  const list = characters.join(', ');
  return saving
    ? formatMessage(t.unrepresentableSavingTemplate, { where, list })
    : formatMessage(t.unrepresentableTypingTemplate, { where, list });
}

export interface TextFontSupportMessageInput {
  status: 'supported' | 'fallback' | 'incompatible';
  family: string;
  requested: string;
  missing: string[];
  pieces: Array<{ text: string; family: string | null }>;
}

export function describeTextFontSupport(support: TextFontSupportMessageInput, t: SignMessages = englishSignMessages) {
  if (support.status === 'supported') return '';
  if (support.status === 'fallback') {
    return t.fallbackFontNotice;
  }
  const unavailable = support.pieces.filter((piece) => !piece.family);
  if (unavailable.length) {
    return formatMessage(t.noFontForCharactersTemplate, { text: quoteText(unavailable.map((piece) => piece.text).join('')) });
  }
  const examples = support.pieces.slice(0, 3)
    .map((piece) => formatMessage(t.pieceInFontTemplate, { text: quoteText(piece.text), family: piece.family ?? '' })).join('; ');
  return formatMessage(t.noSingleFontTemplate, {
    examples,
    more: support.pieces.length > 3 ? t.noSingleFontMoreClause : '',
  });
}
