import type { PDFPage } from '@cantoo/pdf-lib';
import type { CombRegion, FieldRegion } from '../../../editor/text/combPlacement.ts';
import type { PageGeometry } from '../../../editor/geometry/coords.ts';

/**
 * The one field-kind vocabulary (FORM-23), where three copies used to drift
 * independently: `formCells.js` (and `formGrid.js`/`formWidgets.js` beside
 * it) assigned a kind string to every detected region, `corpus/scoring/
 * candidates.js`'s `KINDS` mapped a detector kind onto the scoring
 * contract's own kind, and `corpus/scoring/match.js`'s `KIND_GROUPS` decided
 * which kinds may match each other - each its own list, so a kind added to
 * one was silently unknown to the other two. `FIELD_KINDS` is the contract's
 * full enum (`scripts/spike/mobi-10/CONTRACT.md`'s `CandidateField.kind`),
 * as one `as const` array so every runtime list (`candidates.js`'s `KINDS`
 * keys, a Set built from `match.js`'s `KIND_GROUPS`) is checked against it
 * rather than typed separately.
 */
export const FIELD_KINDS = [
  'text',
  'comb',
  'checkbox',
  'radio',
  'date',
  'signature',
  'select',
  'table-cell',
  'unknown',
] as const;

/** The scoring contract's full kind enum. Every candidate and target kind is one of these. */
export type FieldKind = typeof FIELD_KINDS[number];

/**
 * The subset of `FieldKind` our own detectors actually assign
 * (`formGrid.js`'s comb/checkbox, `formWidgets.js`'s comb/text,
 * `formCells.js`'s classifyKind: checkbox/date/signature/text/table-cell).
 * `radio`, `select` and `unknown` are contract kinds a ground-truth target
 * may carry, or that `corpus/scoring/candidates.js` falls back to, but no
 * detector produces one directly. `corpus/scoring/candidates.js`'s `KINDS`
 * map used to spell these six out a second time as an identity map; it now
 * builds itself from this array instead.
 */
// `satisfies readonly FieldKind[]` (kept alongside `as const`, not instead of
// it) is what actually ties this to `FIELD_KINDS`: `as const` alone gives
// precise literal types but checks each entry against nothing, so a typo
// here would silently become a new kind instead of a compile error.
export const DETECTOR_FIELD_KINDS = ['text', 'comb', 'checkbox', 'date', 'signature', 'table-cell'] as const satisfies readonly FieldKind[];

export type DetectorFieldKind = typeof DETECTOR_FIELD_KINDS[number];

/** A rectangle in the editor's top-left-origin page percentages. Re-exported
 * from `combPlacement.ts`'s own `PercentBox` shape is not possible (it is
 * not exported there), so this is the same shape kept in one place instead
 * of repeated per detector file. */
export interface PercentBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

// `CombRegion`/`FieldRegion` already live in `combPlacement.ts` (the text
// placement module, not a detector) and are the same region shape a detector
// reports - re-exported here rather than duplicated, so a detector or the
// scoring harness reaches both the kind vocabulary and the region shape
// through this one module.
export type { CombRegion, FieldRegion };

/** A detector's output region, tagged with the kind it actually assigns. */
export interface FieldCandidate extends PercentBox {
  kind: DetectorFieldKind;
  enclosure?: PercentBox;
  writable?: PercentBox;
}

/** One page's text, already in the editor's page-percent shape - what
 * `textRuns.js`'s `toPageTextRuns` produces from a pdf.js page. */
export interface PageTextRun extends PercentBox {
  str: string;
}

/**
 * What a source needs to detect one page: its own text runs, the page's
 * geometry, and which page this is. Moved here from `detectFormFields.ts`
 * (re-exported there so existing imports keep working) so the source
 * contract sits beside the kind vocabulary it produces.
 */
export interface DetectionContext {
  textRuns: PageTextRun[];
  geometry: PageGeometry;
  pageIndex: number;
}

/** What one source reports for one page, before reconciliation. */
export interface SourceRegions {
  combs: CombRegion[];
  checkboxes: FieldRegion[];
  cells: FieldRegion[];
}

/**
 * A detected free-text/date/signature/table-cell field, tagged with the kind
 * `classifyKind` (`formCells.js`) or the widget passthrough (`formWidgets.js`)
 * actually assigns it. `SourceRegions.cells` stays plain `FieldRegion[]` -
 * the plan's own contract is deliberately kind-agnostic there - but every
 * real cell a source produces does carry one, so `detectFormFields`'s own
 * return type says so: this is what let `useFormFieldRegions.ts` drop its
 * local widening cast (FORM-23).
 */
export interface DetectedCell extends FieldRegion {
  kind: DetectorFieldKind;
}

/**
 * One way of finding fields on a page. Async from the start: today's two
 * sources are synchronous wrappers around synchronous functions, but OCR
 * will not be - it will likely run in a worker - and a contract that is sync
 * now is one every future source has to rewrite around.
 */
export interface FieldSource {
  name: string;
  detect(page: PDFPage, context: DetectionContext): Promise<SourceRegions>;
}
