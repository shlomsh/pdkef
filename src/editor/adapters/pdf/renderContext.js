/**
 * The one way to get a 2D context for pdf.js to paint a page into.
 *
 * pdf.js draws every glyph with its own `fillText` at the glyph's pen position
 * and never sets `direction` or `textAlign` on the context, so it is relying
 * on the canvas defaults: `direction: inherit`, `textAlign: start`. A canvas
 * inherits `direction` from CSS, and a detached canvas inherits the document
 * root's, so on a `<html dir="rtl">` page (every `/he/` tool edition) "start"
 * resolves to right-aligned and each glyph is painted shifted left by its own
 * advance. Wide glyphs move a lot, narrow ones barely, and words tear apart:
 * "כרטיס עובד" rendered as "כרט ס ע בד" on /he/sign/ while /sign/ was fine.
 * Latin digits shift too, so this is not a Hebrew problem, it is a page-
 * direction problem.
 *
 * Forcing `ltr` here is correct for every PDF: glyph positions in a content
 * stream are already absolute, whatever script the text is in.
 *
 * `renderContext.test.js` fails if any pdf.js render call site reaches
 * `getContext('2d')` some other way.
 */
export function getPdfRenderContext(canvas, options) {
  const context = canvas.getContext('2d', options);
  if (context) context.direction = 'ltr';
  return context;
}
