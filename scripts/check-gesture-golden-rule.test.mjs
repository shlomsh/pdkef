import { describe, expect, it } from 'vitest';
import { findForbiddenCalls } from './check-gesture-golden-rule.js';

describe('findForbiddenCalls', () => {
  it('flags a computePatch that dispatches state on every pointermove', () =>
    expect(findForbiddenCalls('start({ computePatch: (e) => { dispatch({ type: "move", x: e.x }); return {}; } });')).toEqual(['dispatch(']));
  it('flags setState and onChange inside an inline computePatch', () =>
    expect(findForbiddenCalls('g({ computePatch: (e) => { setState(e.x); onChange(e.x); return {}; } });').sort()).toEqual(['onChange(', 'setState(']));
  it('flags a computePatch given as a bare reference to a function that commits', () =>
    expect(findForbiddenCalls('const move = (e) => { store.dispatch(e); return {}; };\ng({ computePatch: move });')).toEqual(['dispatch(']));
  it('accepts a computePatch that only computes and returns a patch', () =>
    expect(findForbiddenCalls('g({ computePatch: (e) => { return { x: e.x - start.x }; }, commit: (p) => dispatch(p) });')).toEqual([]));
  it('ignores state calls outside any computePatch body', () =>
    expect(findForbiddenCalls('function onUp(p) { dispatch(p); setState(p); }')).toEqual([]));
});
