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
 * Shared because ResumeDraftCard labels a resumed draft "Bundled sample" by
 * matching this exact name. It was spelled out in both files before, so
 * renaming the sample in one silently dropped the label in the other.
 */
export const SAMPLE_FILE_NAME = 'PDkef practice form.pdf';
