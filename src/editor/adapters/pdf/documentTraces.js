/**
 * RED-59: what a PDF says about itself and holds hidden, read and stripped as
 * one list of trace kinds, so reading and stripping can never disagree. Pure
 * pdf-lib; no UI, no words. The words live in Redact's `check/describeTraces.ts`.
 *
 * Measured 2026-10-08 (backlog/tasks/RED-59.md, step 1 and the gate): a Delete
 * export kept attachments, scripts, page-level and object-level details and the
 * file ID; a flattened export stamped pdf-lib's name and the export time and
 * kept page-level details on untouched pages. Every export now runs
 * `stripDocumentTraces` right before its save.
 */
import { PDFDocument } from '@cantoo/pdf-lib';

/**
 * @typedef {object} PdfDate A date as the file recorded it, wall clock plus offset.
 * @property {string} iso The wall time as `YYYY-MM-DDTHH:mm:ss` (no zone), as the device's clock said.
 * @property {number | null} offsetMinutes The recorded offset from UTC, or null when the file gave none.
 */

/**
 * @typedef {object} DocumentTraces
 * @property {string | null} title
 * @property {string | null} author
 * @property {string | null} subject
 * @property {string | null} keywords
 * @property {string | null} creator
 * @property {string | null} producer
 * @property {PdfDate | null} creationDate
 * @property {PdfDate | null} modDate
 * @property {string[]} otherInfoKeys Any further Info entry's key name (a company, `SourceModified`), never its value.
 * @property {{ present: boolean, hasHistory: boolean } } xmp The catalog's XMP stream; `hasHistory` when it holds an `xmpMM:History`.
 * @property {Array<{ name: string, pageIndex?: number }>} attachments Files attached anywhere: the EmbeddedFiles name tree, catalog `/AF`, a FileAttachment comment (with its page).
 * @property {{ document: boolean, pages: number[] }} scripts Document scripts (`/Names /JavaScript`, an `/OpenAction` or catalog `/AA` script) and pages carrying `/AA` scripts.
 * @property {number[]} thumbnails Pages carrying a `/Thumb` picture of themselves. Sorted, zero-based.
 * @property {number[]} pageDetails Pages carrying `/Metadata` or `/PieceInfo`, on the page or on an image or form it draws. Sorted, zero-based.
 */

/**
 * Reads every trace kind from a loaded document. Never throws on a malformed
 * entry: a value that will not decode is left null.
 * @param {PDFDocument} doc
 * @returns {DocumentTraces}
 */
export function readDocumentTraces(doc) {
  throw new Error('not implemented');
}

/**
 * Removes every trace kind from the document and gives it a fresh random file
 * ID, leaving nothing of the original's details, attachments, scripts,
 * thumbnails or page-level details. Field-level scripts are left alone. The
 * caller runs `dropUnreachable` afterwards and saves with `updateMetadata: false`.
 * @param {PDFDocument} doc
 * @param {{ keepAttachments?: readonly string[], randomBytes?: (n: number) => Uint8Array }} [options]
 *   `keepAttachments` names attached files the person chose to keep (RED-59, by
 *   name); `randomBytes` is for tests, default `crypto.getRandomValues`.
 */
export function stripDocumentTraces(doc, options = {}) {
  throw new Error('not implemented');
}

/** True when nothing in `traces` is set: no detail, nothing attached or hidden. */
export function hasNoTraces(traces) {
  throw new Error('not implemented');
}
