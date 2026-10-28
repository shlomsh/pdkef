import { sortByDate, sortByName } from '../text/sort.js';
import { outputBase } from '../output/outputName.ts';

// Pure helpers over the ordered list of image entries ({ id, file, ... }).

/** The state key a build is cached under: the ids in page order. */
export function orderKey(entries) {
  return entries.map((entry) => entry.id).join(',');
}

export function reorderEntries(entries, from, to) {
  const next = [...entries];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Move one entry by `delta` places; returns the same array when it cannot move. */
export function moveEntry(entries, id, delta) {
  const index = entries.findIndex((entry) => entry.id === id);
  const target = index + delta;
  if (index === -1 || target < 0 || target >= entries.length) return entries;
  return reorderEntries(entries, index, target);
}

const SORTS = {
  nameAsc: (entries) => sortByName(entries, 'asc'),
  nameDesc: (entries) => sortByName(entries, 'desc'),
  dateAsc: (entries) => sortByDate(entries, 'asc'),
  dateDesc: (entries) => sortByDate(entries, 'desc'),
};

/** 'custom' (or anything unknown) leaves the order as the person made it. */
export function sortEntries(entries, mode) {
  return SORTS[mode] ? SORTS[mode](entries) : entries;
}

/** The PDF's default name, without the extension: the first image's name. */
export function defaultOutputName(entries) {
  if (entries.length === 0) return 'images';
  return outputBase(entries[0].file.name, { strip: 'extension-or-bare-dot', sanitize: true, fallback: 'images' });
}
