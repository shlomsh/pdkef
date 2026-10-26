# Scan to PDF (SCAN-01): design record and the contract between its pieces

Scan to PDF is its own tool at `/scan-to-pdf/` (folder `src/tools/scan/`, registry slug, analytics tool
and hand-off key all `scan-to-pdf`). It shares Image to PDF's engine instead of copying it. Scope,
demand data and acceptance are in `backlog/tasks/SCAN-01.md`; this record says how it is built.

## The flow

1. **In.** Photos from the library (the dropzone's picker, JPEG or PNG) or "Take a photo" (a second
   `<input type="file" capture="environment">`, coarse pointers only). One photo is one page; more can
   be added at any time. A hand-off from Image to PDF arrives the same way (`useHandoffFilesIntake`).
2. **Corners.** Each page gets four corners, prefilled by `guessCorners` (below) when it finds a page and
   the whole photo when it does not. The selected page shows its photo with the corners over it; the
   person drags them. A corner the person moved is never re-guessed: their corners always win.
3. **Look.** Three filters for every page: Original, Grayscale, Document (even out the lighting, then a
   clean black on white). Default: Document, since that is what a scan looks like.
4. **Page size.** Fit (the page is the scan's own size, as Image to PDF does it), A4 or Letter, the same
   for every page. A4 and Letter follow the scan's orientation and fit it inside the page, centred.
5. **Size limit.** Off, 2 MB, 1 MB or 500 KB for the whole PDF. With a limit, JPEG quality and then
   resolution step down until it fits (the search Compress already uses); the Download element shows the
   final size either way.
6. **Done.** The shared page-tool finish (`DownloadElement`, `FinishRow`, `PhoneFinish`) hands the PDF
   off to Sign, Merge and Compress.

The output is built quietly in the background (`usePreparedOutput`), keyed on everything that changes it.

## Where code lives

| Module | Owner | What it is |
| --- | --- | --- |
| `src/lib/imagesToPdf.js` | Image to PDF, Scan | moved from `src/tools/image-to-pdf/imageToPdf.js`; gains `options.pageSize` |
| `src/lib/imagePage.js` | Image to PDF, Merge, Scan | gains `placeImage()` and `addImagePage(..., { pageSize })` |
| `src/lib/pageOrder.js` | Image to PDF, Scan | moved from `src/tools/image-to-pdf/pageOrder.js`, unchanged |
| `src/lib/targetSizeSearch.js` | Compress, Scan | moved from `src/tools/compress/`, plus the quality constants |
| `src/lib/canvasBlob.js` | Compress, Scan | `canvasToBlob`, moved out of `compress.js` |
| `src/shell/pageWorkspace/useDownloadFlow.ts`, `FinishRow.tsx` | all page tools | `HandoffTool` gains `'merge'` |
| `src/shell/BasePdfTool.tsx`, `DropzoneEmptyState.tsx` | all tools | optional `emptyAction` slot under the picker |
| `src/tools/scan/quad.ts` | Scan | `Point`, `Quad`, `RgbaImage`, `GrayImage`, quad helpers |
| `src/tools/scan/edges/` | Scan | the swappable edge guess |
| `src/tools/scan/warp.ts` | Scan | homography and perspective warp, pure |
| `src/tools/scan/filters.ts` | Scan | the three looks, pure |
| `src/tools/scan/scanBudget.ts` | Scan | the size-limit search over pages, pure (injected encode and build) |
| `src/tools/scan/scanPipeline.ts` | Scan | the DOM side: decode, gray thumbnail, process a page, build the PDF. Lazy. |
| `src/tools/scan/CornerEditor.tsx` | Scan | the photo with four draggable corners |
| `src/tools/scan/PdfScanTool.tsx` | Scan | the island |

Scan never imports another tool (module-boundaries rule 1); everything it shares moved to `src/lib/` or
`src/shell/`. Warp, filters, edge guess and the pipeline load through one `import()` once the first
photo is in, so the page's first load carries none of them (`test:lazy-modules` guards the chunk).

## Contract

All coordinates a person sees or stores are **normalized** (0..1) in the **upright** photo (EXIF
orientation already applied, as `<img>` and `createImageBitmap(..., { imageOrientation: 'from-image' })`
both show it). Pixel quads exist only inside `scanPipeline.ts`.

```ts
// src/tools/scan/quad.ts
export interface Point { x: number; y: number }
/** Top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point];
export interface RgbaImage { width: number; height: number; data: Uint8ClampedArray } // ImageData-shaped
export interface GrayImage { width: number; height: number; data: Uint8ClampedArray } // one byte a pixel
export const FULL_QUAD: Quad;
export function orderQuad(points: Point[]): Quad;
export function isConvexQuad(quad: Quad): boolean;
export function clampPoint(point: Point): Point;
export function scaleQuad(quad: Quad, width: number, height: number): Quad;
export function quadKey(quad: Quad): string;
export function rotateQuad(quad: Quad, turns: number): Quad; // the page turned clockwise: corners moved one place on per turn

// src/tools/scan/edges/index.ts
export type EdgeGuesser = (image: GrayImage) => Quad | null; // normalized; null = no page found
export const guessCorners: EdgeGuesser; // the current strategy; a better detector replaces this line

// src/tools/scan/warp.ts
export type Matrix3 = [number, number, number, number, number, number, number, number, number];
export function homography(from: Quad, to: Quad): Matrix3; // maps each from[i] onto to[i]
export function applyHomography(h: Matrix3, p: Point): Point;
export function warpSize(quadPx: Quad, maxLongEdge: number): { width: number; height: number };
export function warpPerspective(src: RgbaImage, quadPx: Quad, width: number, height: number): RgbaImage;

// src/tools/scan/filters.ts
export type ScanFilter = 'original' | 'grayscale' | 'document';
export function applyFilter(image: RgbaImage, filter: ScanFilter): RgbaImage; // never mutates `image`

// src/lib/imagePage.js
export type PageSize = 'fit' | 'a4' | 'letter';
export function placeImage(imageWidth, imageHeight, pageSize):
  { pageWidth, pageHeight, x, y, width, height }; // PDF points
export async function addImagePage(pdfDoc, bytes, mimeType, label = mimeType, { pageSize = 'fit' } = {});

// src/lib/imagesToPdf.js
export async function imagesToPdf(files, onProgress, signal, { pageSize = 'fit' } = {}): Promise<Blob>;

// src/tools/scan/scanBudget.ts
export const SCAN_SCALE_LADDER: number[];
export const SCAN_QUALITY: number; // the quality with no limit set
export const SIZE_LIMITS: { id: 'none' | '2mb' | '1mb' | '500kb'; bytes: number | null }[];
export async function fitScanToBudget<H>(input: {
  budgetBytes: number | null;
  render(scale: number): H | Promise<H>;            // the pages at this scale
  build(handle: H, quality: number): Promise<Blob>; // the whole PDF at this quality
  release?(handle: H): void;
  deadlineMs: number;
}): Promise<{ blob: Blob; metTarget: boolean; scale: number; quality: number }>;
```

### Rules every piece keeps

- Pure modules (`quad`, `edges`, `warp`, `filters`, `scanBudget`, `placeImage`) touch no DOM, no canvas
  and no `Date.now()` they were not handed, and run under plain Vitest (node, not jsdom).
- `warpPerspective` samples bilinearly and paints anything outside the source white.
- The output's long edge is capped at 2400 px (about 200 dpi on A4), which keeps a three-page phone scan
  around a megabyte before any limit.
- Corner drags follow the gesture golden rule: `startGesture` from `src/lib/gestures/controller.ts`
  writes the handle and outline to the DOM on every move and commits the quad to state once on release.
- No network, ever: every byte stays in the tab.

## HEIC from the iOS photo library

Both inputs take `image/jpeg,image/png`. With HEIC left out of `accept`, iOS Safari converts a library
photo to the first listed type, JPEG (WebKit bug 303803 documents the conversion); listing `image/heic`
would hand HEIC over, which Chrome and Firefox cannot decode. The evidence and what is still to check on a
real iPhone are in `backlog/tasks/SCAN-01.md` (open questions).

## Home dock

Scan is the eleventh card on the home dock, right after Image to PDF (`HomePageLayout.astro` carries the gap maths).
