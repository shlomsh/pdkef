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

// Metadata line for the loaded-state file bar, e.g. "3 pages · 1.4 MB".
export function describeFile(file, pageCount) {
  if (!file) return undefined;
  return [
    pageCount && `${pageCount} page${pageCount === 1 ? '' : 's'}`,
    formatFileSize(file.size),
  ]
    .filter(Boolean)
    .join(' · ');
}
