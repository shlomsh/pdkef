import type { CombRegion, FieldRegion } from '../../../editor/text/combPlacement.ts';
import styles from './FormFieldHints.module.css';

/**
 * Faint outlines over the printed grids MOBI-03 found on the page, and the
 * free-text cells MOBI-11's `formCells.js` found alongside them.
 *
 * Purely a hint, and deliberately not a control: the layer takes no pointer
 * events at all, and the tap itself is handled by the workspace's existing
 * text placement, which snaps to whichever grid or cell it landed on. Putting
 * real buttons here instead would have to compete with placing a text box and
 * with clicking empty paper to deselect - three meanings for one tap on the
 * same few millimetres of a phone screen.
 *
 * Shown only while the matching tool is armed, because that is the moment the
 * answer to "where can I put this?" is useful and the rest of the time it is
 * dozens of rectangles of noise. An *open* comb run's ink is only its teeth,
 * a few points tall, so its hint is grown upward to the strip a person would
 * write in (`.field-hint-comb`'s padding/margin, see the CSS module). A
 * *boxed* comb's detected region is already the printed cells themselves
 * (`formGrid.js`'s `row.bottom`/`row.top` come from the box walls, not
 * teeth), so growing it the same way doubled it upward into whatever sits
 * above - the practice form's ID-number comb reached up into the Full-name
 * box's label. `region.boxed` is what tells the two apart, the same flag
 * `placeCombOnRegion` already reads for the same reason. A checkbox is
 * already a real square and is outlined as it is; a free-text cell is a
 * real, already-closed rectangle and is outlined as it is too, in a style of
 * its own so it doesn't read as "this is a comb" (it isn't - typing more
 * than one character never splits into per-character boxes here).
 */
export default function FormFieldHints({ regions, kind, pageIndex }: {
  regions: FieldRegion[] | CombRegion[];
  kind: 'comb' | 'checkbox' | 'cell';
  pageIndex: number;
}) {
  const pageRegions = regions.filter((region) => region.pageIndex === pageIndex);
  if (pageRegions.length === 0) return null;

  // Only an open comb (no boxes of its own) gets grown to the writable
  // strip; every other hint - a boxed comb included - is outlined at its
  // own detected bounds.
  const modifierClass = (region: FieldRegion) => {
    if (kind !== 'comb') return styles[`field-hint-${kind}`];
    return (region as CombRegion).boxed ? '' : styles['field-hint-comb'];
  };

  return (
    <div className={styles['field-hints']} aria-hidden="true">
      {pageRegions.map((region) => (
        <span
          key={`${region.left}-${region.top}-${region.width}`}
          className={`${styles['field-hint']} ${modifierClass(region)}`}
          style={{
            left: `${region.left}%`,
            top: `${region.top}%`,
            width: `${region.width}%`,
            height: `${region.height}%`,
          }}
        />
      ))}
    </div>
  );
}
