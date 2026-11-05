import { useRef } from 'preact/hooks';
import { useOutputNameOverride } from '#shell/useOutputNameOverride.ts';
import { useSaveToDrive } from '#shell/pageWorkspace/useSaveToDrive.ts';
import { usePdfShare } from '#lib/output/usePdfShare.js';
import { useDownloadDone } from '../components/DownloadDone.tsx';

/** What Download saves as (`highlighted_<name>` until the person types their own in the identity row), what the last download said, and how a finished file is handed over: saved to the device, or to Google Drive. */
export function useHighlightOutput(file: File | null, revision: number) {
  const { parts, identityRename } = useOutputNameOverride(file, { prefix: 'highlighted_' });
  const share = usePdfShare();
  const saved = useDownloadDone(file, revision);
  const lastBlob = useRef<Blob | null>(null);
  // The record keeps the blob `save` was just given, so the strip and Drive describe the same file.
  const done = { ...saved, record: (name: string, atFile: unknown, atRevision: number) => saved.record(name, atFile, atRevision, lastBlob.current) };
  const drive = useSaveToDrive({ tool: 'highlight-pdf', blob: saved.blob, parts: null, fileName: saved.name ?? '', generation: saved.blob, ready: !!saved.blob });
  return { parts, identityRename, done, drive, save: (blob: Blob, name: string) => { lastBlob.current = blob; share.download(blob, name); } };
}
