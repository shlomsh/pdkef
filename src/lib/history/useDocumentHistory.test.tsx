import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { moveEntry, planForFile, type PlanEntry } from '../pagePlan.ts';
import { useDocumentHistory } from './useDocumentHistory.ts';

const { recordAction, reportEdit } = vi.hoisted(() => ({ recordAction: vi.fn(), reportEdit: vi.fn() }));
vi.mock('../actionTrail.ts', () => ({ recordAction }));
vi.mock('../productAnalytics.ts', () => ({ reportEdit }));

interface Doc { plan: PlanEntry[]; label: string }
type Api = ReturnType<typeof useDocumentHistory<Doc>>;

let container: HTMLDivElement | null = null;

function mount(announce: (message: string) => void): { api: () => Api } {
  container = document.createElement('div');
  document.body.appendChild(container);
  let captured!: Api;
  function Probe() {
    captured = useDocumentHistory<Doc>({ plan: planForFile(1, 3), label: 'kept' }, {
      tool: 'merge',
      announce,
      messages: { undone: 'Undone', redone: 'Redone' },
    });
    return null;
  }
  act(() => { render(<Probe />, container!); });
  return { api: () => captured };
}

afterEach(() => {
  if (container) { render(null, container); container.remove(); container = null; }
  recordAction.mockClear();
  reportEdit.mockClear();
});

describe('useDocumentHistory', () => {
  it('commits a plan change as one step, keeps the rest of the document, and reports the edit', () => {
    const { api } = mount(vi.fn());
    act(() => { api().onPlanChange((plan) => moveEntry(plan, 0, 2)); });
    expect(api().present.plan.map((e) => e.pageIndex)).toEqual([1, 2, 0]);
    expect(api().present.label).toBe('kept');
    expect(api().canUndo).toBe(true);
    expect(reportEdit).toHaveBeenCalledWith('merge');
  });

  it('takes no step when the plan comes back unchanged', () => {
    const { api } = mount(vi.fn());
    act(() => { api().onPlanChange((plan) => plan); });
    expect(api().canUndo).toBe(false);
  });

  it('undoes and redoes with an announcement and a trail entry each', () => {
    const announce = vi.fn();
    const { api } = mount(announce);
    act(() => { api().onPlanChange((plan) => moveEntry(plan, 0, 2)); });
    act(() => { api().handleUndo(); });
    expect(api().present.plan.map((e) => e.pageIndex)).toEqual([0, 1, 2]);
    expect(announce).toHaveBeenLastCalledWith('Undone');
    expect(recordAction).toHaveBeenLastCalledWith('undo');
    act(() => { api().handleRedo(); });
    expect(api().present.plan.map((e) => e.pageIndex)).toEqual([1, 2, 0]);
    expect(announce).toHaveBeenLastCalledWith('Redone');
    expect(recordAction).toHaveBeenLastCalledWith('redo');
  });

  it('says nothing when there is nothing to undo or redo', () => {
    const announce = vi.fn();
    const { api } = mount(announce);
    act(() => { api().handleUndo(); api().handleRedo(); });
    expect(announce).not.toHaveBeenCalled();
    expect(recordAction).not.toHaveBeenCalled();
  });

  it('binds Cmd+Z to undo', () => {
    const announce = vi.fn();
    const { api } = mount(announce);
    act(() => { api().onPlanChange((plan) => moveEntry(plan, 0, 2)); });
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true })); });
    expect(api().canUndo).toBe(false);
    expect(announce).toHaveBeenCalledWith('Undone');
  });
});
