import { describe, it, expect } from 'vitest';
import usePdfCoordinates from './usePdfCoordinates.js';

describe('usePdfCoordinates math hook helper functions', () => {
  const {
    getPointerCoords,
    getPointerPercent,
    getDeltaPercent,
    getElementPercentSize,
    getWidthPercentToHeightPercent,
    getScaleFactor,
    getWidthPercent,
    getDimensions
  } = usePdfCoordinates();

  describe('getPointerCoords', () => {
    it('returns client coordinates for mouse events', () => {
      const event = { clientX: 350, clientY: 120 };
      expect(getPointerCoords(event)).toEqual({ x: 350, y: 120 });
    });

    it('normalizes touch events using the first touch object', () => {
      const touchEvent = {
        touches: [
          { clientX: 420, clientY: 280 },
          { clientX: 999, clientY: 999 } // extra touch to ignore
        ]
      };
      expect(getPointerCoords(touchEvent)).toEqual({ x: 420, y: 280 });
    });
  });

  describe('getPointerPercent', () => {
    it('returns {x: 0, y: 0} if containerNode is not provided', () => {
      const event = { clientX: 500, clientY: 250 };
      expect(getPointerPercent(event, null)).toEqual({ x: 0, y: 0 });
    });

    it('correctly maps pointer coordinate into percentage space of the container', () => {
      const containerNode = {
        getBoundingClientRect: () => ({
          left: 100,
          top: 50,
          width: 800,
          height: 600
        })
      };

      // Pointer at center: x = 100 + 400 = 500, y = 50 + 300 = 350 -> should be 50%, 50%
      const event = { clientX: 500, clientY: 350 };
      expect(getPointerPercent(event, containerNode)).toEqual({ x: 50, y: 50 });

      // Pointer at 1/4 width, 3/4 height: x = 100 + 200 = 300, y = 50 + 450 = 500 -> should be 25%, 75%
      const event2 = { clientX: 300, clientY: 500 };
      expect(getPointerPercent(event2, containerNode)).toEqual({ x: 25, y: 75 });
    });
  });

  describe('getDeltaPercent', () => {
    it('returns {x: 0, y: 0} if containerNode is not provided', () => {
      expect(getDeltaPercent(50, 50, null)).toEqual({ x: 0, y: 0 });
    });

    it('converts pixel dragging dx/dy into percentage space of the container', () => {
      const containerNode = {
        getBoundingClientRect: () => ({
          width: 500,
          height: 400
        })
      };
      // dx = 50 (10% of 500), dy = 80 (20% of 400)
      expect(getDeltaPercent(50, 80, containerNode)).toEqual({ x: 10, y: 20 });
    });
  });

  describe('getElementPercentSize', () => {
    it('returns {width: 0, height: 0} if elements are missing', () => {
      expect(getElementPercentSize(null, null)).toEqual({ width: 0, height: 0 });
    });

    it('calculates the element size as a percentage of container size', () => {
      const elementNode = {
        getBoundingClientRect: () => ({ width: 150, height: 80 })
      };
      const containerNode = {
        getBoundingClientRect: () => ({ width: 600, height: 400 })
      };
      // width = 150/600 * 100 = 25%, height = 80/400 * 100 = 20%
      expect(getElementPercentSize(elementNode, containerNode)).toEqual({ width: 25, height: 20 });
    });
  });

  describe('getWidthPercentToHeightPercent', () => {
    it('returns 0 if container is missing', () => {
      expect(getWidthPercentToHeightPercent(10, 0.5, null)).toBe(0);
    });

    it('calculates height percent maintaining aspect ratio', () => {
      const containerNode = {
        getBoundingClientRect: () => ({ width: 500, height: 1000 })
      };
      // widthPercent = 10%, aspect ratio = 0.5, container width/height ratio = 0.5
      // heightPercent = 10 * 0.5 * 0.5 = 2.5%
      expect(getWidthPercentToHeightPercent(10, 0.5, containerNode)).toBe(2.5);
    });
  });

  describe('getScaleFactor', () => {
    it('returns 1 if container is missing', () => {
      expect(getScaleFactor(null, 600)).toBe(1);
    });

    it('calculates scale factor (container width / points width)', () => {
      const containerNode = {
        getBoundingClientRect: () => ({ width: 900 })
      };
      expect(getScaleFactor(containerNode, 600)).toBe(1.5);
    });
  });

  describe('getWidthPercent', () => {
    it('returns 0 if container is missing', () => {
      expect(getWidthPercent(50, null)).toBe(0);
    });

    it('converts px width to percentage width', () => {
      const containerNode = {
        getBoundingClientRect: () => ({ width: 400 })
      };
      expect(getWidthPercent(80, containerNode)).toBe(20);
    });
  });

  describe('getDimensions', () => {
    it('returns zero dimensions if node is missing', () => {
      expect(getDimensions(null)).toEqual({ width: 0, height: 0 });
    });

    it('returns node bounding client rect width and height', () => {
      const node = {
        getBoundingClientRect: () => ({ width: 120, height: 330 })
      };
      expect(getDimensions(node)).toEqual({ width: 120, height: 330 });
    });
  });
});
