/**
 * Layout + scan geometry -> the expected-fields object written to expected/<name>.json. Pure.
 * Field rects come straight from forms.mjs; for a scan they are the axis-aligned box of the rect's
 * four corners pushed through the same matrix the scan was rendered with, i.e. where the field
 * visibly is in the scan image.
 */
import { PAGE } from '../forms.mjs';
import {
  applyMatrix, boundingBox, cornersOf, pixelRectToPoints, round, toPdfRect,
} from './geometry.mjs';

const POINT_DECIMALS = 2;
const FRACTION_DECIMALS = 4;

const roundRect = (rect, decimals) => Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, round(value, decimals)]));

const boundsOf = (rectPt) => roundRect({
  x: rectPt.x / PAGE.width,
  y: rectPt.y / PAGE.height,
  width: rectPt.width / PAGE.width,
  height: rectPt.height / PAGE.height,
}, FRACTION_DECIMALS);

function buildTarget(field, geometry) {
  const rectPx = geometry && boundingBox(cornersOf(field.rect).map((corner) => applyMatrix(geometry.matrix, corner)));
  const rectPt = geometry ? pixelRectToPoints(rectPx, geometry) : field.rect;
  return {
    id: field.id,
    kind: field.kind,
    label: field.label,
    bounds: boundsOf(rectPt),
    rectPt: roundRect(rectPt, POINT_DECIMALS),
    rectPdf: roundRect(toPdfRect(rectPt), POINT_DECIMALS),
    ...(rectPx && { rectPx: roundRect(rectPx, POINT_DECIMALS) }),
    ...(field.cells && { cells: field.cells }),
    ...(field.group && { group: field.group }),
    ...(field.officeUse && { officeUse: true }),
    ...(field.line && { line: true }),
  };
}

const COORDINATE_DOCS = {
  bounds: 'Fractions 0..1 of page width/height, TOP-LEFT origin, y down (same as src/tools/sign/fields/corpus/scoring/ground-truth/*.json, so greedyMatch can score against it).',
  rectPt: 'Page points (page is 595 x 842), TOP-LEFT origin, y down.',
  rectPdf: 'PDF user space points, BOTTOM-LEFT origin: x, y = bottom edge, width, height.',
};
const ROTATION_SIGN = 'Positive rotateDeg turns the page clockwise as seen on screen (canvas rotate() in a y-down space), about the image centre, before offsetPx is added.';

/**
 * @param {{variant: {name: string, form: string, scan: object|null}, form: object, sha256: string,
 *   fixturePath: string, scanResult: {geometry: object, jpegQuality: number}|null}} input
 */
export function buildExpected({ variant, form, sha256, fixturePath, scanResult }) {
  const geometry = scanResult?.geometry ?? null;
  const scanCoordinates = scanResult && {
    rectPx: 'Scan image pixels, TOP-LEFT origin: the bounding box of the rect\'s four transformed corners. rectPt, rectPdf and bounds are that same box mapped back to page units.',
    scan: {
      dpi: variant.scan.dpi,
      pixelWidth: geometry.pixelWidth,
      pixelHeight: geometry.pixelHeight,
      rotateDeg: variant.scan.rotateDeg,
      rotationSign: ROTATION_SIGN,
      offsetPx: variant.scan.offsetPx,
      jpegQuality: scanResult.jpegQuality,
      seed: variant.scan.seed,
      pointsTopLeftToPixels: geometry.matrix.map((value) => round(value, 6)),
    },
  };
  return {
    form: `ai-pdf-filler-${variant.name}`,
    synthetic: true,
    fixture: fixturePath,
    sha256,
    language: form.id,
    direction: form.direction,
    variant: scanResult ? 'scan' : 'flat',
    pageIndex: 0,
    pageSize: { width: PAGE.width, height: PAGE.height },
    units: 'pt',
    render: scanResult && { format: 'jpeg', dpi: variant.scan.dpi, pixelWidth: geometry.pixelWidth, pixelHeight: geometry.pixelHeight },
    coordinates: { ...COORDINATE_DOCS, ...scanCoordinates },
    targets: form.fields.map((field) => buildTarget(field, geometry)),
  };
}
