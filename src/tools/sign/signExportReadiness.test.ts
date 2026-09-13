import { describe, expect, it } from 'vitest';
import { getSignExportReadiness } from './signExportReadiness.ts';

describe('getSignExportReadiness', () => {
  it('permits export when every text field can be embedded', () => {
    expect(getSignExportReadiness([
      { id: 'name', type: 'text', text: 'Shlomi', fontFamily: 'Arimo' },
      { id: 'mark', type: 'symbol' },
    ])).toEqual({ blocked: false, blockingFieldCount: 0, blockingElementIds: [] });
  });

  it('blocks export once per affected text field and retains its review target', () => {
    expect(getSignExportReadiness([
      { id: 'first', type: 'text', text: '😀', fontFamily: 'Arimo' },
      { id: 'second', type: 'text', text: '🎉', fontFamily: 'Arimo' },
    ])).toEqual({ blocked: true, blockingFieldCount: 2, blockingElementIds: ['first', 'second'] });
  });
});
