import { expect, it } from 'vitest';
import { canUseCamera } from './canUseCamera.ts';

it('offers the live camera on a touch screen', () => {
  expect(canUseCamera()).toBe(true);
});
