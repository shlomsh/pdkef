// Shared by Split and PDF to Image (DEBT-23): the two tools had drifted into
// separate copies of this parser, one accepting open ranges and bound-checking
// pages, the other neither. This is the one implementation both import.

// Thrown for every invalid or out-of-range selector, so a caller can
// distinguish "the person's input needs fixing" from any other failure
// (a corrupt file, a render error) without matching on message text.
export class PageSelectorError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PageSelectorError';
  }
}

// Parses a printer-style page range string (e.g. "1-3, 5, 8-") into a sorted,
// deduped array of 1-indexed page numbers clamped to [1, pageCount].
// Supports:
// - Single page: "5"
// - Closed range: "1-3" (or "3-1", auto-normalized)
// - Open-ended start range: "-4" (means 1 to 4)
// - Open-ended end range: "8-" (means 8 to pageCount)
// Throws a PageSelectorError on invalid input format or out-of-range selection.
export function parsePageSelector(selector, pageCount) {
  const trimmed = (selector ?? '').trim();
  if (!trimmed) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }

  const pages = new Set();
  for (const rawPart of trimmed.split(',')) {
    const part = rawPart.trim();
    if (!part) continue;

    // Open-ended end range: "8-" -> 8 to pageCount
    const openEndMatch = part.match(/^(\d+)\s*-\s*$/);
    if (openEndMatch) {
      const start = Number(openEndMatch[1]);
      if (start < 1 || start > pageCount) {
        throw new PageSelectorError(`Page number ${start} out of range (1-${pageCount})`);
      }
      for (let n = start; n <= pageCount; n += 1) {
        pages.add(n);
      }
      continue;
    }

    // Open-ended start range: "-4" -> 1 to 4
    const openStartMatch = part.match(/^-\s*(\d+)$/);
    if (openStartMatch) {
      const end = Number(openStartMatch[1]);
      if (end < 1 || end > pageCount) {
        throw new PageSelectorError(`Page number ${end} out of range (1-${pageCount})`);
      }
      for (let n = 1; n <= end; n += 1) {
        pages.add(n);
      }
      continue;
    }

    // Closed range: "1-3"
    const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      let start = Number(rangeMatch[1]);
      let end = Number(rangeMatch[2]);
      if (start < 1 || start > pageCount || end < 1 || end > pageCount) {
        throw new PageSelectorError(
          `Range ${start}-${end} contains out of range page numbers (1-${pageCount})`,
        );
      }
      if (start > end) [start, end] = [end, start];
      for (let n = start; n <= end; n += 1) {
        pages.add(n);
      }
      continue;
    }

    // Single page
    if (/^\d+$/.test(part)) {
      const num = Number(part);
      if (num < 1 || num > pageCount) {
        throw new PageSelectorError(`Page number ${num} out of range (1-${pageCount})`);
      }
      pages.add(num);
      continue;
    }

    throw new PageSelectorError(`Invalid page range or number: "${part}"`);
  }

  const inRange = [...pages].filter((n) => n >= 1 && n <= pageCount);
  if (inRange.length === 0) {
    throw new PageSelectorError('No valid pages selected');
  }
  return inRange.sort((a, b) => a - b);
}
