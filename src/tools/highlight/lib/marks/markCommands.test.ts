import { describe, expect, it, vi } from 'vitest';
import type { CommentElement, HighlightElement } from '#editor/model/editorModel.ts';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import { markCommands } from './markCommands.ts';

const mark: HighlightElement = {
  id: 'h1', type: 'highlight', pageIndex: 0, left: 10, top: 20, width: 30, height: 4,
  color: '#FFF34D', bands: [{ left: 0, top: 0, width: 100, height: 100 }],
};
const saved: CommentElement = {
  id: 'c1', type: 'comment', pageIndex: 0, left: 10, top: 20, width: 30, height: 4,
  comment: 'Check this', anchor: { kind: 'element', elementId: 'h1' },
};

function setup(elements: (HighlightElement | CommentElement)[] = [mark]) {
  const deps = { elements, dispatch: vi.fn(), logAction: vi.fn(), rearm: vi.fn(), setAnnouncement: vi.fn() };
  return { deps, commands: markCommands(deps) };
}

describe('markCommands', () => {
  it('change updates the mark, logs the step and re-arms the marker with the change', () => {
    const { deps, commands } = setup();
    commands.change(mark, { color: '#FF8FCF' });
    const types = deps.dispatch.mock.calls.map(([a]) => a.type);
    expect(types[0]).toBe('UPDATE_ELEMENT');
    expect(deps.dispatch.mock.calls[0][0].payload).toMatchObject({ id: 'h1', changes: { color: '#FF8FCF' } });
    expect(deps.rearm).toHaveBeenCalledWith({ color: '#FF8FCF' });
  });

  it('remove deletes the mark and announces it', () => {
    const { deps, commands } = setup();
    commands.remove(mark);
    expect(deps.dispatch).toHaveBeenCalledWith({ type: 'DELETE_ELEMENT', payload: 'h1' });
    expect(deps.setAnnouncement).toHaveBeenCalledWith(englishSignMessages.removedElement);
  });

  it('comment on a mark with none adds a blank one and makes it active', () => {
    const { deps, commands } = setup();
    const target = commands.comment(mark);
    const [add, active] = deps.dispatch.mock.calls.map(([a]) => a);
    expect(add).toMatchObject({ type: 'ADD_ELEMENT', payload: { type: 'comment', anchor: { elementId: 'h1' } } });
    expect(active).toEqual({ type: 'SET_ACTIVE_ELEMENT_ID', payload: add.payload.id });
    expect(target).toEqual({ id: add.payload.id, comment: '', isNew: true });
  });

  it('comment on a mark that has one only opens it', () => {
    const { deps, commands } = setup([mark, saved]);
    const target = commands.comment(mark);
    expect(deps.dispatch.mock.calls.map(([a]) => a)).toEqual([{ type: 'SET_ACTIVE_ELEMENT_ID', payload: 'c1' }]);
    expect(target).toEqual({ id: 'c1', comment: 'Check this', isNew: false });
  });
});
