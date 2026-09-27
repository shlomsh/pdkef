// Prints the lines an extractor reads differently on the original and on the
// saved page:  node spikes/red-12/diff-lines.mjs <pdfium|pdfkit> <orig.pdf> <out.pdf> [n]
import { execFileSync } from 'node:child_process';
const [engine, a, b, n = '12'] = process.argv.slice(2);
const read = (f) => {
  const out = engine === 'pdfium'
    ? execFileSync('node', ['spikes/red-01/pdfium/extract-pdfium.mjs', f], { maxBuffer: 1 << 28 })
    : execFileSync('swift', ['spikes/red-12/extract-pdfkit.swift', f], { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out.toString()).pages[0].text.replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
};
const A = read(a), B = read(b);
const setB = new Set(B), setA = new Set(A);
const onlyA = A.filter((l) => !setB.has(l)), onlyB = B.filter((l) => !setA.has(l));
console.log(`${A.length} vs ${B.length} lines; ${onlyA.length} only in original, ${onlyB.length} only in output`);
for (let i = 0; i < +n; i++) console.log(`  O: ${onlyA[i] ?? ''}\n  N: ${onlyB[i] ?? ''}`);
