import { describe, expect, it } from 'vitest';
import { cameraStatusFor } from './cameraErrors.ts';

const named = (name: string) => Object.assign(new Error('x'), { name });

describe('cameraStatusFor', () => {
  it('says refused when the person or the page policy said no', () => {
    expect(cameraStatusFor(named('NotAllowedError'))).toBe('refused');
    expect(cameraStatusFor(named('SecurityError'))).toBe('refused');
  });
  it('says unavailable for everything else', () => {
    for (const e of [named('NotFoundError'), named('NotReadableError'), named('OverconstrainedError'), new TypeError('no mediaDevices'), null, 'x']) {
      expect(cameraStatusFor(e)).toBe('unavailable');
    }
  });
});
