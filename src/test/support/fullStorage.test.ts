// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { fillStorage } from './fullStorage.ts';

afterEach(() => localStorage.clear());

it('leaves no room for another key, and clearing makes room again', () => {
  fillStorage(localStorage);
  expect(() => localStorage.setItem('k', '')).toThrow(expect.objectContaining({ name: 'QuotaExceededError' }));
  expect(localStorage.getItem('k')).toBeNull();
  localStorage.clear();
  localStorage.setItem('k', '1');
  expect(localStorage.getItem('k')).toBe('1');
});

it('keeps what was there', () => {
  localStorage.setItem('k', '1');
  fillStorage(localStorage);
  expect(localStorage.getItem('k')).toBe('1');
});
