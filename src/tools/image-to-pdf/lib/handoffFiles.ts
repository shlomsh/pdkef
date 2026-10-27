export interface HandoffFile {
  fileName: string;
  fileType: string;
  fileBytes: ArrayBuffer;
}

/** The photographed pages in page order, as the multi-file hand-off payload Scan to PDF reads. */
export function toHandoffFiles(files: File[]): Promise<HandoffFile[]> {
  return Promise.all(
    files.map(async (file) => ({ fileName: file.name, fileType: file.type, fileBytes: await file.arrayBuffer() })),
  );
}
