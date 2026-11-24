import { expect, it } from 'vitest';
import { canUseCamera } from './canUseCamera.ts';

it('does not offer the live camera where the pointer is a mouse', () => {
  expect(window.isSecureContext).toBe(true);
  expect(navigator.mediaDevices.getUserMedia).toBeTypeOf('function');
  expect(window).toHaveProperty('ImageCapture');
  expect(canUseCamera()).toBe(false);
});
