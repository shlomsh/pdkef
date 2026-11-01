import { describe, expect, it } from 'vitest';
import { initialSetting, parseSetting, serializeSetting } from './setting.ts';

describe('zoom setting', () => {
  it('round-trips fit modes and numbers', () => {
    for (const s of ['width', 'text', 'page', 1.5] as const) expect(parseSetting(serializeSetting(s))).toBe(s);
  });
  it('rejects anything else', () => {
    for (const bad of [undefined, null, '', 'wide', 'NaN', '9', '0.1', 4]) expect(parseSetting(bad)).toBeNull();
  });
  it('restores the draft first, then the remembered default, then width', () => {
    expect(initialSetting('page', 'text')).toBe('page');
    expect(initialSetting(undefined, '1.25')).toBe(1.25);
    expect(initialSetting('junk', null)).toBe('width');
  });
});
