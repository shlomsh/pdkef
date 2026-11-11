import { describe, expect, it, vi } from 'vitest';
import { FILE_OPENED_EVENT, FILE_OPENED_KEY, isInstallPage, markFileOpened, whenEngaged } from './engagement.ts';

function fakeWindow() {
  const listeners = new Map<string, Array<() => void>>();
  return {
    addEventListener: (type: string, fn: () => void) => { listeners.set(type, [...(listeners.get(type) ?? []), fn]); },
    removeEventListener: (type: string, fn: () => void) => { listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn)); },
    fire: (type: string) => { for (const fn of [...(listeners.get(type) ?? [])]) fn(); },
    count: (type: string) => (listeners.get(type) ?? []).length,
  };
}

function engagedDeps(over: Record<string, unknown> = {}) {
  const win = fakeWindow();
  const deps = {
    storage: { getItem: () => null as string | null },
    serviceWorker: { getRegistration: () => Promise.resolve(undefined as unknown) },
    matchMedia: () => ({ matches: false }),
    standalone: undefined as boolean | undefined,
    pathname: () => '/sign/',
    window: win,
    ...over,
  };
  return { deps, win };
}

const settled = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

function track(p: Promise<void>) {
  let done = false;
  void p.then(() => { done = true; });
  return { isDone: async () => { await settled(); return done; } };
}

describe('markFileOpened', () => {
  it('sets the key and dispatches the event', () => {
    const setItem = vi.fn();
    const dispatch = vi.fn();
    markFileOpened({ storage: { setItem }, dispatch });
    expect(setItem).toHaveBeenCalledWith(FILE_OPENED_KEY, '1');
    expect(dispatch).toHaveBeenCalledWith(FILE_OPENED_EVENT);
  });

  it('still dispatches when storage refuses the write', () => {
    const dispatch = vi.fn();
    const storage = { setItem: () => { throw new Error('blocked'); } };
    expect(() => markFileOpened({ storage, dispatch })).not.toThrow();
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('is idempotent: a second call leaves the same state', () => {
    const data = new Map<string, string>();
    const storage = { setItem: (k: string, v: string) => { data.set(k, v); } };
    const dispatch = vi.fn();
    markFileOpened({ storage, dispatch });
    markFileOpened({ storage, dispatch });
    expect([...data]).toEqual([[FILE_OPENED_KEY, '1']]);
  });

  it('uses the same key and event name as the spec', () => {
    expect(FILE_OPENED_KEY).toBe('pdkef:file-opened');
    expect(FILE_OPENED_EVENT).toBe('pdkef:file-opened');
  });
});

describe('whenEngaged', () => {
  it('resolves for a device that already has a registration', async () => {
    const { deps } = engagedDeps({ serviceWorker: { getRegistration: () => Promise.resolve({ scope: '/' }) } });
    expect(await track(whenEngaged(deps)).isDone()).toBe(true);
  });

  it('resolves when the storage key is set', async () => {
    const { deps } = engagedDeps({ storage: { getItem: (k: string) => (k === FILE_OPENED_KEY ? '1' : null) } });
    expect(await track(whenEngaged(deps)).isDone()).toBe(true);
  });

  it('resolves for an installed app (display-mode: standalone)', async () => {
    const queries: string[] = [];
    const { deps } = engagedDeps({ matchMedia: (q: string) => { queries.push(q); return { matches: true }; } });
    expect(await track(whenEngaged(deps)).isDone()).toBe(true);
    expect(queries).toContain('(display-mode: standalone)');
  });

  it('resolves for iOS navigator.standalone', async () => {
    const { deps } = engagedDeps({ standalone: true });
    expect(await track(whenEngaged(deps)).isDone()).toBe(true);
  });

  it('waits when nothing says the person is engaged', async () => {
    const { deps } = engagedDeps();
    expect(await track(whenEngaged(deps)).isDone()).toBe(false);
  });

  it.each(['pdkef:file-opened', 'appinstalled'])('resolves on the %s event and stops listening', async (name) => {
    const { deps, win } = engagedDeps();
    const t = track(whenEngaged(deps));
    expect(await t.isDone()).toBe(false);
    win.fire(name);
    expect(await t.isDone()).toBe(true);
    expect(win.count('pdkef:file-opened')).toBe(0);
    expect(win.count('appinstalled')).toBe(0);
  });

  it('treats unreadable storage as not set', async () => {
    const { deps } = engagedDeps({ storage: { getItem: () => { throw new Error('blocked'); } } });
    expect(await track(whenEngaged(deps)).isDone()).toBe(false);
  });

  it('treats a failing getRegistration or matchMedia as no', async () => {
    const { deps, win } = engagedDeps({
      serviceWorker: { getRegistration: () => Promise.reject(new Error('refused')) },
      matchMedia: () => { throw new Error('nope'); },
    });
    const t = track(whenEngaged(deps));
    expect(await t.isDone()).toBe(false);
    win.fire(FILE_OPENED_EVENT);
    expect(await t.isDone()).toBe(true);
  });

  it('works without a service worker container or storage', async () => {
    const { deps, win } = engagedDeps({ storage: undefined, serviceWorker: undefined, matchMedia: undefined });
    const t = track(whenEngaged(deps));
    expect(await t.isDone()).toBe(false);
    win.fire('appinstalled');
    expect(await t.isDone()).toBe(true);
  });

  it('catches an event that fires while the checks are still pending', async () => {
    let resolveReg: (v: unknown) => void = () => {};
    const { deps, win } = engagedDeps({ serviceWorker: { getRegistration: () => new Promise((r) => { resolveReg = r; }) } });
    const t = track(whenEngaged(deps));
    win.fire(FILE_OPENED_EVENT);
    expect(await t.isDone()).toBe(true);
    resolveReg(undefined);
  });
});

describe('the install page', () => {
  it('isInstallPage matches the page and its localized twin only', () => {
    expect(isInstallPage('/install-pdf-app/')).toBe(true);
    expect(isInstallPage('/he/install-pdf-app/')).toBe(true);
    for (const p of ['/sign/', '/', '/install-pdf-app-extra/', '/install-pdf-app', '/a/b/install-pdf-app/']) {
      expect(isInstallPage(p)).toBe(false);
    }
  });

  it.each(['/install-pdf-app/', '/he/install-pdf-app/'])('resolves at once on %s', async (path) => {
    const { deps } = engagedDeps({ pathname: () => path });
    expect(await track(whenEngaged(deps)).isDone()).toBe(true);
  });

  it.each(['/sign/', '/', '/install-pdf-app-extra/'])('does not resolve on %s', async (path) => {
    const { deps } = engagedDeps({ pathname: () => path });
    expect(await track(whenEngaged(deps)).isDone()).toBe(false);
  });
});
