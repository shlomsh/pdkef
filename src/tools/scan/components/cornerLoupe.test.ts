// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { clientPoint, showLoupe } from './cornerLoupe.ts';

const RECT = { left: 50, top: 20, width: 200, height: 100 } as DOMRect;

describe('cornerLoupe', () => {
  it('reads a mouse event and the first touch of a touch event the same way', () => {
    expect(clientPoint(new MouseEvent('mousemove', { clientX: 7, clientY: 9 }))).toEqual({ x: 7, y: 9 });
    const touch = { touches: [{ clientX: 3, clientY: 4 }] } as unknown as TouchEvent;
    expect(clientPoint(touch)).toEqual({ x: 3, y: 4 });
  });

  it('shows the magnifier at the point and draws both edges towards the neighbours', () => {
    const loupe = document.createElement('div');
    loupe.hidden = true;
    const a = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    const b = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    showLoupe(loupe, [a, b], { x: 0.5, y: 0.5 }, [{ x: 0.6, y: 0.5 }, { x: 0.5, y: 0.4 }], { x: 150, y: 70 }, RECT);
    expect(loupe.hidden).toBe(false);
    expect(loupe.style.backgroundSize).toBe('500px 250px');
    expect(a.style.display).toBe('');
    expect(b.style.display).toBe('');
    expect(Number(a.getAttribute('x2'))).toBeCloseTo(106);
    expect(Number(b.getAttribute('y2'))).toBeCloseTo(31);
  });

  const svgLine = () => document.createElementNS('http://www.w3.org/2000/svg', 'line');

  it('shows only the photo and crosshair, no edge lines, when called without neighbours', () => {
    const loupe = document.createElement('div');
    loupe.hidden = true;
    const a = svgLine();
    const b = svgLine();
    showLoupe(loupe, [a, b], { x: 0.5, y: 0.5 }, undefined, { x: 150, y: 70 }, RECT);
    expect(loupe.hidden).toBe(false);
    expect(loupe.style.left).not.toBe('');
    expect(loupe.style.backgroundSize).toBe('500px 250px');
    expect(a.style.display).toBe('none');
    expect(b.style.display).toBe('none');
  });

  it('draws the edge lines again when neighbours follow a call without them', () => {
    const loupe = document.createElement('div');
    const a = svgLine();
    const b = svgLine();
    showLoupe(loupe, [a, b], { x: 0.5, y: 0.5 }, undefined, { x: 150, y: 70 }, RECT);
    showLoupe(loupe, [a, b], { x: 0.5, y: 0.5 }, [{ x: 0.6, y: 0.5 }, { x: 0.5, y: 0.4 }], { x: 150, y: 70 }, RECT);
    expect(a.style.display).toBe('');
    expect(b.style.display).toBe('');
    expect(Number(a.getAttribute('x2'))).toBeCloseTo(106);
  });

  it('does nothing without a loupe element', () => {
    expect(() => showLoupe(null, [], { x: 0, y: 0 }, [{ x: 1, y: 0 }, { x: 0, y: 1 }], { x: 0, y: 0 }, RECT)).not.toThrow();
  });
});
