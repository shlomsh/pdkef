import { describe, expect, it } from 'vitest';
import { sortCspHashes } from './cspHashOrder.mjs';

const page = (content) =>
  `<html><head><meta charset="utf-8"><meta http-equiv="content-security-policy" content="${content}"><title>x</title></head><body></body></html>`;

describe('sortCspHashes', () => {
  it('gives identical output for the same hash set in two orders', () => {
    const a = page("script-src 'self' 'sha256-bbb' 'sha256-aaa' 'sha384-ccc'");
    const b = page("script-src 'self' 'sha384-ccc' 'sha256-aaa' 'sha256-bbb'");
    expect(sortCspHashes(a)).toBe(sortCspHashes(b));
  });

  it('keeps non-hash tokens in their original place, ahead of the sorted hashes', () => {
    const out = sortCspHashes(page("script-src 'strict-dynamic' 'sha256-z' 'self' 'sha256-a' 'unsafe-inline'"));
    expect(out).toContain("content=\"script-src 'strict-dynamic' 'self' 'unsafe-inline' 'sha256-a' 'sha256-z'\"");
  });

  it('returns html without a CSP meta unchanged', () => {
    const html = '<html><head><meta name="x" content="script-src \'sha256-b\' \'sha256-a\'"></head></html>';
    expect(sortCspHashes(html)).toBe(html);
  });

  it('sorts each directive independently', () => {
    const out = sortCspHashes(page("script-src 'sha256-y' 'sha256-x'; style-src 'self' 'sha256-d' 'sha256-c'"));
    expect(out).toContain("script-src 'sha256-x' 'sha256-y'; style-src 'self' 'sha256-c' 'sha256-d'");
  });

  it('keeps a trailing semicolon', () => {
    const out = sortCspHashes(page("script-src 'sha256-b' 'sha256-a';"));
    expect(out).toContain("content=\"script-src 'sha256-a' 'sha256-b';");
  });

  it('passes a directive with no hashes through unchanged', () => {
    const out = sortCspHashes(page("default-src 'self'; script-src 'sha256-b' 'sha256-a'"));
    expect(out).toContain("default-src 'self'; script-src 'sha256-a' 'sha256-b'");
  });

  it('sorts two CSP metas in one document', () => {
    const meta = (c) => `<meta http-equiv="content-security-policy" content="${c}">`;
    const out = sortCspHashes(`<head>${meta("script-src 'sha256-b' 'sha256-a'")}${meta("style-src 'sha256-d' 'sha256-c'")}</head>`);
    expect(out).toContain("script-src 'sha256-a' 'sha256-b'");
    expect(out).toContain("style-src 'sha256-c' 'sha256-d'");
  });
});
