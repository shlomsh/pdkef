// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isTypingTarget } from './isTypingTarget.ts';

describe('isTypingTarget', () => {
  it('is true for input, textarea and select', () => {
    for (const tag of ['input', 'textarea', 'select']) expect(isTypingTarget(document.createElement(tag))).toBe(true);
  });
  it('is true for a contenteditable element', () => {
    const span = document.createElement('span');
    span.setAttribute('contenteditable', 'true');
    expect(isTypingTarget(span)).toBe(true);
  });
  it('is false for other elements, null and non-elements', () => {
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
    expect(isTypingTarget(document.body)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(window)).toBe(false);
  });
});
