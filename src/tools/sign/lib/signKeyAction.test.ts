import { describe, expect, it } from 'vitest';
import { classifySignKey, type SignKeyContext } from './signKeyAction.ts';

const base: SignKeyContext = {
  key: 'x',
  shiftKey: false,
  activeTag: 'BODY',
  editingElementId: null,
  activeElementId: null,
  fillEnabled: false,
  hasNext: true,
  hasPrevious: true,
  selectedIsText: true,
};
const kind = (patch: Partial<SignKeyContext>) => classifySignKey({ ...base, ...patch }).kind;

describe('classifySignKey', () => {
  it('unwinds Escape one level at a time', () => {
    expect(kind({ key: 'Escape', editingElementId: 'a', activeElementId: 'a' })).toBe('finish-editing');
    expect(kind({ key: 'Escape', activeElementId: 'a' })).toBe('clear-selection');
    expect(kind({ key: 'Escape' })).toBe('clear-selection');
  });

  it('moves field to field on Tab only with a selection, outside fill mode, with somewhere to go', () => {
    expect(kind({ key: 'Tab', activeElementId: 'a' })).toBe('field-next');
    expect(kind({ key: 'Tab', shiftKey: true, activeElementId: 'a' })).toBe('field-previous');
    expect(kind({ key: 'Tab' })).toBe('none');
    expect(kind({ key: 'Tab', activeElementId: 'a', fillEnabled: true })).toBe('none');
    expect(kind({ key: 'Tab', activeElementId: 'a', hasNext: false })).toBe('none');
    expect(kind({ key: 'Tab', shiftKey: true, activeElementId: 'a', hasPrevious: false })).toBe('none');
  });

  it('opens a selected text box on Enter, and nothing else', () => {
    expect(kind({ key: 'Enter', activeElementId: 'a' })).toBe('edit-selected');
    expect(kind({ key: 'Enter', activeElementId: 'a', selectedIsText: false })).toBe('none');
    expect(kind({ key: 'Enter', activeElementId: 'a', editingElementId: 'a' })).toBe('none');
    expect(kind({ key: 'Enter', activeElementId: 'a', activeTag: 'TEXTAREA' })).toBe('none');
    expect(kind({ key: 'Enter' })).toBe('none');
  });

  it('deletes the selection on Backspace or Delete unless a field has focus', () => {
    expect(kind({ key: 'Backspace', activeElementId: 'a' })).toBe('delete-active');
    expect(kind({ key: 'Delete', activeElementId: 'a' })).toBe('delete-active');
    expect(kind({ key: 'Backspace', activeElementId: 'a', activeTag: 'INPUT' })).toBe('none');
    expect(kind({ key: 'Backspace' })).toBe('none');
  });
});
