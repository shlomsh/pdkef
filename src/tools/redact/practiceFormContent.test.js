import { describe, expect, it } from 'vitest';
import { PALETTE, FIELDS, CHECKBOXES, SIGNATURE_SECTION, FIELD_NAMES, PAGE_SIZE } from './practiceFormContent.js';

const HEX_COLOR_COMPONENT = (value) => typeof value === 'number' && value >= 0 && value <= 1;

describe('practiceFormContent', () => {
  it('has unique, non-empty field names', () => {
    expect(FIELD_NAMES.length).toBeGreaterThan(0);
    expect(new Set(FIELD_NAMES).size).toBe(FIELD_NAMES.length);
    FIELD_NAMES.forEach((name) => {
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    });
  });

  it('gives every text field and checkbox a non-empty label', () => {
    FIELDS.forEach((field) => {
      expect(typeof field.label).toBe('string');
      expect(field.label.length).toBeGreaterThan(0);
    });
    CHECKBOXES.forEach((checkbox) => {
      expect(typeof checkbox.text).toBe('string');
      expect(checkbox.text.length).toBeGreaterThan(0);
    });
    expect(SIGNATURE_SECTION.signature.label.length).toBeGreaterThan(0);
    expect(SIGNATURE_SECTION.date.label.length).toBeGreaterThan(0);
  });

  it('gives every palette entry a valid RGB triple in the 0-1 range', () => {
    const entries = Object.values(PALETTE);
    expect(entries.length).toBeGreaterThan(0);
    entries.forEach((color) => {
      expect(Array.isArray(color)).toBe(true);
      expect(color).toHaveLength(3);
      color.forEach((component) => expect(HEX_COLOR_COMPONENT(component)).toBe(true));
    });
  });

  it('has a positive page width and height', () => {
    expect(PAGE_SIZE).toHaveLength(2);
    const [width, height] = PAGE_SIZE;
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  });
});
