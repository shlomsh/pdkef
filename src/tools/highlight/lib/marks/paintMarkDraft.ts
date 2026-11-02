import type { HighlightElement } from '#editor/model/editorModel.ts';
import { reportError } from '#lib/telemetry/errorReport.ts';
import type { Band } from '#lib/pageLayout/bands.ts';
import { bandRectsPts, sketchMark, underlineVars } from '#editor-ui/highlight/HighlightNode.tsx';
import styles from '#editor-ui/highlight/HighlightNode.module.css';
import { hatchInkAttrs, hatchPathD } from '#editor/geometry/hatchInk.ts';
import { hatchIfLoaded, loadHatch } from '../outline/hatchLoader.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The latest paint per node, so a hatch that arrives late never repaints a mark the swipe has since changed or cleared. */
const latest = new WeakMap<HTMLElement, number>();
let paints = 0;

/**
 * The live swipe's draw of a mark: the same look HighlightNode gives the committed one (sketched path, underline
 * or clean bands), painted into the node's draft layer so the release changes nothing. Empty bands clear it.
 */
export function paintMarkDraft(
  node: HTMLElement, element: HighlightElement, bands: Band[], boxPts: { width: number; height: number } | undefined, turns: number,
): void {
  const draft = node.querySelector<HTMLElement>('[data-highlight-draft]');
  if (!draft) return;
  const doc = node.ownerDocument;
  const paint = ++paints;
  latest.set(node, paint);
  if (bands.length === 0) { draft.replaceChildren(); return; }
  if (element.style === 'pencil' && boxPts) {
    const hatch = hatchIfLoaded();
    if (!hatch) {
      // rough.js is fetched on the first Pencil swipe: paint once it is here, if this is still the latest paint.
      loadHatch().then(() => { if (latest.get(node) === paint) paintMarkDraft(node, element, bands, boxPts, turns); })
        .catch((err) => reportError('pdf_render', err, 'draw_mark_hatch'));
      return;
    }
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('data-highlight-hatch', '');
    svg.setAttribute('viewBox', `0 0 ${boxPts.width} ${boxPts.height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', styles.sketch);
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', hatchPathD(hatch.hatchOps, bandRectsPts(bands, boxPts), element.id));
    for (const [name, value] of Object.entries(hatchInkAttrs(element.color))) path.setAttribute(name, value);
    svg.appendChild(path);
    draft.replaceChildren(svg);
    return;
  }
  if (element.stroke === 'sketch' && boxPts) {
    const { d, fill } = sketchMark(element, bandRectsPts(bands, boxPts), turns);
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('data-highlight-sketch', '');
    svg.setAttribute('viewBox', `0 0 ${boxPts.width} ${boxPts.height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', styles.sketch);
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', fill);
    svg.appendChild(path);
    draft.replaceChildren(svg);
    return;
  }
  const underline = element.style === 'underline';
  draft.replaceChildren(...bands.map((band) => {
    const div = doc.createElement('div');
    div.className = underline ? `${styles.band} ${styles.underline}` : styles.band;
    if (underline) div.setAttribute('data-highlight-underline', '');
    div.style.left = `${band.left}%`;
    div.style.top = `${band.top}%`;
    div.style.width = `${band.width}%`;
    div.style.height = `${band.height}%`;
    if (underline) for (const [name, value] of Object.entries(underlineVars(element))) div.style.setProperty(name, value);
    else div.style.background = element.color;
    return div;
  }));
}
