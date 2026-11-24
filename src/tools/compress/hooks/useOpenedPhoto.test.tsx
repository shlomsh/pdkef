// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { batchReducer, emptyBatch, type BatchRow } from '../state/imageBatch.ts';
import { useOpenedPhoto } from './useOpenedPhoto.ts';

const photo = (name: string) => new File(['x'], name, { type: 'image/jpeg' });
const choose = (files: File[], state = emptyBatch) => batchReducer(state, { type: 'filesChosen', files, targetKB: 100 });

type Api = ReturnType<typeof useOpenedPhoto>;
let host: HTMLElement;
let api: Api;
function Harness({ rows }: { rows: BatchRow[] }) {
  api = useOpenedPhoto(rows);
  return null;
}
const mount = (rows: BatchRow[]) => {
  host = document.createElement('div');
  act(() => render(<Harness rows={rows} />, host));
};
afterEach(() => act(() => render(null, host)));

describe('useOpenedPhoto', () => {
  it('opens a photo by its file, and back closes it and remembers where to land', () => {
    const [a, b] = [photo('a.jpg'), photo('b.jpg')];
    const { rows } = choose([a, b]);
    mount(rows);
    expect(api.openedRow).toBeNull();
    act(() => api.open(b));
    expect(api.openedRow).toBe(rows[1]);
    act(() => api.back());
    expect(api.openedRow).toBeNull();
    expect(api.returnTo).toBe(b);
  });

  it('stays on its photo while a new target recompresses the set', () => {
    const [a, b] = [photo('a.jpg'), photo('b.jpg')];
    const first = choose([a, b]);
    mount(first.rows);
    act(() => api.open(a));
    const again = batchReducer(first, { type: 'targetChanged', targetKB: 50 });
    act(() => render(<Harness rows={again.rows} />, host));
    expect(api.openedRow).toBe(again.rows[0]);
    expect(api.openedRow?.status).toBe('waiting');
  });

  it('a new set, whose ids start over, never opens a stranger', () => {
    const first = choose([photo('a.jpg'), photo('b.jpg')]);
    mount(first.rows);
    act(() => api.open(first.rows[0].file));
    const next = choose([photo('c.jpg'), photo('d.jpg')], first);
    act(() => render(<Harness rows={next.rows} />, host));
    expect(api.openedRow).toBeNull();
  });
});
