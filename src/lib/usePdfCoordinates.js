import {
  pxToPercent,
  pxDeltaToPercent,
  pxToPoints,
  scaleFactorFromPx,
  widthPercentToHeightPercent
} from './coords.js';

export default function usePdfCoordinates() {
  const getPointerCoords = (event) => {
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;
    return { x: clientX, y: clientY };
  };

  const getPointerPercent = (event, containerNode) => {
    if (!containerNode) return { x: 0, y: 0 };
    const rect = containerNode.getBoundingClientRect();
    const { x: clientX, y: clientY } = getPointerCoords(event);
    return {
      x: pxToPercent(clientX - rect.left, rect.width),
      y: pxToPercent(clientY - rect.top, rect.height)
    };
  };

  const getDeltaPercent = (dx, dy, containerNode) => {
    if (!containerNode) return { x: 0, y: 0 };
    const rect = containerNode.getBoundingClientRect();
    return {
      x: pxDeltaToPercent(dx, rect.width),
      y: pxDeltaToPercent(dy, rect.height)
    };
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
