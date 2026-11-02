import { useOutputNameOverride } from '#shell/useOutputNameOverride.ts';
import { useDownloadDone } from '../components/DownloadDone.tsx';

/** What Download saves as (`highlighted_<name>` until the person types their own in the identity row) and what the last download said. */
export function useHighlightOutput(file: File | null, revision: number) {
  const { parts, identityRename } = useOutputNameOverride(file, { prefix: 'highlighted_' });
  return { parts, identityRename, done: useDownloadDone(file, revision) };
}
