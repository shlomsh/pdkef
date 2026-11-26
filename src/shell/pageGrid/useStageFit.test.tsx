import { render } from 'preact';
import { useRef } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setScreen, resetScreen } from '../../test/support/screen.ts';
import { waitUntil } from '../../test/support/waitUntil.ts';
import { MIN_CELL, useStageFit } from './useStageFit.ts';
import type { FitItem } from './stageFit.ts';

const items: FitItem[] = [{ span: 1, breakBefore: false }, { span: 1, breakBefore: false }];

function Harness({ onCell }: { onCell: (cell: number | null) => void }) {
  const gridRef = useRef<HTMLUListElement>(null);
  const cell = useStageFit(gridRef, items);
  onCell(cell);
  return <ul ref={gridRef} />;
}

describe('useStageFit', () => {
  let host: HTMLElement;
  let seen: number | null | undefined;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    seen = undefined;
  });

  afterEach(() => {
    render(null, host);
    host.remove();
    resetScreen();
  });

  it('refits when the window crosses the desktop width and back', async () => {
    setScreen({ width: 1280 });
    await act(async () => { render(<Harness onCell={(cell) => { seen = cell; }} />, host); });
    // jsdom has no layout, so a desktop grid keeps the minimum cell.
    expect(seen).toBe(MIN_CELL);

    await act(async () => { setScreen({ width: 390 }); });
    await waitUntil(() => expect(seen).toBeNull());

    await act(async () => { setScreen({ width: 1280 }); });
    await waitUntil(() => expect(seen).toBe(MIN_CELL));
  });
});
