import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import { expect, it, vi } from 'vitest';
import { drainAfterPaint } from './afterPaintDrain.ts';

it('runs the effect a render left for after the next paint, whatever the test did to the clock', async () => {
  const ran: string[] = [];
  function Late() {
    useEffect(() => { ran.push('effect'); }, []);
    return null;
  }
  render(<Late />, document.createElement('div'));
  expect(ran).toEqual([]);
  vi.useFakeTimers();
  await drainAfterPaint();
  expect(ran).toEqual(['effect']);
});
