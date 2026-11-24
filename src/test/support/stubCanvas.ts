// forced: jsdom draws nothing: a context that accepts every call, and a blob of the asked type (over 1 KB, so its size reads in KB).
function acceptingContext(canvas: HTMLCanvasElement) {
  const own: Record<string | symbol, unknown> = { canvas, fillStyle: '', strokeStyle: '', getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) };
  return new Proxy(own, { get: (target, key) => (key in target ? target[key] : () => {}) });
}

/** Lets pdf.js and the real converters run in jsdom without pixels; returns what puts the canvas back. */
export function stubCanvas(): () => void {
  const proto = HTMLCanvasElement.prototype;
  const originals = { getContext: proto.getContext, toBlob: proto.toBlob };
  Object.assign(proto, {
    getContext(this: HTMLCanvasElement) { return acceptingContext(this); },
    toBlob(callback: BlobCallback, type = 'image/png') { callback(new Blob([new Uint8Array(1200)], { type })); },
  });
  return () => { Object.assign(proto, originals); };
}
