/**
 * What to hand `reportError` for an error Merge caught. `MergeFileError` wraps the
 * library's own error as `cause`, and the wrapper's frames are merge.js's, which says
 * nothing about what pdf-lib or pdf.js tripped on, so the cause travels instead. A
 * password-protected file is the unlock gate's job and is never reported. Duck-typed on
 * the name so this stays a leaf the component can import without merge.js.
 */
export function reportableCause(error: unknown): unknown {
  if (!(error instanceof Error) || error.name !== 'MergeFileError') return error;
  const { reason, cause } = error as Error & { reason?: string; cause?: unknown };
  if (reason === 'encrypted') return null;
  return cause ?? error;
}
