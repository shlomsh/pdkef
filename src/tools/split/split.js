import { PDFDocument } from '@cantoo/pdf-lib';

// Parses a printer-style page range string (e.g. "1-3, 5, 8-") into a sorted,
// deduped array of 1-indexed page numbers clamped to [1, pageCount].
// Supports:
// - Single page: "5"
// - Closed range: "1-3" (or "3-1", auto-normalized)
// - Open-ended start range: "-4" (means 1 to 4)
// - Open-ended end range: "8-" (means 8 to pageCount)
// Throws on invalid input format or out-of-range selection.
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
        throw new Error(`Page number ${start} out of range (1-${pageCount})`);
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
        throw new Error(`Page number ${end} out of range (1-${pageCount})`);
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
        throw new Error(`Range ${start}-${end} contains out of range page numbers (1-${pageCount})`);
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
        throw new Error(`Page number ${num} out of range (1-${pageCount})`);
      }
      pages.add(num);
      continue;
    }

    throw new Error(`Invalid page range or number: "${part}"`);
  }

  const inRange = [...pages].filter((n) => n >= 1 && n <= pageCount);
  if (inRange.length === 0) {
    throw new Error('No valid pages selected');
  }
  return inRange.sort((a, b) => a - b);
}

// Converts a list of page numbers (e.g. [1, 2, 3, 5, 7, 8]) into a minimal range string
// (e.g. "1-3, 5, 7-8").
export function pageNumbersToRangeString(numbers) {
  if (!numbers || numbers.length === 0) return '';
  const sorted = [...numbers].sort((a, b) => a - b);
  const ranges = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i <= sorted.length; i += 1) {
    const current = sorted[i];
    if (current === prev + 1) {
      prev = current;
    } else {
      if (start === prev) {
        ranges.push(`${start}`);
      } else {
        ranges.push(`${start}-${prev}`);
      }
      start = current;
      prev = current;
    }
  }
  return ranges.join(', ');
}

// Splits the input PDF file based on the selected page numbers and mode.
// mode: 'combined' | 'separate'
export async function splitPdf(file, { pageNumbers, mode = 'combined', onProgress }) {
  const bytes = await file.arrayBuffer();
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const baseName = file.name.replace(/\.pdf$/i, '') || 'split';

  if (mode === 'combined') {
    const merged = await PDFDocument.create();
    const indices = pageNumbers.map((n) => n - 1);
    
    const pages = await merged.copyPages(source, indices);
    for (let i = 0; i < pages.length; i += 1) {
      merged.addPage(pages[i]);
      onProgress?.((i + 1) / pages.length);
    }
    
    const mergedBytes = await merged.save();
    return [
      {
        blob: new Blob([mergedBytes], { type: 'application/pdf' }),
        filename: `${baseName}-extracted.pdf`,
      },
    ];
  } else {
    // mode === 'separate'
    const results = [];
    for (let i = 0; i < pageNumbers.length; i += 1) {
      const pageNum = pageNumbers[i];
      const singleDoc = await PDFDocument.create();
      const [copiedPage] = await singleDoc.copyPages(source, [pageNum - 1]);
      singleDoc.addPage(copiedPage);
      const docBytes = await singleDoc.save();
      results.push({
        blob: new Blob([docBytes], { type: 'application/pdf' }),
        filename: `${baseName}-page-${pageNum}.pdf`,
        pageNumber: pageNum,
      });
      onProgress?.((i + 1) / pageNumbers.length);
    }
    return results;
  }
}
