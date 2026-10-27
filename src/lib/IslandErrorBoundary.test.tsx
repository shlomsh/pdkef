// @ts-nocheck - jsdom test of the shared island boundary (ARCH-72)
import { render } from 'preact';
import { useState } from 'preact/hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reportError = vi.fn();

vi.mock('./errorReport.ts', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, reportError: (...args) => { reportError(...args); return actual.reportError(...args); } };
});

function Boom({ error }) {
  throw error;
}

let container;
beforeEach(() => {
  vi.resetModules();
  reportError.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  render(null, container);
  container.remove();
  vi.restoreAllMocks();
});

async function load() {
  return (await import('./IslandErrorBoundary.tsx')).default;
}

describe('IslandErrorBoundary', () => {
  it('reports a render error once and lets it propagate', async () => {
    const Boundary = await load();
    const error = new Error('render failed');
    expect(() => render(<Boundary><Boom error={error} /></Boundary>, container)).toThrow(error);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError.mock.calls[0][1]).toBe(error);
  });

  it('installs the window handlers once however many boundaries mount', async () => {
    const Boundary = await load();
    const add = vi.spyOn(window, 'addEventListener');
    const second = document.createElement('div');
    document.body.appendChild(second);
    render(<Boundary><p>one</p></Boundary>, container);
    render(<Boundary><p>two</p></Boundary>, second);
    await new Promise((r) => setTimeout(r, 0)); // componentDidMount-time work has run
    const count = (type) => add.mock.calls.filter(([t]) => t === type).length;
    expect(count('error')).toBe(1);
    expect(count('unhandledrejection')).toBe(1);
    render(null, second);
    second.remove();
  });

  it('reports once when boundaries nest', async () => {
    const Boundary = await load();
    const error = new Error('render failed');
    expect(() => render(<Boundary><Boundary><Boom error={error} /></Boundary></Boundary>, container)).toThrow(error);
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it('does not report again when the same error reaches the window handler', async () => {
    const Boundary = await load();
    const error = new Error('render failed');
    expect(() => render(<Boundary><Boom error={error} /></Boundary>, container)).toThrow(error);
    expect(reportError).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new ErrorEvent('error', { error }));
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it('reports once for a throwing hook in a wrapped island, even inside another boundary', async () => {
    const mod = await import('./IslandErrorBoundary.tsx');
    const Boundary = mod.default;
    const error = new Error('hook failed');
    function Island() {
      useState(() => { throw error; });
      return null;
    }
    const Wrapped = mod.withIslandBoundary(Island);
    expect(() => render(<Boundary><Wrapped /></Boundary>, container)).toThrow(error);
    expect(reportError).toHaveBeenCalledTimes(1);
  });
});
