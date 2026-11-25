// fontkit 3.0.0 ships no types (upstream main has them, foliojs/fontkit 440).
declare module 'fontkit' { export function create(buffer: Uint8Array, postscriptName?: string): any; }
declare module 'fontkit/core' {
  export function create(buffer: Uint8Array, postscriptName?: string): any;
  export function registerFormat(format: unknown): void;
  export function registerShaper(shaper: unknown): void;
}
declare module 'fontkit/formats/TTFFont' { export const TTFFont: unknown; }
declare module 'fontkit/shapers/ArabicShaper' { export const ArabicShaper: unknown; }
declare module 'fontkit/shapers/HangulShaper' { export const HangulShaper: unknown; }
declare module 'fontkit/shapers/HebrewShaper' { export const HebrewShaper: unknown; }
declare module 'fontkit/shapers/IndicShaper' { export const IndicShaper: unknown; }
declare module 'fontkit/shapers/ThaiShaper' { export const ThaiShaper: unknown; }
