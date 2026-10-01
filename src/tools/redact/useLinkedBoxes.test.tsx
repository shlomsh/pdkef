// @vitest-environment jsdom
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useLinkedBoxes, { type UseLinkedBoxesResult } from './useLinkedBoxes.ts';
import type { LinkedElement } from './links.ts';

type Box = LinkedElement & { colorMode?: string };

const box = (id: string, pageIndex: number, extra: Partial<Box> = {}): Box => ({
  id, pageIndex, type: 'whiteout', left: 1, top: 2, width: 10, height: 5, color: '#ffffff', colorMode: 'auto', ...extra,
});
const derive = (el: Box, c: Partial<Box>): Partial<Box> => ('left' in c ? { color: `#00000${el.pageIndex}` } : {});

describe('useLinkedBoxes: derive', () => {
  let container: HTMLDivElement;
  afterEach(() => { act(() => { render(null, container); }); container.remove(); });

  function mount(elements: Box[], withDerive = true) {
    container = document.createElement('div');
    let tool!: UseLinkedBoxesResult<Box>;
    const commands = { add: vi.fn(), update: vi.fn(), remove: vi.fn() };
    let n = 0;
    function Harness() {
      tool = useLinkedBoxes<Box>({
        elements, numPages: 3, uniqueId: () => `new-${++n}`, commands, select: () => {},
        ...(withDerive ? { derive } : {}),
      });
      return null;
    }
    act(() => { render(h(Harness, {}), container); });
    return { tool, commands };
  }
  const pair = () => [box('a', 0, { repeatGroupId: 'g' }), box('b', 1, { repeatGroupId: 'g' })];

  it('adds the derived colour to every box an edit reaches and names the primary change', () => {
    const { tool, commands } = mount(pair());
    act(() => { tool.updateElement('a', { left: 10 }); });
    expect(commands.update).toHaveBeenCalledWith(
      'a',
      [
        { id: 'a', changes: { left: 10, color: '#000000' } },
        { id: 'b', changes: { left: 10, color: '#000001' } },
      ],
      { primary: { left: 10 } },
    );
  });

  it('passes no options when derive adds nothing', () => {
    const { tool, commands } = mount(pair());
    act(() => { tool.updateElement('a', { strength: 0.5 }); });
    expect(commands.update.mock.calls[0]).toHaveLength(2);
  });

  it('gives each duplicate its own derived colour', () => {
    const { tool, commands } = mount(pair());
    act(() => { tool.duplicateElement('a'); });
    const [additions] = commands.add.mock.calls[0];
    expect(additions.map((a: Box) => a.color)).toEqual(['#000000', '#000001']);
  });

  it('gives each Every page copy the colour of its own page', () => {
    const { tool, commands } = mount([box('a', 0)]);
    act(() => { tool.repeatOnEveryPage('a'); });
    const [additions] = commands.add.mock.calls[0];
    expect(additions.map((a: Box) => [a.pageIndex, a.color])).toEqual([[1, '#000001'], [2, '#000002']]);
  });

  it('leaves today\'s calls unchanged without derive', () => {
    const { tool, commands } = mount(pair(), false);
    act(() => { tool.updateElement('a', { left: 10 }); });
    expect(commands.update).toHaveBeenCalledWith('a', [
      { id: 'a', changes: { left: 10 } },
      { id: 'b', changes: { left: 10 } },
    ]);
    act(() => { tool.repeatOnEveryPage('b'); });
    expect(commands.add.mock.calls[0][0].map((a: Box) => a.color)).toEqual(['#ffffff']);
  });
});
