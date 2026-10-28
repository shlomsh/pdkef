import { describe, expect, it } from 'vitest';
import { findUnwrappedIslands, islandsIn } from './check-island-boundary.mjs';

// A fake source tree: path -> text. `read` is what the check is given instead of the disk.
const tree = (files) => (path) => (path in files ? files[path] : null);
const page = (body, importLine = "import Tool from '../tools/x/Tool.tsx';") => `---\n${importLine}\n---\n${body}`;
const check = (files, text, file = 'src/pages/x.astro') => findUnwrappedIslands({ file, text, read: tree(files) });

describe('check-island-boundary', () => {
  it('resolves an island imported through an alias like the relative spelling', () => {
    const files = { 'src/shell/Tool.tsx': 'function Tool() {}\nexport default withIslandBoundary(Tool);', 'src/shell/Bare.tsx': 'export default function Bare() { return null; }' };
    expect(check(files, page('<Tool client:load />', "import Tool from '#shell/Tool.tsx';"))).toEqual([]);
    expect(check(files, page('<Bare client:load />', "import Bare from '#shell/Bare.tsx';")).map((p) => p.reason)).toEqual(['default export is not withIslandBoundary(...)']);
    expect(check(files, page('<Gone client:load />', "import Gone from '#shell/Gone.tsx';")).map((p) => p.reason)).toEqual(['cannot resolve the island import']);
  });
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
  it('finds islands whose attributes contain > inside braces', () => {
    expect(islandsIn(page('<Tool onX={() => 1} client:load />'))).toEqual(['Tool']);
    expect(islandsIn(page('<Tool a={x > 1} client:load />'))).toEqual(['Tool']);
    expect(islandsIn(page('<Tool a="x > 1" client:load />'))).toEqual(['Tool']);
  });
  it('does not treat client without a colon, or a later tag, as the earlier tag island', () => {
    expect(islandsIn(page('<Tool client />'))).toEqual([]);
    expect(islandsIn(page('<A b={1} />\n<B client:load />'))).toEqual(['B']);
  });
  it('ignores a commented-out withIslandBoundary export', () => {
    for (const src of [
      '// export default withIslandBoundary(Tool);\nexport default Tool;',
      '/* export default withIslandBoundary(Tool) */\nexport default Tool;',
    ]) {
      expect(check({ 'src/tools/x/Tool.tsx': src }, page('<Tool client:load />')).map((p) => p.island)).toEqual(['Tool']);
    }
  });
});
