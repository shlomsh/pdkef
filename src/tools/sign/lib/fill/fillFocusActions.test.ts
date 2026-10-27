import { describe, expect, it, vi } from 'vitest';
import { focusActions } from './fillFocusActions.ts';
import { textFillKey } from './fillTypes.ts';

const EL1 = textFillKey('1');
const EL2 = textFillKey('2');
const SLOT = 'slot:0:field-a';
const FREE = 'free:0:12.50:40.00';

describe('focusActions', () => {
  it('does nothing when the key does not change', () => {
    const textOf = vi.fn();
    expect(focusActions({ from: EL1, to: EL1 }, textOf)).toEqual([]);
    expect(focusActions({ from: SLOT, to: SLOT }, textOf)).toEqual([]);
    expect(focusActions({ from: null, to: null }, textOf)).toEqual([]);
    expect(textOf).not.toHaveBeenCalled();
  });

  it('entering a text key from nothing sets active then editing', () => {
    const textOf = vi.fn();
    expect(focusActions({ from: null, to: EL1 }, textOf)).toEqual([
      { type: 'SET_ACTIVE_ELEMENT_ID', payload: '1' },
      { type: 'SET_EDITING_ELEMENT_ID', payload: '1' },
    ]);
    expect(textOf).not.toHaveBeenCalled();
  });

  it('entering a text key from a slot sets active then editing, same as from nothing', () => {
    const textOf = vi.fn();
    expect(focusActions({ from: SLOT, to: EL1 }, textOf)).toEqual([
      { type: 'SET_ACTIVE_ELEMENT_ID', payload: '1' },
      { type: 'SET_EDITING_ELEMENT_ID', payload: '1' },
    ]);
  });

  it('leaving a text key with text in it for a slot ends editing then selection, and does not delete', () => {
    const textOf = vi.fn().mockReturnValue('Shlomi');
    expect(focusActions({ from: EL1, to: SLOT }, textOf)).toEqual([
      { type: 'SET_EDITING_ELEMENT_ID', payload: null },
      { type: 'SET_ACTIVE_ELEMENT_ID', payload: null },
    ]);
    expect(textOf).toHaveBeenCalledWith('1');
  });

  it('leaving a text key for null behaves the same as leaving it for a slot', () => {
    const textOf = vi.fn().mockReturnValue('Shlomi');
    expect(focusActions({ from: EL1, to: null }, textOf)).toEqual([
      { type: 'SET_EDITING_ELEMENT_ID', payload: null },
      { type: 'SET_ACTIVE_ELEMENT_ID', payload: null },
    ]);
  });

  it('deletes a text element left with no text at all', () => {
    const textOf = vi.fn().mockReturnValue(undefined);
    expect(focusActions({ from: EL1, to: SLOT }, textOf)).toEqual([
      { type: 'SET_EDITING_ELEMENT_ID', payload: null },
      { type: 'SET_ACTIVE_ELEMENT_ID', payload: null },
      { type: 'DELETE_ELEMENT', payload: '1' },
    ]);
  });

  it('deletes a text element left with only whitespace', () => {
    const textOf = vi.fn().mockReturnValue('   \n\t ');
    expect(focusActions({ from: EL1, to: null }, textOf)).toEqual([
      { type: 'SET_EDITING_ELEMENT_ID', payload: null },
      { type: 'SET_ACTIVE_ELEMENT_ID', payload: null },
      { type: 'DELETE_ELEMENT', payload: '1' },
    ]);
  });

  it('keeps an element left with an empty string the same way as undefined', () => {
    const textOf = vi.fn().mockReturnValue('');
    expect(focusActions({ from: EL1, to: FREE }, textOf)).toEqual([
      { type: 'SET_EDITING_ELEMENT_ID', payload: null },
      { type: 'SET_ACTIVE_ELEMENT_ID', payload: null },
      { type: 'DELETE_ELEMENT', payload: '1' },
    ]);
  });

  it('text to text applies the leaving element\'s empty check, then the new one\'s active and editing', () => {
    const textOf = vi.fn().mockReturnValue('Shlomi');
    expect(focusActions({ from: EL1, to: EL2 }, textOf)).toEqual([
      { type: 'SET_EDITING_ELEMENT_ID', payload: null },
      { type: 'SET_ACTIVE_ELEMENT_ID', payload: null },
      { type: 'SET_ACTIVE_ELEMENT_ID', payload: '2' },
      { type: 'SET_EDITING_ELEMENT_ID', payload: '2' },
    ]);
    expect(textOf).toHaveBeenCalledWith('1');
    expect(textOf).not.toHaveBeenCalledWith('2');
  });

  it('text to text deletes the leaving element first when it was left empty', () => {
    const textOf = vi.fn().mockReturnValue(undefined);
    expect(focusActions({ from: EL1, to: EL2 }, textOf)).toEqual([
      { type: 'SET_EDITING_ELEMENT_ID', payload: null },
      { type: 'SET_ACTIVE_ELEMENT_ID', payload: null },
      { type: 'DELETE_ELEMENT', payload: '1' },
      { type: 'SET_ACTIVE_ELEMENT_ID', payload: '2' },
      { type: 'SET_EDITING_ELEMENT_ID', payload: '2' },
    ]);
  });

  it('a slot to another slot produces no actions: slots never enter the model', () => {
    const textOf = vi.fn();
    expect(focusActions({ from: SLOT, to: FREE }, textOf)).toEqual([]);
    expect(textOf).not.toHaveBeenCalled();
  });

  it('a slot to nothing produces no actions', () => {
    const textOf = vi.fn();
    expect(focusActions({ from: SLOT, to: null }, textOf)).toEqual([]);
    expect(textOf).not.toHaveBeenCalled();
  });

  it('nothing to a slot produces no actions', () => {
    const textOf = vi.fn();
    expect(focusActions({ from: null, to: SLOT }, textOf)).toEqual([]);
    expect(textOf).not.toHaveBeenCalled();
  });
});
