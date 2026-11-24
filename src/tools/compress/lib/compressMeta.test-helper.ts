import type { CompressMeta } from './compressCallbacks.ts';

/** A finished run's meta with every field a plain success has, overridden per test. @testSeam */
export function metaOf(over: Partial<CompressMeta> = {}): CompressMeta {
  return {
    filename: 'out.pdf', outputType: 'application/pdf', metTarget: true, passthrough: false, unchanged: false,
    rasterBytes: null, imageReason: null, keptBytes: 0, resultImageBytes: 0, dimensions: null, announcement: '', ...over,
  };
}
