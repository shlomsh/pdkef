import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { pruneCspHashes, sortCspHashes } from './cspHashOrder.mjs';

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

describe('pruneCspHashes', () => {
  const sha = (algo, text) => `'${algo}-${crypto.createHash(algo).update(text).digest('base64')}'`;
  const doc = (csp, body) =>
    `<html><head><meta http-equiv="content-security-policy" content="${csp}"></head><body>${body}</body></html>`;
  const own = sha('sha256', 'a{color:red}');
  const other = sha('sha256', 'b{color:blue}');
  const script = sha('sha256', 'go()');

  it('keeps only the hashes of inline styles and scripts the page itself carries', () => {
    const out = pruneCspHashes(
      doc(`script-src 'self' ${script} 'sha256-elsewhere='; style-src 'self' ${other} ${own}`, '<style>a{color:red}</style><script>go()</script>'),
    );
    expect(out).toContain(`script-src 'self' ${script}; style-src 'self' ${own}"`);
  });

  it('gives a page the same CSP whatever another page adds to the build', () => {
    const body = '<style>a{color:red}</style>';
    expect(pruneCspHashes(doc(`style-src 'self' ${own}`, body))).toBe(pruneCspHashes(doc(`style-src 'self' ${own} ${other}`, body)));
  });

  it('ignores external scripts and JSON data blocks', () => {
    const json = sha('sha256', '{"a":1}');
    const out = pruneCspHashes(doc(`script-src 'self' ${json}`, '<script src="/x.js"></script><script type="application/ld+json">{"a":1}</script>'));
    expect(out).toContain(`content="script-src 'self'"`);
  });

  it('matches sha384 and sha512 sources by their own algorithm', () => {
    const out = pruneCspHashes(doc(`style-src ${sha('sha384', 'a{color:red}')} ${sha('sha512', 'zzz')}`, '<style>a{color:red}</style>'));
    expect(out).toContain(`style-src ${sha('sha384', 'a{color:red}')}"`);
  });

  it('leaves other directives and html without a CSP meta alone', () => {
    const html = "<html><head><meta name=\"x\" content=\"style-src 'sha256-a'\"></head></html>";
    expect(pruneCspHashes(html)).toBe(html);
    expect(pruneCspHashes(doc(`img-src 'self' ${other}`, ''))).toContain(`img-src 'self' ${other}`);
  });
});
