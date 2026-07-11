/**
 * Normalise mouse and touch events without coupling gesture code to Preact.
 */
export function getPointerCoords(event: MouseEvent | TouchEvent) {
  // Preact's synthetic mouse events expose `touches: null`, so feature
  // detection alone is not enough here.
  const touch = 'touches' in event && event.touches ? event.touches[0] : undefined;
  return {
    x: touch ? touch.clientX : (event as MouseEvent).clientX,
    y: touch ? touch.clientY : (event as MouseEvent).clientY,
  };
}
