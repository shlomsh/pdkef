import type { CompressMessages } from '../messages';
import type { CompressMeta } from './compressCallbacks.ts';
import { compressedFileName as deriveDownloadName } from './outputName.ts';

interface FlattenOutcome {
  activeFile: File;
  blob: Blob;
  level: string;
  metTarget: boolean;
  rasterBytes: number | null;
  t: CompressMessages;
}

/** What a finished pages-to-pictures run hands the island beside its blob. */
export function flattenMeta({ activeFile, blob, level, metTarget, rasterBytes, t }: FlattenOutcome): CompressMeta {
  const resultType = blob.type || 'application/pdf';
  // compressPdfToTarget's passthrough rule returns the input File itself as `blob` when it was already
  // under target; compressPdf with a level never returns the input, it always re-encodes.
  const isPassthrough = blob === activeFile;
  // Under target is the only passthrough that is a success; every other one (a level, or a target the
  // input is still over) means the input was already as small as it gets.
  const isUnchanged = isPassthrough && (level !== 'target' || !metTarget);
  return {
    filename: deriveDownloadName(activeFile.name, resultType),
    outputType: resultType,
    metTarget,
    passthrough: isPassthrough,
    unchanged: isUnchanged,
    rasterBytes,
    imageReason: null,
    keptBytes: 0,
    resultImageBytes: 0,
    dimensions: null,
    announcement: isUnchanged ? t.alreadySmallComplete : t.complete,
  };
}
