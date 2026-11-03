/** Whether Scan can offer its live camera (SCAN-08): a secure context, getUserMedia, ImageCapture (the full
 * photo) and a touch screen. Without ImageCapture the native photo input stays, the fallback SCAN-04 chose. */
export function canUseCamera(): boolean {
  if (typeof window === 'undefined' || !window.isSecureContext) return false;
  if (typeof navigator.mediaDevices?.getUserMedia !== 'function') return false;
  if (typeof (window as unknown as { ImageCapture?: unknown }).ImageCapture !== 'function') return false;
  return window.matchMedia?.('(pointer: coarse)').matches === true;
}
