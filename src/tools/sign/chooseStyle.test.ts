import { describe, it, expect, vi } from 'vitest';
import type { TextElement } from '../../editor/model/editorModel.ts';
import { chooseStyle } from './chooseStyle.ts';

const textElement = (overrides: Partial<TextElement> = {}): TextElement => ({
  id: 'el-1',
  type: 'text',
  pageIndex: 0,
  left: 0,
  top: 0,
  text: '',
  ...overrides,
});

describe('chooseStyle (SIGN-35 dual write)', () => {
  it('a colour pick dispatches SET_CARRIED and SET_APP_STYLE, and remembers it', () => {
    const dispatch = vi.fn();
    const remember = vi.fn();
    chooseStyle(textElement(), { color: '#ff0000' }, dispatch, remember);

    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CARRIED', payload: { color: '#ff0000' } });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_APP_STYLE', payload: { color: '#ff0000' } });
    expect(remember).toHaveBeenCalledWith({ color: '#ff0000' });
  });

  it('a font picked from the menu (fontFamilyExplicit: true) goes to both', () => {
    const dispatch = vi.fn();
    const remember = vi.fn();
    chooseStyle(textElement(), { fontFamily: 'David', fontFamilyExplicit: true }, dispatch, remember);

    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CARRIED', payload: { font: 'David' } });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_APP_STYLE', payload: { font: 'David' } });
    expect(remember).toHaveBeenCalledWith({ font: 'David' });
  });

  it('a font switched by typing (no fontFamilyExplicit) goes to the document only', () => {
    const dispatch = vi.fn();
    const remember = vi.fn();
    chooseStyle(textElement(), { fontFamily: 'David' }, dispatch, remember);

    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CARRIED', payload: { font: 'David' } });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_APP_STYLE' }));
    expect(remember).not.toHaveBeenCalled();
  });

  it('a typed Hebrew direction goes to the document only', () => {
    const dispatch = vi.fn();
    const remember = vi.fn();
    chooseStyle(textElement(), { text: 'שלום' }, dispatch, remember);

    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CARRIED', payload: { direction: 'rtl' } });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_APP_STYLE' }));
    expect(remember).not.toHaveBeenCalled();
  });

  it('A+ (fontSize) goes to the document only', () => {
    const dispatch = vi.fn();
    const remember = vi.fn();
    chooseStyle(textElement(), { fontSize: 18 }, dispatch, remember);

    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CARRIED', payload: { fontSize: 18 } });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_APP_STYLE' }));
    expect(remember).not.toHaveBeenCalled();
  });

  it('a geometry-only patch dispatches nothing and remembers nothing', () => {
    const dispatch = vi.fn();
    const remember = vi.fn();
    chooseStyle(textElement(), { left: 12, top: 34 }, dispatch, remember);

    expect(dispatch).not.toHaveBeenCalled();
    expect(remember).not.toHaveBeenCalled();
  });
});
