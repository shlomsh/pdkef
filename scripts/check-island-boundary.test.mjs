import { describe, expect, it } from 'vitest';
import { findUnwrappedIslands, islandsIn } from './check-island-boundary.mjs';

// A fake source tree: path -> text. `read` is what the check is given instead of the disk.
const tree = (files) => (path) => (path in files ? files[path] : null);
const page = (body, importLine = "import Tool from '../tools/x/Tool.tsx';") => `---\n${importLine}\n---\n${body}`;
const check = (files, text, file = 'src/pages/x.astro') => findUnwrappedIslands({ file, text, read: tree(files) });

describe('check-island-boundary', () => {
  it('fails an island whose default export is not withIslandBoundary', () => {
    const files = { 'src/tools/x/Tool.tsx': 'export default function Tool() { return null; }' };
    expect(check(files, page('<Tool client:load />')).map((p) => p.island)).toEqual(['Tool']);
  });
  it('passes a wrapped island', () => {
    const files = { 'src/tools/x/Tool.tsx': 'function Tool() {}\nexport default withIslandBoundary(Tool);' };
    expect(check(files, page('<Tool client:load />'))).toEqual([]);
  });
  it('passes the inline export default withIslandBoundary(function X() {...}) form', () => {
    const files = { 'src/tools/x/Tool.tsx': 'export default withIslandBoundary(function Tool({ a }) {\n  return null;\n});' };
    expect(check(files, page('<Tool client:load />'))).toEqual([]);
  });
  it('reads a multi-line tag and a client:only directive', () => {
    const files = { 'src/tools/x/Tool.tsx': 'export default function Tool() {}' };
    expect(islandsIn(page('<Tool\n  client:only="preact"\n  a="b"\n/>'))).toEqual(['Tool']);
    expect(check(files, page('<Tool\n  client:visible\n/>')).length).toBe(1);
  });
  it('ignores client: named in comments and plain components', () => {
    const files = { 'src/tools/x/Tool.tsx': 'export default function Tool() {}' };
    const text = page('{/* <Tool client:load /> */}\n<Tool />', "import Tool from '../tools/x/Tool.tsx';\n// <Tool client:load />");
    expect(check(files, text)).toEqual([]);
  });
  it('fails an island it cannot resolve rather than passing it silently', () => {
    expect(check({}, page('<Tool client:load />')).map((p) => p.reason)).toEqual([expect.stringContaining('cannot resolve')]);
  });
  it('tries the usual extensions when the import names none', () => {
    const files = { 'src/tools/x/Tool.tsx': 'export default withIslandBoundary(Tool);' };
    expect(check(files, page('<Tool client:load />', "import Tool from '../tools/x/Tool';"))).toEqual([]);
  });
});
