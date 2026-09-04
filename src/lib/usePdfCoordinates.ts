import {
  clientDeltaToPagePercent,
  clientPointToPagePercent,
  pxToPercent,
  pxToPoints,
  scaleFactorFromPx,
  widthPercentToHeightPercent,
} from '../editor/geometry/coords.js';
import type { PageGeometry } from '../editor/geometry/coords.ts';
import { getPointerCoords } from '../editor/gestures/pointer.ts';
import type { GestureEvent } from '../editor/gestures/controller.ts';

type MeasurableElement = Pick<Element, 'getBoundingClientRect'>;

/** Typed coordinate adapters shared by placement, move, and resize gestures. */
export interface PdfCoordinateTools {
  getPointerCoords: typeof getPointerCoords;
  getPointerPercent: (
    event: GestureEvent,
    containerNode: MeasurableElement | null | undefined,
    pageGeometry?: PageGeometry,
  ) => { x: number; y: number };
  getDeltaPercent: (
    dx: number,
    dy: number,
    containerNode: MeasurableElement | null | undefined,
    pageGeometry?: PageGeometry,
  ) => { x: number; y: number };
  getElementPercentSize: (
    elementNode: MeasurableElement | null | undefined,
    containerNode: MeasurableElement | null | undefined,
  ) => { width: number; height: number };
  getWidthPercentToHeightPercent: (
    widthPercent: number,
    aspectRatio: number,
    containerNode: MeasurableElement | null | undefined,
  ) => number;
  getScaleFactor: (
    containerNode: MeasurableElement | null | undefined,
    pageWidthPoints: number,
  ) => number;
  getWidthPercent: (
    pixels: number,
    containerNode: MeasurableElement | null | undefined,
  ) => number;
  getDimensions: (
    node: MeasurableElement | null | undefined,
  ) => { width: number; height: number };
  pxToPoints: typeof pxToPoints;
}

export default function usePdfCoordinates(): PdfCoordinateTools {
  const getPointerPercent: PdfCoordinateTools['getPointerPercent'] = (event, containerNode, pageGeometry) => {
    if (!containerNode) return { x: 0, y: 0 };
    const rect = containerNode.getBoundingClientRect();
    const { x: clientX, y: clientY } = getPointerCoords(event);
    return clientPointToPagePercent(
      { x: clientX, y: clientY },
      { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      pageGeometry,
    );
  };

  const getDeltaPercent: PdfCoordinateTools['getDeltaPercent'] = (dx, dy, containerNode, pageGeometry) => {
    if (!containerNode) return { x: 0, y: 0 };
    const rect = containerNode.getBoundingClientRect();
    return clientDeltaToPagePercent(
      { x: dx, y: dy },
      { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      pageGeometry,
    );
  };

  const getElementPercentSize: PdfCoordinateTools['getElementPercentSize'] = (elementNode, containerNode) => {
    if (!elementNode || !containerNode) return { width: 0, height: 0 };
    const elemRect = elementNode.getBoundingClientRect();
    const containerRect = containerNode.getBoundingClientRect();
    return {
      width: pxToPercent(elemRect.width, containerRect.width),
      height: pxToPercent(elemRect.height, containerRect.height),
    };
  };

  const getWidthPercentToHeightPercent: PdfCoordinateTools['getWidthPercentToHeightPercent'] = (
    widthPercent,
    aspectRatio,
    containerNode,
  ) => {
    if (!containerNode) return 0;
    const rect = containerNode.getBoundingClientRect();
    return widthPercentToHeightPercent(widthPercent, aspectRatio, rect.width, rect.height);
  };

  const getScaleFactor: PdfCoordinateTools['getScaleFactor'] = (containerNode, pageWidthPoints) => {
    if (!containerNode) return 1;
    return scaleFactorFromPx(containerNode.getBoundingClientRect().width, pageWidthPoints);
  };

  const getWidthPercent: PdfCoordinateTools['getWidthPercent'] = (pixels, containerNode) => {
    if (!containerNode) return 0;
    return pxToPercent(pixels, containerNode.getBoundingClientRect().width);
  };

  const getDimensions: PdfCoordinateTools['getDimensions'] = (node) => {
    if (!node) return { width: 0, height: 0 };
    const rect = node.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  };

  return {
    getPointerCoords,
    getPointerPercent,
    getDeltaPercent,
    getElementPercentSize,
    getWidthPercentToHeightPercent,
    getScaleFactor,
    getWidthPercent,
    getDimensions,
    pxToPoints,
  };
}
