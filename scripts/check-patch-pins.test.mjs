import { describe, expect, it } from 'vitest';
import { parsePatchName, checkPatchPins } from './check-patch-pins.mjs';

const lock = (name, version) => ({ packages: { [`node_modules/${name}`]: { version } } });
const pkg = (name, spec) => ({ dependencies: { [name]: spec } });

describe('parsePatchName', () => {
  it('parses a plain name', () => {
    expect(parsePatchName('foo+1.2.3.patch')).toEqual({ name: 'foo', version: '1.2.3' });
  });
  it('parses a scoped name', () => {
    expect(parsePatchName('@scope+name+1.2.3.patch')).toEqual({ name: '@scope/name', version: '1.2.3' });
  });
});

describe('checkPatchPins', () => {
  it('fails when the lockfile version differs from the patch', () => {
    const errs = checkPatchPins(['foo+1.2.3.patch'], lock('foo', '1.2.4'), pkg('foo', '1.2.3'));
    expect(errs).toHaveLength(1);
  });
  it('fails when package.json uses a caret', () => {
    const errs = checkPatchPins(['foo+1.2.3.patch'], lock('foo', '1.2.3'), pkg('foo', '^1.2.3'));
    expect(errs).toHaveLength(1);
  });
  it('passes on an exact match', () => {
    expect(checkPatchPins(['foo+1.2.3.patch'], lock('foo', '1.2.3'), pkg('foo', '1.2.3'))).toEqual([]);
  });
  it('passes for a scoped package', () => {
    expect(
      checkPatchPins(['@scope+name+1.2.3.patch'], lock('@scope/name', '1.2.3'), pkg('@scope/name', '1.2.3')),
    ).toEqual([]);
  });
});
