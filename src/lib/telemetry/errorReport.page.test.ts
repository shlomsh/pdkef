// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setScreen } from '../../test/support/screen.ts';
import { readPageContext } from './errorReport.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  history.pushState(null, '', '/');
  document.documentElement.className = '';
  // Forced: undoes the service worker the first test defined
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('readPageContext', () => {
  it('reads the page facts', () => {
    history.pushState(null, '', '/he/sign/');
    // Forced: a service worker controlling the page, which cannot be set per test
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { controller: {} } });
    setScreen({ displayMode: 'standalone' });
    expect(readPageContext()).toMatchObject({ tool: '/he/sign/', installed: true, sw: true });
  });
  it('falls back to / for a path outside the schema shape', () => {
    for (const p of ['/x', '/x%3Fy/', '/Sign/', '/a/b/c/d/', '/a/b/c/d/e/']) {
      history.pushState(null, '', p);
      expect(readPageContext().tool).toBe('/');
    }
  });
  it('never carries the query', () => {
    history.pushState(null, '', '/sign/?x=y');
    expect(readPageContext().tool).toBe('/sign/');
  });
  it('falls back for that one fact when matchMedia throws, keeping the others', () => {
    history.pushState(null, '', '/sign/');
    // Forced: a matchMedia that throws, which no test browser can be put in
    vi.stubGlobal('matchMedia', () => {
      throw new Error('no');
    });
    expect(readPageContext()).toMatchObject({ tool: '/sign/', installed: false });
  });
});

describe('build in the page context and report', () => {
  const stubBuild = (content: string | null) => {
    const timing = content === null ? [] : [{ name: 'build', description: content }];
    // Forced: a Server-Timing header with the build commit, which the test server does not send
    vi.stubGlobal('performance', { getEntriesByType: () => [{ serverTiming: timing }] });
  };
  it('readPageContext includes build only when the tag is valid', () => {
    history.pushState(null, '', '/sign/');
    stubBuild('abc1234');
    expect(readPageContext().build).toBe('abc1234');
    for (const bad of [null, 'nope']) {
      stubBuild(bad);
      expect('build' in readPageContext()).toBe(false);
    }
  });
});

describe('translated field (SIGN-40)', () => {
  it('readPageContext sends translated: true only when <html> carries translated-ltr or -rtl', () => {
    history.pushState(null, '', '/sign/');
    document.documentElement.className = 'translated-ltr';
    expect(readPageContext().translated).toBe(true);
    document.documentElement.className = 'a translated-rtl b';
    expect(readPageContext().translated).toBe(true);
    document.documentElement.className = 'untranslated-ltr';
    expect('translated' in readPageContext()).toBe(false);
  });
});
