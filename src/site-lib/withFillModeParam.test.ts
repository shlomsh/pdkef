import { describe, expect, it } from 'vitest';
import { withFillModeParam } from './withFillModeParam.ts';

describe('withFillModeParam', () => {
  it('carries ?next=1 through to a bare href', () => {
    expect(withFillModeParam('/sign/', '?next=1')).toBe('/sign/?next=1');
  });

  it('carries ?next=0 through to a bare href', () => {
    expect(withFillModeParam('/sign/', '?next=0')).toBe('/sign/?next=0');
  });

  it('appends next to an href that already has a query string', () => {
    expect(withFillModeParam('/sign/?foo=bar', '?next=1')).toBe('/sign/?foo=bar&next=1');
    expect(withFillModeParam('/sign/?foo=bar', '?next=0')).toBe('/sign/?foo=bar&next=0');
  });

  it('leaves the href unchanged when there is no next param', () => {
    expect(withFillModeParam('/sign/', '')).toBe('/sign/');
    expect(withFillModeParam('/sign/', '?other=1')).toBe('/sign/');
  });
});
