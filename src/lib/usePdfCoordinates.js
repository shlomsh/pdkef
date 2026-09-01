import {
  clientDeltaToPagePercent,
  clientPointToPagePercent,
  pxToPercent,
  pxToPoints,
  scaleFactorFromPx,
  widthPercentToHeightPercent
} from '../editor/geometry/coords.js';
import { getPointerCoords } from '../editor/gestures/pointer.ts';

export default function usePdfCoordinates() {
  const getPointerPercent = (event, containerNode, pageGeometry) => {
    if (!containerNode) return { x: 0, y: 0 };
    const rect = containerNode.getBoundingClientRect();
    const { x: clientX, y: clientY } = getPointerCoords(event);
    return clientPointToPagePercent(
      { x: clientX, y: clientY },
      { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      pageGeometry,
    );
  };

  const getDeltaPercent = (dx, dy, containerNode, pageGeometry) => {
    if (!containerNode) return { x: 0, y: 0 };
    const rect = containerNode.getBoundingClientRect();
    return clientDeltaToPagePercent(
      { x: dx, y: dy },
      { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      pageGeometry,
    );
  };

  const getElementPercentSize = (elementNode, containerNode) => {
    if (!elementNode || !containerNode) return { width: 0, height: 0 };
    const elemRect = elementNode.getBoundingClientRect();
    const containerRect = containerNode.getBoundingClientRect();
    return {
      width: pxToPercent(elemRect.width, containerRect.width),
      height: pxToPercent(elemRect.height, containerRect.height)
    };
  };

  const getWidthPercentToHeightPercent = (widthPercent, aspectRatio, containerNode) => {
    if (!containerNode) return 0;
    const rect = containerNode.getBoundingClientRect();
    return widthPercentToHeightPercent(widthPercent, aspectRatio, rect.width, rect.height);
  };

  const getScaleFactor = (containerNode, pageWidthPoints) => {
    if (!containerNode) return 1;
    return scaleFactorFromPx(containerNode.getBoundingClientRect().width, pageWidthPoints);
  };

  const getWidthPercent = (px, containerNode) => {
    if (!containerNode) return 0;
    return pxToPercent(px, containerNode.getBoundingClientRect().width);
  };

  const getDimensions = (node) => {
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
    pxToPoints
  };
}
