import { PDFDocument } from '@cantoo/pdf-lib';
import { applyRotation, embedPageNumberFont, stampPageNumber } from './pageOps.js';
import { mergedFileName, mergedTitle } from './mergePlan.ts';

export { mergedFileName, mergedTitle };

// Thrown by inspectPdf()/mergePdfs() for a source file that can't take part
// in the merge, instead of a bare Error - the island needs fileIndex to
// point at the offending file in its list, and reason to choose between
// "ask for the password" (encrypted) and "this isn't a valid PDF"
// (unreadable) messaging. `cause` carries the original pdf-lib error for
// diagnostics/telemetry; it is never shown to the user (see CLAUDE.md - no
// file bytes or file-derived content leave the device, and stack traces can
// quote file content).
export class MergeFileError extends Error {
  constructor(message, { fileIndex, reason, cause } = {}) {
    super(message);
    this.name = 'MergeFileError';
    this.fileIndex = fileIndex;
    this.reason = reason;
    this.cause = cause;
  }
}

// Loads a PDF exactly once and reports what merge planning needs to know
// about it. Deliberately the only place that calls PDFDocument.load() for a
// given file outside of the actual copy step in mergePdfs() - MERGE-04 found
// that inspecting a file (for its page count and thumbnails) and then
// merging it used to each load it separately, which is both wasted work and
// two different places that could disagree about whether a file is
// encrypted.
//
// `{ ignoreEncryption: true }` is required for this to resolve at all for an
// encrypted file: without it pdf-lib throws on load rather than letting us
// read doc.isEncrypted and pageCount. Loading with ignoreEncryption does not
// decrypt page content, so an encrypted file's page count/creation date read
// back here are only ever the metadata pdf-lib can see without the
// password - which is all the merge UI needs to show a file card and route
// the user to "this file is password protected", not to actually copy its
// pages.
export async function inspectPdf(file, fileIndex = 0) {
  let bytes;
  try {
    bytes = await file.arrayBuffer();
  } catch (cause) {
    throw new MergeFileError(`Could not read file at index ${fileIndex}`, {
      fileIndex,
      reason: 'unreadable',
      cause,
    });
  }

  let doc;
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  } catch (cause) {
    throw new MergeFileError(`Could not parse PDF at index ${fileIndex}`, {
      fileIndex,
      reason: 'unreadable',
      cause,
    });
  }

  const date = doc.getCreationDate();
  const creationDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : null;

  return {
    pageCount: doc.getPageCount(),
    encrypted: doc.isEncrypted,
    creationDate,
  };
}

// Reads the PDF's internal /CreationDate, if present and parseable. Used as
// a secondary sort signal (see sort.js); never required. Kept as a thin
// wrapper over inspectPdf() so the one "how do we read a creation date"
// rule lives in one place, but this entry point's contract (resolve to
// null, never reject) predates MergeFileError and several callers still
// depend on it never throwing.
export async function resolvePdfCreationDate(file) {
  try {
    const { creationDate } = await inspectPdf(file);
    return creationDate;
  } catch {
    return null;
  }
}

async function yieldToEventLoop() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function checkAborted(signal) {
  if (signal?.aborted) {
    throw new DOMException('Merge aborted', 'AbortError');
  }
}

// Merges PDF files into a single PDF Blob, following `plan` (or, without
// one, every page of every file in file order) - see mergePlan.ts for the
// PlanEntry shape the island builds this from via toMergeMap().
// Runs entirely in-memory in the browser - no network I/O.
export async function mergePdfs(files, options = {}, onProgress, signal) {
  if (typeof options === 'function') {
    // Back-compat shape: mergePdfs(files, onProgress[, signal]).
    signal = onProgress;
    onProgress = options;
    options = {};
  }

  const { addPageNumbers = false, title } = options;
  const hasExplicitPlan = Array.isArray(options.plan);

  checkAborted(signal);

  const merged = await PDFDocument.create();

  let font = null;
  if (addPageNumbers) {
    font = await embedPageNumberFont(merged);
  }

  // Output pages are numbered 1..N in final plan order, regardless of which
  // file or pass added them (see both addPage sites below).
  let outputPageNumberCounter = 0;

  // For an explicit plan, loading happens in file order (below) but the
  // final page order must follow the PLAN's order, which can interleave
  // files (MERGE-09's cross-file drag). So this is two passes: load each
  // referenced file once and copyPages() its kept (non-skipped) pages in
  // one batch per file, recording that batch; then walk the plan itself in
  // its own order to addPage() - see the per-file cursor below, which
  // consumes each file's batch in the same order copyPages() produced it.
  //
  // Grouped up front so a fileIndex absent from this map (no key at all, as
  // opposed to an empty array) means the plan never mentions that file, so
  // it is skipped entirely below without ever being loaded - distinct from
  // a file every one of whose entries is skipped, which still gets a (now
  // empty) bucket and so is still loaded, still checked for encryption, but
  // copies nothing.
  const keptEntriesByFileIndex = new Map();
  const referencedFileIndices = new Set();
  if (hasExplicitPlan) {
    for (const entry of options.plan) {
      referencedFileIndices.add(entry.fileIndex);
      if (entry.skipped) continue;
      const bucket = keptEntriesByFileIndex.get(entry.fileIndex);
      if (bucket) bucket.push(entry);
      else keptEntriesByFileIndex.set(entry.fileIndex, [entry]);
    }
  }

  // fileIndex -> array of copied PDFPage objects, in the same order as that
  // file's bucket in keptEntriesByFileIndex (so the addPage phase's cursor
  // can walk both in lockstep).
  const copiedPagesByFileIndex = new Map();

  // Always walk every position in `files`, in order, so
  // onProgress((filesDone)/(files.length)) fires once per file exactly as
  // it always has - a file the plan drops entirely still occupies a slot
  // in that count, it is just never loaded.
  for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
    await yieldToEventLoop();
    checkAborted(signal);

    if (hasExplicitPlan && !referencedFileIndices.has(fileIndex)) {
      onProgress?.((fileIndex + 1) / files.length);
      continue;
    }

    const file = files[fileIndex];
    let source;
    try {
      const bytes = await file.arrayBuffer();
      source = await PDFDocument.load(bytes, { ignoreEncryption: true });
    } catch (cause) {
      throw new MergeFileError(`Could not read file at index ${fileIndex}`, {
        fileIndex,
        reason: 'unreadable',
        cause,
      });
    }

    // Checked before copyPages(): that call is where an encrypted file
    // blows up today (see MERGE-04), so we surface a precise "this file is
    // encrypted" error here rather than let pdf-lib throw a generic parse
    // error from inside copyPages.
    if (source.isEncrypted) {
      throw new MergeFileError(`File at index ${fileIndex} is password protected`, {
        fileIndex,
        reason: 'encrypted',
      });
    }

    if (hasExplicitPlan) {
      const keptEntries = keptEntriesByFileIndex.get(fileIndex) ?? [];
      const copiedPages =
        keptEntries.length > 0
          ? await merged.copyPages(
              source,
              keptEntries.map((entry) => entry.pageIndex),
            )
          : [];
      copiedPagesByFileIndex.set(fileIndex, copiedPages);
    } else {
      // No explicit plan: every page of every file, in file order - which
      // is exactly the order this loop already visits files and pages in,
      // so pages can be added directly here without a second pass.
      const pageIndices = source.getPageIndices();
      const copiedPages = pageIndices.length > 0 ? await merged.copyPages(source, pageIndices) : [];
      for (const copiedPage of copiedPages) {
        const addedPage = merged.addPage(copiedPage);
        if (addPageNumbers) {
          outputPageNumberCounter += 1;
          stampPageNumber(addedPage, `${outputPageNumberCounter}`, font);
        }
      }
    }

    onProgress?.((fileIndex + 1) / files.length);
  }

  if (hasExplicitPlan) {
    checkAborted(signal);
    // Second pass: add pages in the plan's own order, consuming each file's
    // copied-page batch with a per-file cursor (plan order can interleave
    // files, but within one file it always matches copyPages()'s order).
    const cursorByFileIndex = new Map();
    for (const entry of options.plan) {
      if (entry.skipped) continue;
      const cursor = cursorByFileIndex.get(entry.fileIndex) ?? 0;
      const copiedPages = copiedPagesByFileIndex.get(entry.fileIndex);
      const copiedPage = copiedPages[cursor];
      cursorByFileIndex.set(entry.fileIndex, cursor + 1);

      const addedPage = merged.addPage(copiedPage);
      applyRotation(addedPage, entry.rotation);

      if (addPageNumbers) {
        outputPageNumberCounter += 1;
        stampPageNumber(addedPage, `${outputPageNumberCounter}`, font);
      }
    }
  }

  checkAborted(signal);

  if (typeof title === 'string' && title.length > 0) {
    merged.setTitle(title);
  }

  const mergedBytes = await merged.save();
  return new Blob([mergedBytes], { type: 'application/pdf' });
}
