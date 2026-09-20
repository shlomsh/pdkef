/**
 * The one sanitised line a person may relay about a form-field detection
 * failure (FORM-11).
 *
 * Why this exists: detection runs on open and fails silently by design, and
 * the failures that matter most are the ones we cannot reproduce. The report
 * that forced this was an iPhone seeing no field outlines and no snapping on
 * a document that detects and snaps correctly in a desktop browser at the same
 * width. The five detector modules use no modern JS APIs; every risky one in
 * the bundle (`getOrInsertComputed`, `Promise.withResolvers`, `structuredClone`,
 * `Object.hasOwn`, `findLast`) is inside the pdf.js chunk, and
 * `useFormFieldRegions.ts` calls `pdfDocument.getPage()` and reads page text
 * inside its `try`. So an older WebKit throwing on one of those looks exactly
 * like a PDF with no fields in it, and nothing anywhere said otherwise.
 *
 * What may travel, and the reasoning, because this is the product's one
 * absolute rule: **no file bytes and no document content ever leave the
 * device.** An exception's *message* is not automatically safe - a PDF library
 * builds messages out of the objects it choked on, so one can quote a field
 * name, a string from the page, or a filename. An exception's *name* always
 * is: it is an identifier out of the program text.
 *
 * Hence the boundary drawn here: the name is always kept; the message is kept
 * **only for the six errors the JavaScript engine itself throws**, whose
 * messages describe code (a missing method, a bad argument) and are generated
 * from the program, never from the data it was handed. Everything a PDF
 * library constructed is reported by its name alone. That keeps precisely the
 * case this was built for - `TypeError: undefined is not an object (evaluating
 * 'x.getOrInsertComputed')` - and gives up the messages that could carry
 * somebody's form.
 *
 * Nothing here is sent anywhere on its own. It is shown to the person (in the
 * prefilled Feedback report they choose to open) and written to their own
 * console. The maintenance telemetry never sees it: that boundary
 * (`maintenanceTelemetry.ts`) emits a code off a closed list and cannot
 * express free text at all.
 */

/**
 * The errors a JS engine raises about code. `Error` itself is deliberately not
 * here: it is what a library subclass reports when it never set a `name`, so
 * treating it as engine-thrown would open the message path to exactly the
 * errors this is guarding against.
 */
const ENGINE_ERROR_NAMES = new Set([
  'TypeError',
  'ReferenceError',
  'RangeError',
  'SyntaxError',
  'EvalError',
  'URIError',
]);

/** A plain identifier, which is all an error name may ever be here. */
const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/** Long enough for the engine messages above, short enough that nothing else fits. */
const MAX_MESSAGE = 200;

/**
 * A second net under the engine-errors-only rule, for the shapes content
 * arrives in when it does reach a message: a path (`/home/me/private.pdf`), a
 * PDF name object (`/Full_Name`), a quoted blob. Whole tokens go, because half
 * a filename is still a filename. Engine messages about code survive it - the
 * one that matters here, `undefined is not an object (evaluating
 * 'page.getOrInsertComputed')`, has no slash in it.
 */
const CONTENT_SHAPED = /[\\/"<>]/;

/**
 * A quoted run in an engine message is usually the identifier the engine
 * choked on, which is the whole diagnostic value here. But an identifier is
 * only safe when it came from the program: `obj[valueReadFromThePdf]` puts a
 * field label or a line of somebody's form in exactly the same position, and
 * `Cannot read properties of undefined (reading 'Student Social Security
 * Number')` is a real shape. So a quoted run survives only if it looks like
 * code - a dotted identifier chain, nothing else - and is replaced wholesale
 * otherwise. Measured against the case this exists for: `page.getOrInsertComputed`
 * passes, `Patient diagnosis: diabetes` does not.
 */
const QUOTED = /(['"`])([\s\S]*?)\1/g;
const CODE_SHAPED = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;

/**
 * A filename keeps leaking through as a bare token once its path is gone
 * (`/home/me/tax return 2024.pdf` loses the path token and leaves `2024.pdf`).
 * Matched against real extensions rather than "a short dotted tail", because
 * the latter also eats `Object.x`, which is code and is worth keeping.
 */
const FILE_SHAPED = /^[\w.-]+\.(?:pdf|png|jpe?g|gif|webp|docx?|xlsx?|pptx?|txt|csv|json|xml|zip)$/i;

/**
 * `error.name`, or the constructor's name when the error never set one -
 * `pdf-lib` subclasses `Error` without assigning `name`, so they all arrive as
 * "Error" and the constructor is the only thing that says which one it was.
 * Both are identifiers from the program text (a minified build shortens them,
 * which costs detail and leaks nothing). Anything that is not a plain
 * identifier is discarded rather than trimmed.
 */
function errorName(error: Error): string {
  const declared = typeof error.name === 'string' && error.name !== 'Error' ? error.name : '';
  const constructed = typeof error.constructor?.name === 'string' ? error.constructor.name : '';
  const candidate = declared || constructed;
  return SAFE_NAME.test(candidate) ? candidate : 'Error';
}

/**
 * One line, safe to show and safe to paste into a public issue: either
 * `Name: message` for an engine error, or the bare `Name` for everything else.
 * Never a stack, never the error object.
 */
export function describeFormDetectionFailure(error: unknown): string {
  if (!(error instanceof Error)) return 'Error';
  const name = errorName(error);
  if (!ENGINE_ERROR_NAMES.has(name)) return name;
  const message = String(error.message ?? '')
    // One line, printable ASCII only: a newline would smuggle a stack into a
    // single-line field, and anything outside this range is not something an
    // engine message is made of.
    .replace(/\s+/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x20-\x7E]/g, '')
    // Quoted runs first, whole: a label with spaces in it would otherwise
    // survive as several innocent-looking tokens.
    .replace(QUOTED, (run, quote, inner) => (CODE_SHAPED.test(inner) ? run : `${quote}...${quote}`))
    .split(' ')
    .map((token) => (CONTENT_SHAPED.test(token) || FILE_SHAPED.test(token) ? '...' : token))
    .join(' ')
    .trim()
    .slice(0, MAX_MESSAGE);
  return message ? `${name}: ${message}` : name;
}
