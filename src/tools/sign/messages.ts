/**
 * Sign's message catalogue. The type and the English and Hebrew values live in the editor
 * (src/editor/registry/messages.ts, signMessages.ts) because the editor chrome that Redact
 * shares reads them too and a core project may not import a tool; this module is Sign's
 * entry to them, in the same shape as every other tool's messages.ts.
 */
import type { DocumentationLocaleId } from '../../i18n/documentationLocales';
import type { SignMessages } from '#editor/registry/messages.ts';
import { englishSignMessages, hebrewSignMessages } from '#editor/registry/signMessages.ts';

export type { SignMessages };
export { englishSignMessages, hebrewSignMessages };

const signMessages: Partial<Record<DocumentationLocaleId, SignMessages>> = {
  en: englishSignMessages,
  he: hebrewSignMessages,
};

export function getSignMessages(locale: DocumentationLocaleId): SignMessages {
  return signMessages[locale] ?? englishSignMessages;
}
