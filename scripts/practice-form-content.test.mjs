import { describe, expect, it } from 'vitest';
import {
  PALETTE_TOKENS, FIELDS, PAGE_SIZE, fieldLayout, lineWritableRect,
} from './practice-form-content.mjs';

const CSS_CUSTOM_PROPERTY = /^--[a-z][a-z0-9-]*$/;

describe('practice-form-content', () => {
  it('has unique, non-empty field ids', () => {
    expect(FIELDS.length).toBeGreaterThan(0);
    const ids = FIELDS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => {
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });
  });

  it('gives every field a non-empty label', () => {
    FIELDS.forEach((field) => {
      expect(typeof field.label).toBe('string');
      expect(field.label.length).toBeGreaterThan(0);
    });
  });

  it('gives every field exactly one of rect or line', () => {
    FIELDS.forEach((field) => {
      expect(Boolean(field.rect)).not.toBe(Boolean(field.line));
    });
  });

  it('gives every comb field a cell count', () => {
    FIELDS.filter((f) => f.kind === 'comb').forEach((field) => {
      expect(Number.isInteger(field.cells)).toBe(true);
      expect(field.cells).toBeGreaterThan(0);
    });
  });

  it('names a global.css custom property for every palette role, no colour literals', () => {
    const entries = Object.values(PALETTE_TOKENS);
    expect(entries.length).toBeGreaterThan(0);
    entries.forEach((tokenName) => {
      expect(typeof tokenName).toBe('string');
      expect(tokenName).toMatch(CSS_CUSTOM_PROPERTY);
    });
  });

  it('has a positive page width and height', () => {
    expect(PAGE_SIZE).toHaveLength(2);
    const [width, height] = PAGE_SIZE;
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  });

  it('derives a line field\'s rect as the strip above its line', () => {
    const rect = lineWritableRect({ x0: 48, x1: 300, y: 640 });
    expect(rect).toEqual({ x: 48, y: 618, width: 252, height: 22 });
  });

  it('normalizes every field to {id, kind, label, rect} with a positive-area rect', () => {
    const layout = fieldLayout();
    expect(layout.length).toBe(FIELDS.length);
    layout.forEach((field) => {
      expect(typeof field.id).toBe('string');
      expect(typeof field.kind).toBe('string');
      expect(typeof field.label).toBe('string');
      expect(field.rect.width).toBeGreaterThan(0);
      expect(field.rect.height).toBeGreaterThan(0);
    });
  });
});
