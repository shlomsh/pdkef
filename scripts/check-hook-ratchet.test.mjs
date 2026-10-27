import { describe, expect, it } from 'vitest';
import { findRaises } from './ratchet-limits.mjs';
import { compareHooks, countHooks, nextHookRecords } from './check-hook-ratchet.mjs';

const T = { fileThreshold: 10 };
const hooksSource = (n, effects = 0) =>
  [...Array.from({ length: n - effects }, (_, i) => `const a${i} = useState(${i});`), ...Array.from({ length: effects }, () => 'useEffect(() => {}, []);')].join('\n');

describe('countHooks (ARCH-66)', () => {
  it('counts hooks and, separately, effects', () => {
    expect(countHooks('useState(1); useEffect(() => {}); useLayoutEffect(() => {}); useMemo (() => 1);')).toEqual({ hooks: 4, effects: 2 });
  });
  it('does not count names in comments or strings', () => {
    const src = "// useEffect(\n/* useState( */\nconst a = 'useEffect(';\nconst b = \"useRef(\";\nconst c = `useMemo(`;\nuseState(1);";
    expect(countHooks(src)).toEqual({ hooks: 1, effects: 0 });
  });
  it('does not count a hook definition', () => {
    const src = 'function useThing() { return useState(1); }\nconst useOther = () => useRef(1);\nexport const useThird = function () { return 1; };';
    expect(countHooks(src)).toEqual({ hooks: 2, effects: 0 });
  });
});

describe('compareHooks', () => {
  const recorded = { 'a.tsx': { hooks: 12, effects: 2 } };
  it('fails when a recorded file gains an effect', () => {
    const { failures } = compareHooks(recorded, { 'a.tsx': { hooks: 13, effects: 3 } }, T);
    expect(failures.map((f) => f.key)).toEqual(['a.tsx']);
  });
  it('lowers the record when an effect is removed', () => {
    const current = { 'a.tsx': { hooks: 11, effects: 1 } };
    const { failures, lowered } = compareHooks(recorded, current, T);
    expect(failures).toEqual([]);
    expect(lowered).toHaveLength(1);
    expect(nextHookRecords(recorded, current, T)).toEqual({ 'a.tsx': { hooks: 11, effects: 1 } });
  });
  it('drops the record when the file falls to the threshold', () => {
    expect(nextHookRecords(recorded, {}, T)).toEqual({});
  });
  it('fails an unrecorded file over the threshold, passes one at it', () => {
    expect(compareHooks({}, { 'b.tsx': { hooks: 11, effects: 0 } }, T).failures.map((f) => f.key)).toEqual(['b.tsx']);
    expect(compareHooks({}, { 'b.tsx': { hooks: 10, effects: 0 } }, T).failures).toEqual([]);
  });
  it('writes nothing while a failure stands', () => {
    expect(nextHookRecords(recorded, { 'a.tsx': { hooks: 13, effects: 1 } }, T)).toBeNull();
  });
  it('count helper builds files over the threshold', () => {
    expect(countHooks(hooksSource(11, 3))).toEqual({ hooks: 11, effects: 3 });
  });
});

describe('check-ratchet-raises on the hooks section', () => {
  const base = { hooks: { fileThreshold: 10, files: { 'a.tsx': { hooks: 12, effects: 2 } } } };
  it('refuses a raised nested hook or effect number', () => {
    const head = { hooks: { fileThreshold: 10, files: { 'a.tsx': { hooks: 12, effects: 3 } } } };
    expect(findRaises(base, head).map((r) => r.path)).toEqual(['hooks.files.a.tsx.effects']);
  });
  it('passes a lowered number', () => {
    expect(findRaises(base, { hooks: { fileThreshold: 10, files: { 'a.tsx': { hooks: 11, effects: 2 } } } })).toEqual([]);
  });
});
