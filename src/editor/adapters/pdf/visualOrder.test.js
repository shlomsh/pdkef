import { describe, expect, it } from 'vitest';
import { visualToLogical } from './visualOrder.js';

describe('visualToLogical', () => {
  it('reverses a single RTL word drawn in visual order', () => {
    expect(visualToLogical('ףגאה')).toBe('האגף');
  });

  it('reverses a whole RTL phrase from a real content stream', () => {
    expect(visualToLogical('היירי ילכ יושירל ףגאה')).toBe('האגף לרישוי כלי ירייה');
  });

  it('keeps a date inside an RTL phrase readable, only reordering the words', () => {
    expect(visualToLogical('2 ךותמ 1 ףד')).toBe('דף 1 מתוך 2');
  });

  it('keeps a Latin acronym inside an RTL-majority phrase readable', () => {
    expect(visualToLogical('PDF ךמסמ')).toBe('מסמך PDF');
  });

  it('keeps a full date intact inside an RTL phrase', () => {
    expect(visualToLogical('12/03/2021 הערכה ךיראת')).toBe('תאריך הכרעה 12/03/2021');
  });

  it('leaves pure Latin text unchanged', () => {
    expect(visualToLogical('PDF file 2.5')).toBe('PDF file 2.5');
  });

  it('reverses only the Hebrew word inside an otherwise LTR sentence', () => {
    expect(visualToLogical('Please sign ולש הריצי the form')).toBe('Please sign יצירה שלו the form');
  });

  it('mirrors paired brackets that land in RTL text', () => {
    expect(visualToLogical('(ילש) םש')).toBe('שם (שלי)');
  });

  it('reorders an Arabic phrase drawn in visual order', () => {
    expect(visualToLogical('ةيوه ةقاطب')).toBe('بطاقة هوية');
  });
});
