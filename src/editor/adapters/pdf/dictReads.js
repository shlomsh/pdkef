// @ts-check
import { PDFName, PDFDict } from '@cantoo/pdf-lib';

/** The dictionary a reference or value resolves to, undefined when it is not one.
 * @param {import('@cantoo/pdf-lib').PDFContext} context
 * @param {import('@cantoo/pdf-lib').PDFObject | undefined} value
 * @returns {import('@cantoo/pdf-lib').PDFDict | undefined}
 */
export function lookupDict(context, value) {
  const resolved = context.lookup(value);
  return resolved instanceof PDFDict ? resolved : undefined;
}

/** The number an object is, undefined when it is not a number.
 * @param {import('@cantoo/pdf-lib').PDFObject | undefined} object
 * @returns {number | undefined}
 */
export function numberOf(object) {
  return /** @type {{ asNumber?: () => number } | undefined} */ (object)?.asNumber?.();
}

/** The `asString()` text an object has (a name's, with its slash), undefined when it has none.
 * @param {import('@cantoo/pdf-lib').PDFObject | undefined} object
 * @returns {string | undefined}
 */
export function nameOf(object) {
  return /** @type {{ asString?: () => string } | undefined} */ (object)?.asString?.();
}

/** The finite number a dictionary entry resolves to, undefined otherwise.
 * @param {import('@cantoo/pdf-lib').PDFContext} context
 * @param {import('@cantoo/pdf-lib').PDFDict | undefined} dict
 * @param {string} key
 * @returns {number | undefined}
 */
export function numberAt(context, dict, key) {
  const n = numberOf(context.lookup(dict?.get(PDFName.of(key))));
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}
