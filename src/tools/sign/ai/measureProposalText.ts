import { resolveFontFamily } from '../../../editor/text/fonts.js';
import { DEFAULT_FONT_FAMILY } from '../../../constants/signGeometry.js';
import type { Proposal, TextWidthMeasure } from './proposals.ts';

// Measure the same whole DOM text run as TextNode, after its resolved face is
// ready. A reference size keeps the converter independent of browser layout.
export async function measureProposalText(fields: Proposal[]): Promise<TextWidthMeasure> {
  const widths = new Map<string, number>();
  for (const field of fields) {
    if (field.kind !== 'text' || !field.value?.trim()) continue;
    const family = resolveFontFamily(DEFAULT_FONT_FAMILY, field.value);
    const key = JSON.stringify([family, field.value]);
    if (widths.has(key)) continue;
    const loaded = await document.fonts.load(`100px '${family}'`, field.value);
    if (!loaded.length) throw new Error('The answer font is not ready. Try applying again or continue manually.');
    const measure = document.createElement('span');
    measure.dir = 'auto';
    Object.assign(measure.style, {position: 'absolute', visibility: 'hidden', whiteSpace: 'pre',
      font: `100px '${family}'`, padding: '0', unicodeBidi: 'plaintext'});
    measure.textContent = field.value;
    document.body.appendChild(measure);
    try { widths.set(key, measure.getBoundingClientRect().width / 100); }
    finally { measure.remove(); }
  }
  return (text, family, size) => (widths.get(JSON.stringify([family, text])) ?? NaN) * size;
}
