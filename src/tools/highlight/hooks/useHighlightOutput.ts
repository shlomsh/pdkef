import { useOutputNameOverride } from '#shell/useOutputNameOverride.ts';
import { useSaveToDrive } from '#shell/pageWorkspace/useSaveToDrive.ts';
import { usePdfShare } from '#lib/output/usePdfShare.js';
import { useDownloadDone } from '../components/DownloadDone.tsx';
import { buildHandler, downloadHandler, shareHandler, type BuildInput } from '../lib/export/download.ts';
import { useHighlightShare } from './useHighlightShare.ts';

/** What Download saves as (`highlighted_<name>` until the person types their own in the identity row), what the last download said, and the three ways a finished file leaves: Download, Share and Save to Google Drive. */
export function useHighlightOutput(file: File | null, revision: number, source: Omit<BuildInput, 'outputName'>, setAnnouncement: (message: string) => void) {
  const { parts, identityRename } = useOutputNameOverride(file, { prefix: 'highlighted_' });
  const share = usePdfShare();
  const done = useDownloadDone(file, revision);
  const input = { ...source, outputName: file ? parts.fileName : undefined };
  const shareProps = useHighlightShare({
    share,
    prepareFile: shareHandler({ ...input, prepare: share.prepare }),
    resetKey: `${file?.name}|${file?.size}|${file?.lastModified}|${revision}|${parts.fileName}`,
    setAnnouncement,
  });
  const drive = useSaveToDrive({ tool: 'highlight-pdf', build: buildHandler(input), generation: revision, ready: !!file });
  return { parts, identityRename, done, download: downloadHandler({ ...input, save: share.download }), shareProps, drive };
}
