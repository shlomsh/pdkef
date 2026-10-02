import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useRecentWhiteoutColors } from './useRecentWhiteoutColors.ts';
import { getRecentWhiteoutColors } from '../../editor/workspace/preferenceStore.ts';

let host: HTMLDivElement;
let latest: ReturnType<typeof useRecentWhiteoutColors>;
function Probe() { latest = useRecentWhiteoutColors(); return null; }

beforeEach(() => { localStorage.clear(); host = document.createElement('div'); document.body.appendChild(host); });
afterEach(() => { act(() => render(null, host)); host.remove(); });

describe('useRecentWhiteoutColors', () => {
  it('starts from the stored colours', () => {
    localStorage.clear();
    act(() => render(<Probe />, host));
    expect(latest[0]).toEqual(getRecentWhiteoutColors());
  });

  it('remembers a colour: most recent first, and persisted', () => {
    act(() => render(<Probe />, host));
    act(() => latest[1]('#112233'));
    act(() => latest[1]('#abcdef'));
    expect(latest[0][0]).toBe('#abcdef');
    expect(latest[0]).toContain('#112233');
    expect(getRecentWhiteoutColors()).toEqual([...latest[0]]);
  });
});
