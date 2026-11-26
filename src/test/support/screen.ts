// A real matchMedia for jsdom, the way fake-indexeddb is a real IndexedDB: each query is evaluated
// against a screen state a test sets with setScreen, instead of every query answering "matches".

export type Screen = {
  width: number;
  height: number;
  pointer: 'fine' | 'coarse' | 'none';
  hover: 'hover' | 'none';
  reducedMotion: boolean;
  displayMode: 'browser' | 'standalone';
};

// A desktop. jsdom's own window is 1024 x 768, and the suite has always run with reduced motion.
export const DEFAULT_SCREEN: Screen = {
  width: 1024,
  height: 768,
  pointer: 'fine',
  hover: 'hover',
  reducedMotion: true,
  displayMode: 'browser',
};

let screen: Screen = { ...DEFAULT_SCREEN };

function fail(query: string, why: string): never {
  throw new Error(`matchMedia: ${why} in "${query}"`);
}

function pxValue(query: string, raw: string): number {
  if (raw === '0') return 0; // CSS takes a unitless zero
  const m = /^(-?\d+(?:\.\d+)?)px$/.exec(raw);
  if (!m) fail(query, `unsupported length "${raw}"`);
  return Number(m[1]);
}

function evalFeature(query: string, name: string, value: string | undefined, s: Screen): boolean {
  switch (name) {
    case 'width': case 'min-width': case 'max-width':
    case 'height': case 'min-height': case 'max-height': {
      if (value === undefined) fail(query, `"${name}" needs a value`);
      const px = pxValue(query, value);
      const actual = name.endsWith('width') ? s.width : s.height;
      if (name.startsWith('min-')) return actual >= px;
      if (name.startsWith('max-')) return actual <= px;
      return actual === px;
    }
    case 'pointer': case 'any-pointer':
      if (value === undefined) return s.pointer !== 'none';
      if (value !== 'fine' && value !== 'coarse' && value !== 'none') fail(query, `unsupported ${name} "${value}"`);
      return s.pointer === value;
    case 'hover': case 'any-hover':
      if (value === undefined) return s.hover !== 'none';
      if (value !== 'hover' && value !== 'none') fail(query, `unsupported ${name} "${value}"`);
      return s.hover === value;
    case 'prefers-reduced-motion':
      if (value === undefined) return s.reducedMotion;
      if (value !== 'reduce' && value !== 'no-preference') fail(query, `unsupported ${name} "${value}"`);
      return (value === 'reduce') === s.reducedMotion;
    case 'display-mode':
      if (value === undefined) fail(query, '"display-mode" needs a value');
      return s.displayMode === value;
    case 'prefers-color-scheme':
      if (value === undefined) return true;
      if (value !== 'light' && value !== 'dark') fail(query, `unsupported ${name} "${value}"`);
      return value === 'light';
    default:
      return fail(query, `unknown feature "${name}"`);
  }
}

function evalClause(query: string, clause: string, s: Screen): boolean {
  let rest = clause.trim().toLowerCase();
  if (!rest) fail(query, 'empty query');
  let negated = false;
  if (/^not\s/.test(rest)) { negated = true; rest = rest.slice(3).trim(); }
  else if (/^only\s/.test(rest)) rest = rest.slice(4).trim();

  let result = true;
  const type = /^(all|screen|print)(?=\s|$)/.exec(rest);
  if (type) {
    result = type[1] !== 'print';
    rest = rest.slice(type[0].length).trim();
    if (rest) {
      if (!/^and\s*\(/.test(rest)) fail(query, `unexpected "${rest}"`);
      rest = rest.slice(3).trim();
    }
  }
  while (rest) {
    const m = /^\(\s*([a-z-]+)\s*(?::\s*([^)]*?)\s*)?\)\s*/.exec(rest);
    if (!m) fail(query, `cannot read "${rest}"`);
    result = evalFeature(query, m[1], m[2], s) && result;
    rest = rest.slice(m[0].length);
    if (!rest) break;
    if (!/^and\s*\(/.test(rest)) fail(query, `unexpected "${rest}"`);
    rest = rest.slice(3).trim();
  }
  return negated ? !result : result;
}

export function matchesMediaQuery(query: string, state: Screen): boolean {
  if (!query.trim()) return true; // an empty query matches everything
  return query.split(',').some((clause) => evalClause(query, clause, state));
}

class ScreenMediaQueryList extends EventTarget {
  readonly media: string;
  onchange: ((event: Event) => void) | null = null;
  constructor(media: string) {
    super();
    this.media = media;
    matchesMediaQuery(media, screen); // a bad query throws here, naming itself
  }
  get matches(): boolean { return matchesMediaQuery(this.media, screen); }
  addListener(listener: EventListenerOrEventListenerObject | null) { this.addEventListener('change', listener); }
  removeListener(listener: EventListenerOrEventListenerObject | null) { this.removeEventListener('change', listener); }
}

// Every list a test made, held for the worker's life: a real browser keeps a list alive while it has listeners,
// and `matchMedia(q).addEventListener(...)` keeps no reference of its own.
const live = new Map<ScreenMediaQueryList, boolean>();

export function matchMedia(query: string): MediaQueryList {
  const list = new ScreenMediaQueryList(query);
  live.set(list, list.matches);
  return list as unknown as MediaQueryList;
}

export function setScreen(change: Partial<Screen>): void {
  const sizeChanged = (change.width !== undefined && change.width !== screen.width)
    || (change.height !== undefined && change.height !== screen.height);
  screen = { ...screen, ...change };
  // oxlint-disable-next-line landmines/no-test-doubles -- Forced: jsdom's window has a fixed size; this is the screen a test sets.
  window.innerWidth = screen.width;
  // oxlint-disable-next-line landmines/no-test-doubles -- Forced: jsdom's window has a fixed size; this is the screen a test sets.
  window.innerHeight = screen.height;
  if (sizeChanged) window.dispatchEvent(new Event('resize'));
  for (const [list, last] of live) {
    const now = list.matches;
    if (now === last) continue;
    live.set(list, now);
    const event = Object.assign(new Event('change'), { matches: now, media: list.media });
    list.onchange?.(event);
    list.dispatchEvent(event);
  }
}

export function resetScreen(): void {
  screen = { ...DEFAULT_SCREEN };
  if (typeof window !== 'undefined') {
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: jsdom's window has a fixed size; this puts back the default screen.
    window.innerWidth = screen.width;
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: jsdom's window has a fixed size; this puts back the default screen.
    window.innerHeight = screen.height;
  }
  for (const list of live.keys()) live.set(list, list.matches);
}
