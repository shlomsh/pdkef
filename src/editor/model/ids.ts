export function createElementId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `el-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// Sequential `el-N` scheme predating createElementId above - still what most
// of the editor's own creation paths use (see PdfSignTool.tsx/PdfRedactTool.tsx).
// Moved here from sign.js (TODO.md ARCH-01): it's pure ID bookkeeping with no
// PDF/font dependency, so a command-layer module (actionHistory.js) importing
// it should not have to pull in sign.js's fontkit/pdf-lib export graph to get
// it. Kept alongside, not merged into, createElementId - the two schemes are
// both live and unifying them is a separate decision from where the code lives.
let nextId = 0;
export function uniqueId() { return `el-${nextId++}`; }

export function seedUniqueId(elements?: Array<{ id?: string } | null> | null) {
  let max = -1;
  for (const el of elements || []) {
    const match = /^el-(\d+)$/.exec(el?.id || '');
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  if (max + 1 > nextId) nextId = max + 1;
}
