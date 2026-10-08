import { describe, it, expect } from 'vitest';
import {
  expandDetailEdits, attachmentDetailId, TEXT_DETAIL_IDS, DATE_DETAIL_IDS,
} from './detailEdits.js';

const del = { action: 'delete' };

describe('detail ids', () => {
  it('names the text and date ids and builds attachment ids', () => {
    expect(TEXT_DETAIL_IDS).toEqual(['title', 'author', 'subject', 'keywords', 'made']);
    expect(DATE_DETAIL_IDS).toEqual(['created', 'changed']);
    expect(attachmentDetailId({ name: 'a.txt' })).toBe('attachment::a.txt');
    expect(attachmentDetailId({ name: 'c.txt', pageIndex: 1 })).toBe('attachment:1:c.txt');
    expect(attachmentDetailId({ name: 'z.txt', pageIndex: 0 })).toBe('attachment:0:z.txt');
  });
});

describe('expandDetailEdits', () => {
  it('adds hidden for a text or date edit, and only then', () => {
    for (const id of [...TEXT_DETAIL_IDS, 'changed']) {
      expect(expandDetailEdits({ [id]: del })).toEqual({ [id]: del, hidden: del });
    }
    expect(expandDetailEdits({})).toEqual({});
    expect(expandDetailEdits({ scripts: del })).toEqual({ scripts: del });
    expect(expandDetailEdits({ 'attachment::a.txt': del })).toEqual({ 'attachment::a.txt': del });
  });

  it('deleting created also deletes changed, since a close ModDate row is hidden', () => {
    expect(expandDetailEdits({ created: del })).toEqual({ created: del, changed: del, hidden: del });
    const kept = { created: del, changed: { action: 'delete' } };
    expect(expandDetailEdits(kept)).toEqual({ ...kept, hidden: del });
    expect(expandDetailEdits({ changed: del })).toEqual({ changed: del, hidden: del });
  });

  it('leaves an explicit hidden edit alone and does not mutate its input', () => {
    const edits = { title: del, hidden: del };
    expect(expandDetailEdits(edits)).toEqual(edits);
    const only = { title: del };
    expandDetailEdits(only);
    expect(only).toEqual({ title: del });
  });
});

