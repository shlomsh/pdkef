const UNITS = ['KB', 'MB', 'GB'];

export function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;

  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value < 10 ? 1 : 0)} ${UNITS[unitIndex]}`;
}

// Metadata line for the loaded-state file bar, e.g. "3 pages · 1.4 MB". When
// `currentPage` is given (the fullscreen page indicator - see
// useCurrentPage.js - is only tracked there, since it needs a scrollable
// workspace to observe), the page clause becomes "Page 2 of 3" instead: the
// live position is more useful than the static count once you can't see the
// browser's own scrollbar for orientation.
export function describeFile(file, pageCount, currentPage) {
  if (!file) return undefined;
  const pageLabel = pageCount
    ? (currentPage && pageCount > 1 ? `Page ${currentPage} of ${pageCount}` : `${pageCount} page${pageCount === 1 ? '' : 's'}`)
    : undefined;
  return [pageLabel, formatFileSize(file.size)]
    .filter(Boolean)
    .join(' · ');
}
