import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach } from 'vitest';
import { useLatestRun, type LatestRun } from './useLatestRun.ts';

// The four tools' own losing-race tests (PdfRedactTool.test.tsx,
// PdfSplitTool.test.tsx, PdfToImageTool.test.tsx, PdfSecurityTool.test.tsx)
// prove the behaviour where it matters. This file pins the primitive's own
// contract so those four do not have to re-derive it.

let container: HTMLDivElement | null = null;

function mountProbe(keys?: unknown[]): { run: LatestRun; rerender: (nextKeys?: unknown[]) => void } {
  container = document.createElement('div');
  document.body.appendChild(container);

  let captured!: LatestRun;
  let currentKeys = keys;

  function Probe() {
    // Re-read on every render, exactly as a tool's own `() => [file, rev]`
    // closure does.
    captured = useLatestRun(currentKeys === undefined ? undefined : () => currentKeys as unknown[]);
    return null;
  }

  act(() => render(<Probe />, container!));

  return {
    get run() { return captured; },
    rerender(nextKeys?: unknown[]) {
      currentKeys = nextKeys;
      act(() => render(<Probe />, container!));
    },
  };
}

describe('useLatestRun', () => {
  afterEach(() => {
    if (container) {
      act(() => render(null, container!));
      container.remove();
      container = null;
    }
  });

  it('keeps a ticket current until something moves', () => {
    const probe = mountProbe();
    const ticket = probe.run.begin();
    expect(ticket.isCurrent()).toBe(true);
    probe.rerender();
    expect(ticket.isCurrent()).toBe(true);
  });

  it('supersedes an earlier run when a new one begins, with no explicit invalidation', () => {
    const probe = mountProbe();
    const first = probe.run.begin();
    const second = probe.run.begin();
    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
  });

  it('retires a run on invalidate, and reports whether one was live', () => {
    const probe = mountProbe();
    expect(probe.run.invalidate()).toBe(false);

    const ticket = probe.run.begin();
    expect(probe.run.invalidate()).toBe(true);
    expect(ticket.isCurrent()).toBe(false);
    // Reported once: the caller that already reset its UI is not asked twice.
    expect(probe.run.invalidate()).toBe(false);
  });

  it('does not report a settled run as live', () => {
    const probe = mountProbe();
    const ticket = probe.run.begin();
    ticket.settle();
    expect(probe.run.invalidate()).toBe(false);
  });

  it('retires a ticket whose key moved, even with no invalidate call', () => {
    const fileA = { name: 'a.pdf' };
    const fileB = { name: 'b.pdf' };
    const probe = mountProbe([fileA, 3]);

    const ticket = probe.run.begin();
    expect(ticket.isCurrent()).toBe(true);

    // Identity, not value: an equal-looking replacement still counts.
    probe.rerender([{ name: 'a.pdf' }, 3]);
    expect(ticket.isCurrent()).toBe(false);

    const next = probe.run.begin();
    probe.rerender([fileB, 3]);
    expect(next.isCurrent()).toBe(false);

    const third = probe.run.begin();
    probe.rerender([fileB, 4]);
    expect(third.isCurrent()).toBe(false);
  });

  it('is stable across renders, so it can sit in an effect\'s dependency list', () => {
    const probe = mountProbe();
    const first = probe.run;
    probe.rerender();
    expect(probe.run).toBe(first);
  });
});
