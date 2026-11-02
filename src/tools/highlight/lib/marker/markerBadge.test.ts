import { describe, expect, it } from 'vitest';
import { underlineInk } from '#editor/model/underlineInk.ts';
import { markerBadge } from './markerBadge.ts';

describe('markerBadge', () => {
  it('a highlight marker shows a dot in its color', () => {
    expect(markerBadge({ color: '#FF8FCF', style: 'highlight', opacity: 1 })).toEqual({ kind: 'dot', color: '#FF8FCF', opacity: 1 });
  });

  it('a faint highlight still shows a dot that can be seen', () => {
    expect(markerBadge({ color: '#FF8FCF', style: 'highlight', opacity: 0.3 })).toEqual({ kind: 'dot', color: '#FF8FCF', opacity: 0.35 });
  });

  it('a pencil marker shows the hatch glyph in its color', () => {
    expect(markerBadge({ color: '#FFF34D', style: 'pencil', opacity: 0.5 })).toEqual({ kind: 'pencil', color: '#FFF34D', opacity: 0.5 });
  });

  it('an underline marker shows the underline glyph in the darkened ink', () => {
    expect(markerBadge({ color: '#FFF34D', style: 'underline', opacity: 0.5 })).toEqual({ kind: 'underline', ink: underlineInk('#FFF34D') });
  });
});
