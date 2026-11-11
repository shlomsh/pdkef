/**
 * MEM-39: the service worker is registered once a person has opened a file in
 * a tool, not on every first page view. Its install costs dozens of requests,
 * and most first visitors never come back. This module is the one place that
 * says when a person counts as engaged:
 *
 * - a registration already exists for this origin (a returning device keeps
 *   its worker and its updates),
 * - a file was opened on this device before (`FILE_OPENED_KEY`),
 * - the page runs as an installed app,
 * - the page is the install page (a person there asked for offline use),
 * - otherwise it waits for a file to be opened (`markFileOpened`, called by
 *   the tool shell) or for the browser's `appinstalled` event.
 *
 * Pure decisions over injected inputs; the default wiring reads the globals.
 */

/** @testSeam */
export const FILE_OPENED_KEY = 'pdkef:file-opened';
/** @testSeam */
export const FILE_OPENED_EVENT = 'pdkef:file-opened';
const APP_INSTALLED_EVENT = 'appinstalled';

interface MarkDeps {
  storage?: { setItem(key: string, value: string): void };
  dispatch: (eventName: string) => void;
}

function browserMarkDeps(): MarkDeps {
  return {
    storage: safely(() => globalThis.localStorage, undefined),
    dispatch: (name) => globalThis.dispatchEvent?.(new Event(name)),
  };
}

function safely<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    // expected: storage and matchMedia can be refused or absent
    return fallback;
  }
}

/** A tool accepted a file. Remembers it on this device and tells this page. Idempotent. */
export function markFileOpened(deps: MarkDeps = browserMarkDeps()): void {
  safely(() => deps.storage?.setItem(FILE_OPENED_KEY, '1'), undefined);
  safely(() => deps.dispatch(FILE_OPENED_EVENT), undefined);
}

const INSTALL_PAGE = /^\/(?:[a-z]{2}\/)?install-pdf-app\/$/;

/**
 * The install page and its localized twin: a person there has asked for the app to work offline.
 * @testSeam
 */
export function isInstallPage(pathname: string): boolean {
  return INSTALL_PAGE.test(pathname);
}

interface EngagedDeps {
  storage?: { getItem(key: string): string | null };
  serviceWorker?: { getRegistration?(): Promise<unknown> };
  matchMedia?: (query: string) => { matches: boolean };
  /** iOS `navigator.standalone`. */
  standalone?: boolean;
  pathname?: () => string;
  window: {
    addEventListener(type: string, listener: () => void): void;
    removeEventListener(type: string, listener: () => void): void;
  };
}

function browserEngagedDeps(): EngagedDeps {
  return {
    storage: safely(() => globalThis.localStorage, undefined),
    serviceWorker: safely(() => navigator.serviceWorker, undefined),
    matchMedia: safely(() => globalThis.matchMedia?.bind(globalThis), undefined),
    standalone: safely(() => (navigator as { standalone?: boolean }).standalone, undefined),
    pathname: () => location.pathname,
    window,
  };
}

/** Resolves once the person has shown they want the app; never rejects. */
export function whenEngaged(deps: EngagedDeps = browserEngagedDeps()): Promise<void> {
  return new Promise<void>((resolve) => {
    const events = [FILE_OPENED_EVENT, APP_INSTALLED_EVENT];
    const finish = () => {
      for (const name of events) deps.window.removeEventListener(name, finish);
      resolve();
    };
    // Listening first: an event during the async check below must not be lost.
    for (const name of events) deps.window.addEventListener(name, finish);

    const synchronous =
      safely(() => deps.storage?.getItem(FILE_OPENED_KEY) != null, false)
      || deps.standalone === true
      || safely(() => isInstallPage(deps.pathname?.() ?? ''), false)
      || safely(() => deps.matchMedia?.('(display-mode: standalone)').matches === true, false);
    if (synchronous) return finish();

    const lookup = safely(() => deps.serviceWorker?.getRegistration?.(), undefined);
    Promise.resolve(lookup).then((registration) => {
      if (registration) finish();
    }, () => {
      // expected: a browser that refuses workers; the events decide
    });
  });
}
