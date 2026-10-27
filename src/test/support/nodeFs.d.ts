// The unit tests read a few repo files (a stylesheet, a fixture PDF) with `node:fs`; the
// project carries no @types/node, so this declares the one function they use.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function readFileSync(path: string): Uint8Array;
}
