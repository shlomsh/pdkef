/** What the File Handling API's `launchQueue` consumer receives (not in TypeScript's DOM lib). */
export type LaunchParams = { files?: ReadonlyArray<{ getFile: () => Promise<File> }> };

const isPdf = (file: File) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

/**
 * The PDF an installed PDkef was launched with ("Open with" in a file manager), or null when the
 * launch carried none, the first file is not a PDF, or its handle can no longer be read.
 */
export async function pdfFromLaunch(params: LaunchParams): Promise<File | null> {
  const handle = params.files?.[0];
  if (!handle) return null;
  try {
    const file = await handle.getFile();
    return isPdf(file) ? file : null;
  } catch {
    // expected: the file was moved or revoked between the launch and this read
    return null;
  }
}
