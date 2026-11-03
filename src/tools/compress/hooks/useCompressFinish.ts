import type { PreparedOutput } from '#lib/output/usePreparedOutput.ts';
import { useDownloadFlow } from '#shell/pageWorkspace/useDownloadFlow.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import type { CompressMessages } from '../messages';
import { useImageBatch } from './useImageBatch.ts';

interface CompressFinishInput {
  t: CompressMessages;
  kind: 'pdf' | 'image' | null;
  /** The single file's build; a passthrough is the input itself, so there is nothing to deliver or share. */
  prepared: Pick<PreparedOutput, 'status' | 'blob' | 'url' | 'generation' | 'prepareNow'> & { passthrough: boolean };
  fileName: string;
  setAnnouncement: (message: string) => void;
}

/**
 * The one Download, Share and phone bar both halves of the tool deliver through: the single file's build,
 * or (COMP-04) a set of photos compressed one after another to one target, delivered as parts.
 */
export function useCompressFinish({ t, kind, prepared, fileName, setAnnouncement }: CompressFinishInput) {
  const batch = useImageBatch();
  const batchName = formatMessage(t.batchLabel, { count: batch.summary.total });
  const flow = useDownloadFlow({
    prepared: batch.active ? batch.prepared : { status: prepared.status, blob: prepared.passthrough ? null : prepared.blob, url: prepared.url, parts: null, generation: prepared.generation, prepareNow: prepared.prepareNow },
    fileName: batch.active ? batchName : fileName,
    blocked: (batch.active ? batch.prepared.status : prepared.status) === 'error' ? 'error' : null,
    announce: (message) => { if (message) setAnnouncement(message); },
    messages: {
      ready: t.readyAnnouncement,
      shared: batch.active ? t.batchSharedSuccessfully : kind === 'image' ? t.imageSharedSuccessfully : t.sharedSuccessfully,
      canceled: batch.active ? t.batchSharingCanceled : kind === 'image' ? t.imageSharingCanceled : t.sharingCanceled,
      shareError: t.shareError,
    },
  });
  return { flow, batch, batchName };
}
