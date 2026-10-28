import type { SignatureElement } from '#editor/model/editorModel.ts';
import { widthPercentToHeightPercent } from '#editor/geometry/coords.ts';

/** The page wrapper's size in CSS pixels when it is not on screen to measure. */
const FALLBACK_WRAPPER_SIZE = { width: 600, height: 800 };

interface PlacedSignatureInput {
  id: string;
  dataUrl: string;
  aspectRatio: number;
  pageIndex: number;
  /** Where the signature's centre goes, in percent of the page. */
  leftPercent: number;
  topPercent: number;
  /** Width in percent of the page. */
  widthPercent: number;
  /** The page wrapper's measured size, if it is mounted. */
  wrapperSize?: { width: number; height: number };
}

/** A signature element centred on a point, its height derived from the image's aspect ratio. */
export function buildPlacedSignature(input: PlacedSignatureInput): SignatureElement {
  const { id, dataUrl, aspectRatio, pageIndex, leftPercent, topPercent, widthPercent } = input;
  const { width, height } = input.wrapperSize ?? FALLBACK_WRAPPER_SIZE;
  const heightPercent = widthPercentToHeightPercent(widthPercent, aspectRatio, width, height);

  return {
    id,
    type: 'signature',
    pageIndex,
    left: leftPercent - (widthPercent / 2),
    top: topPercent - (heightPercent / 2),
    width: widthPercent,
    height: heightPercent,
    aspectRatio,
    dataUrl,
  };
}
