import { describe, expect, it, vi } from 'vitest';
import type { CommentElement, HighlightElement } from '#editor/model/editorModel.ts';
import { withPhoneWriting } from './phoneWriting.ts';

const mark: HighlightElement = {
  id: 'h1', type: 'highlight', pageIndex: 0, left: 10, top: 20, width: 30, height: 4,
  color: '#FFF34D', bands: [{ left: 0, top: 0, width: 100, height: 100 }],
};
const saved: CommentElement = {
  id: 'c1', type: 'comment', pageIndex: 0, left: 10, top: 20, width: 30, height: 4,
  comment: 'Check this', anchor: { kind: 'element', elementId: 'h1' },
};

function setup(wide: boolean) {
  const writer = { open: vi.fn() };
  const base = { comment: vi.fn(() => ({ id: 'c2', comment: '', isNew: true })), remove: vi.fn() };
  return { writer, base, commands: withPhoneWriting(base, [mark, saved], { wide, writer }) };
}

describe('withPhoneWriting', () => {
  it('on a narrow workspace, Comment makes the note active and opens the writer on it', () => {
    const { writer, base, commands } = setup(false);
    expect(commands.comment(mark)).toEqual({ id: 'c2', comment: '', isNew: true });
    expect(base.comment).toHaveBeenCalledWith(mark);
    expect(writer.open).toHaveBeenCalledWith({ id: 'c2', comment: '', isNew: true });
  });

  it('on a wide workspace, Comment only makes the note active', () => {
    const { writer, commands } = setup(true);
    commands.comment(mark);
    expect(writer.open).not.toHaveBeenCalled();
  });

  it('Edit opens the writer on the saved text, and ignores anything that is not a comment', () => {
    const { writer, commands } = setup(false);
    commands.editNote('c1');
    expect(writer.open).toHaveBeenCalledWith({ id: 'c1', comment: 'Check this', isNew: false });
    commands.editNote('h1');
    expect(writer.open).toHaveBeenCalledTimes(1);
  });

  it('keeps the other commands', () => {
    const { base, commands } = setup(false);
    commands.remove(mark);
    expect(base.remove).toHaveBeenCalledWith(mark);
  });
});
