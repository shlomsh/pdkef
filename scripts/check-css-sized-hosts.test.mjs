import { describe, expect, it } from 'vitest';
import { findUnsizedHosts, checkCss } from './check-css-sized-hosts.mjs';

/* findUnsizedHosts() is the pure heuristic behind check-css-sized-hosts.mjs: a rule `.host > svg|img|canvas|*`
   that is position: absolute leaves `.host` with no in-flow content, so the host must carry its own size. */

// LookControls.module.css at de53f47f^: in a flex row this shrank to 0 px wide.
const shipped = `.thicknessLine { position: relative; display: block; height: 14px; margin: 0 10%; }
.thicknessLine > svg { position: absolute; inset: 0; width: 100%; height: 100%; }
`;

describe('findUnsizedHosts', () => {
  it('flags the shipped .thicknessLine (no width or flex)', () => {
    expect(findUnsizedHosts(shipped)).toEqual([{ host: 'thicknessLine', line: 2 }]);
  });

  it('passes the fixed version with flex', () => {
    const fixed = shipped.replace('display: block;', 'display: block; flex: 1 1 auto;');
    expect(findUnsizedHosts(fixed)).toEqual([]);
  });

  it('passes a host with a width', () => {
    expect(findUnsizedHosts('.h { position: relative; width: 4rem; }\n.h > img { position: absolute; inset: 0; }')).toEqual([]);
  });

  it('flags a host that has no rule at all, and covers canvas and *', () => {
    expect(findUnsizedHosts('.a > canvas { position: absolute; }\n.b > * { position: absolute; }').map((f) => f.host)).toEqual(['a', 'b']);
  });

  it('flags an absolute host with no inset or width: it shrinks to its content too', () => {
    expect(findUnsizedHosts('.s { position: absolute; left: 0; }\n.s > svg { position: absolute; }')).toEqual([{ host: 's', line: 2 }]);
  });
  it('passes a host that is itself fixed or absolute and stretched by its inset (not a flex item)', () => {
    expect(findUnsizedHosts('.s { position: fixed; inset: 0; }\n.s > * { position: absolute; }')).toEqual([]);
  });

  it('ignores a child that is not absolute', () => {
    expect(findUnsizedHosts('.h { height: 1px; }\n.h > svg { width: 100%; }')).toEqual([]);
  });

  it('accepts justify-self: stretch and a size set in a later rule', () => {
    expect(findUnsizedHosts('.h > svg { position: absolute; }\n.h { justify-self: stretch; }')).toEqual([]);
  });
});

describe('checkCss', () => {
  it('drops allowlisted hosts for that file only', () => {
    const allow = [{ file: 'a.module.css', host: 'thicknessLine', reason: 'also .face' }];
    expect(checkCss('a.module.css', shipped, allow)).toEqual([]);
    expect(checkCss('b.module.css', shipped, allow)).toHaveLength(1);
  });
});
