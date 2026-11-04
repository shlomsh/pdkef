import { useOutputNameOverride } from '#shell/useOutputNameOverride.ts';
import { usePdfShare } from '#lib/output/usePdfShare.js';
import { useDownloadDone } from '../components/DownloadDone.tsx';

/** What Download saves as (`highlighted_<name>` until the person types their own in the identity row) and what the last download said, and how a finished file is handed over. */
export function useHighlightOutput(file: File | null, revision: number) {
  const { parts, identityRename } = useOutputNameOverride(file, { prefix: 'highlighted_' });
  const share = usePdfShare();
  return { parts, identityRename, done: useDownloadDone(file, revision), save: (blob: Blob, name: string) => share.download(blob, name) };
}
