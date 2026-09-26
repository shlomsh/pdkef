import { describe, expect, it } from 'vitest';
import { withFillModeParam } from './withFillModeParam.ts';

describe('withFillModeParam', () => {
  it('carries ?next=1 through to a bare href', () => {
    expect(withFillModeParam('/sign/', '?next=1')).toBe('/sign/?next=1');
  });

  it('appends next=1 to an href that already has a query string', () => {
    expect(withFillModeParam('/sign/?foo=bar', '?next=1')).toBe('/sign/?foo=bar&next=1');
  });

  it('leaves the href unchanged when fill mode is not on', () => {
    expect(withFillModeParam('/sign/', '')).toBe('/sign/');
    expect(withFillModeParam('/sign/', '?next=0')).toBe('/sign/');
    expect(withFillModeParam('/sign/', '?other=1')).toBe('/sign/');
  });
});
