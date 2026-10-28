// File chronology in a browser is bounded by the File API: only
// File.lastModified (modification time, not creation time) is available.
// We improve on that with two optional, better signals, in priority order:
//   1. A date encoded in the filename itself (e.g. "2024-03-01 invoice.pdf")
//   2. The PDF's internal /CreationDate metadata (often present, sometimes not)
//   3. File.lastModified - always available, the final fallback
const FILENAME_DATE_RE = /(\d{4})[-_.](\d{2})[-_.](\d{2})/;

function dateFromFilename(name) {
  const match = name.match(FILENAME_DATE_RE);
  if (!match) return null;
  const [, year, month, day] = match;
  const time = Date.UTC(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(time) ? null : time;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function sortByName(entries, direction = 'asc') {
  const sorted = [...entries].sort((a, b) => collator.compare(a.file.name, b.file.name));
  return direction === 'desc' ? sorted.reverse() : sorted;
}

// `entries` are { file, pdfCreationDate? } - pdfCreationDate is populated
// lazily (see resolvePdfCreationDate in merge.js) once a file has been
// inspected; until then we fall back to filename / lastModified.
export function sortByDate(entries, direction = 'asc') {
  const sorted = [...entries].sort((a, b) => {
    const dateA = dateFromFilename(a.file.name) ?? a.pdfCreationDate ?? a.file.lastModified;
    const dateB = dateFromFilename(b.file.name) ?? b.pdfCreationDate ?? b.file.lastModified;
    return dateA - dateB;
  });
  return direction === 'desc' ? sorted.reverse() : sorted;
}
