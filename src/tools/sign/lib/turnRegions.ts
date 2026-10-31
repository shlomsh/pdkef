// SIGN-43: detected fields follow their page when a person turns it. Detection
// runs once on the file's own pages; this maps every page-percent box of a
// turned page into the displayed page, so hints, taps and fill hops land on the
// printed field wherever it now sits.
import { turnPercentBox, turnsOf, type PageTurns } from '#editor/geometry/pageTurn.ts';
import type { FieldRegion } from './combPlacement.ts';
import type { FormFieldRegions } from '../hooks/useFormFieldRegions.ts';

function turnRegion<T extends FieldRegion>(region: T, pageTurns: PageTurns): T {
  const q = turnsOf(pageTurns, region.pageIndex);
  if (q === 0) return region;
  const turned: T = { ...region, ...turnPercentBox(region, q) };
  if (region.writable) turned.writable = turnPercentBox(region.writable, q);
  if (region.enclosure) turned.enclosure = turnPercentBox(region.enclosure, q);
  return turned;
}

/** The regions as displayed: boxes on turned pages mapped through the turn, every other region the same object. */
export function turnRegions(regions: FormFieldRegions, pageTurns: PageTurns): FormFieldRegions {
  if (Object.keys(pageTurns).length === 0) return regions;
  return {
    ...regions,
    combs: regions.combs.map((r) => turnRegion(r, pageTurns)),
    checkboxes: regions.checkboxes.map((r) => turnRegion(r, pageTurns)),
    cells: regions.cells.map((r) => turnRegion(r, pageTurns)),
  };
}
