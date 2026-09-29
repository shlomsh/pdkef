import { describe, expect, it } from 'vitest';
import { createPageGeometry } from '../../../editor/geometry/coords.ts';
import type { PageGlyph } from '../../../editor/adapters/pdf/pageGlyphs.ts';
import { checkBoxesFromElements } from './checkBoxes.ts';
import { coveredTerms } from './coveredTerms.ts';

describe('checkBoxesFromElements', () => {
  const geometry = { pageIndex: 1, left: 10, top: 20, width: 30, height: 5 };

  it('keeps boxes as they are and skips deletions', () => {
    const boxes = checkBoxesFromElements([
      { type: 'blackout', color: '#000000', ...geometry },
      { type: 'delete', ...geometry },
    ]);
    expect(boxes).toEqual([{ ...geometry, type: 'blackout', color: '#000000' }]);
  });

  it('counts a stroke as covering its bbox and never as a solid to verify', () => {
    const boxes = checkBoxesFromElements([
      { type: 'whiteoutStroke', color: '#dddddd', ...geometry },
      { type: 'blurStroke', ...geometry },
    ]);
    expect(boxes).toEqual([
      { ...geometry, type: 'blur', color: undefined },
      { ...geometry, type: 'blur', color: undefined },
    ]);
  });

  it('a whiteout stroke over a term counts as covering it', () => {
    const pageGeometry = createPageGeometry({ cropBox: { x: 0, y: 0, width: 600, height: 800 } });
    let pen = 0;
    const glyphs: PageGlyph[] = [];
    for (const ch of 'secret info here') {
      glyphs.push({ unicode: ch, isSpace: ch === ' ', matrix: [10, 0, 0, 10, pen, 400], width: 0.5 });
      pen += 5;
    }
    const stroke = {
      type: 'whiteoutStroke', pageIndex: 0, color: '#ffffff',
      left: 0, top: ((pageGeometry.height - 415) / pageGeometry.height) * 100,
      width: (100 / pageGeometry.width) * 100, height: (25 / pageGeometry.height) * 100,
    };
    const boxes = checkBoxesFromElements([stroke]);
    expect(boxes).toHaveLength(1);
    const terms = coveredTerms([{ glyphs, geometry: pageGeometry, boxes }]);
    expect(terms).toHaveLength(1);
    expect(terms[0]).toMatchObject({ label: 'secret info here', source: 'covered' });
    // Without the stroke nothing covers the line.
    expect(coveredTerms([{ glyphs, geometry: pageGeometry, boxes: checkBoxesFromElements([]) }])).toHaveLength(0);
  });
});
