/**
 * The name the bundled practice document is handed off under.
 *
 * Its own module rather than an export from either component that needs it:
 * FileDropzone renders ResumeDraftCard, so exporting it from FileDropzone and
 * importing it back into ResumeDraftCard closed an import cycle. That happens
 * to work here - the value is only read during render, by which point both
 * modules have finished evaluating - but a cycle whose safety depends on when
 * a binding is read is not worth keeping for one string.
 *
 * Shared so the homepage starter card, editor handoff, and end-to-end flow all
 * use the same visible filename.
 */
export const SAMPLE_FILE_NAME = 'PDkef practice form.pdf';

/** Static first-page thumbnail for the empty recent-documents slot. The real
 * draft preview is rendered lazily only after a file has been opened, so the
 * bundled sample needs this build-time counterpart to look like the document
 * it offers before any IndexedDB record exists. */
export const SAMPLE_PREVIEW_SRC = '/images/redaction-guide/sample-preview.jpg';
