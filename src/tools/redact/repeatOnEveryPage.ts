/**
 * RED-03: "Repeat on every page" for a selected redaction box. Pure geometry
 * logic only: PdfRedactTool.tsx owns the id generator, the single undo
 * entry and the announcement; this module only decides which pages get a
 * copy and what each copy looks like.
 *
 * left/top/width/height are already percentages of the page, so copying them
 * verbatim onto another page's element is what makes the placement relative
 * (a differently-sized page still gets the box in the same spot).
 */

/** Any box element: geometry fields are read, never assumed to be typed. */
export interface RepeatableElement {
  id: string;
  pageIndex: number;
  type: string;
  [key: string]: unknown;
}

/** Same type and same percentage geometry: pressing the button twice must not stack duplicates. */
function sameBoxAs<TElement extends RepeatableElement>(source: TElement, other: TElement): boolean {
  return (
    other.type === source.type &&
    other.left === source.left &&
    other.top === source.top &&
    other.width === source.width &&
    other.height === source.height
  );
}

/**
 * Returns only the NEW elements to add: one copy of `source` per page other
 * than its own, skipping any page that already carries an equivalent box
 * (same type and geometry) so a repeated press is a no-op.
 */
export function repeatOnEveryPage<TElement extends RepeatableElement>(
  source: TElement,
  elements: readonly TElement[],
  numPages: number,
  makeId: () => string,
): TElement[] {
  const additions: TElement[] = [];
  for (let pageIndex = 0; pageIndex < numPages; pageIndex += 1) {
    if (pageIndex === source.pageIndex) continue;
    const alreadyPresent = elements.some(
      (element) => element.pageIndex === pageIndex && sameBoxAs(source, element),
    );
    if (alreadyPresent) continue;
    additions.push({ ...source, id: makeId(), pageIndex });
  }
  return additions;
}
