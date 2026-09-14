// MERGE-10: the two ways files arrive that a plain `dataTransfer.files` read
// misses. A dropped folder shows up as one directory entry with no files;
// walking it through the (WebKit-prefixed, universally shipped) entries API
// yields its PDFs, sorted with the same numeric collator sort.js uses so
// "page 2.pdf" lands before "page 10.pdf" the way a file manager lists them.
// Paste (Cmd/Ctrl+V with files on the clipboard) is `clipboardData.files`.
// Neither reads a byte: they only turn platform handles into File objects.

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function sortFilesByName(files) {
  return [...files].sort((a, b) => collator.compare(a.name, b.name));
}

function readEntries(reader) {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

function fileFromEntry(entry) {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function walkEntry(entry, out) {
  if (entry.isFile) {
    out.push(await fileFromEntry(entry));
    return;
  }
  if (!entry.isDirectory) return;
  const reader = entry.createReader();
  // readEntries returns batches (Chrome caps a batch at 100) until an empty one.
  for (;;) {
    const batch = await readEntries(reader);
    if (batch.length === 0) break;
    for (const child of batch) await walkEntry(child, out);
  }
}

function entriesOf(dataTransfer) {
  return Array.from(dataTransfer?.items || [])
    .map((item) => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null))
    .filter(Boolean);
}

/** True when at least one dropped item is a folder. Callers keep the plain
 * synchronous `dataTransfer.files` path otherwise: a synchronous drop is what
 * lets Merge read its insertion index before the drag state is cleared. */
export function dropHasDirectory(dataTransfer) {
  return entriesOf(dataTransfer).some((entry) => entry.isDirectory);
}

/**
 * Every file in a drop, folders included. Falls back to `dataTransfer.files`
 * where the entries API is missing or the drop holds no directory, so the
 * plain-files path is byte-for-byte what it was.
 *
 * @param {DataTransfer | null | undefined} dataTransfer
 * @returns {Promise<File[]>}
 */
export async function filesFromDataTransfer(dataTransfer) {
  if (!dataTransfer) return [];
  const entries = entriesOf(dataTransfer);
  if (!entries.some((entry) => entry.isDirectory)) return Array.from(dataTransfer.files || []);
  const out = [];
  const loose = [];
  for (const entry of entries) {
    if (entry.isDirectory) {
      const inside = [];
      await walkEntry(entry, inside);
      out.push(...sortFilesByName(inside));
    } else {
      await walkEntry(entry, loose);
    }
  }
  return [...loose, ...out];
}

/**
 * Files on the clipboard for a paste event, or an empty array.
 * @param {ClipboardEvent} event
 * @returns {File[]}
 */
export function filesFromPaste(event) {
  return Array.from(event.clipboardData?.files || []);
}
