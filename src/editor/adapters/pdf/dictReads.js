import { PDFName, PDFDict } from '@cantoo/pdf-lib';

/** The dictionary a reference or value resolves to, undefined when it is not one. */
export function lookupDict(context, value) {
  const resolved = context.lookup(value);
  return resolved instanceof PDFDict ? resolved : undefined;
}

/** The finite number a dictionary entry resolves to, undefined otherwise. */
export function numberAt(context, dict, key) {
  const value = context.lookup(dict?.get(PDFName.of(key)));
  const n = value?.asNumber?.();
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}
