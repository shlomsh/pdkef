import type { CombRegion } from '../../editor/text/combPlacement.ts';
import styles from './FormFieldHints.module.css';

/**
 * Faint outlines over the printed grids MOBI-03 found on the page.
 *
 * Purely a hint, and deliberately not a control: the layer takes no pointer
 * events at all, and the tap itself is handled by the workspace's existing
 * text placement, which snaps to whichever grid it landed on. Putting real
 * buttons here instead would have to compete with placing a text box and with
 * clicking empty paper to deselect - three meanings for one tap on the same
 * few millimetres of a phone screen.
 *
 * Shown only while the text tool is armed, because that is the moment the
 * answer to "where can I type?" is useful and the rest of the time it is 37
 * rectangles of noise.
 */
export default function FormFieldHints({ regions, pageIndex }: {
  regions: CombRegion[];
  pageIndex: number;
}) {
  const pageRegions = regions.filter((region) => region.pageIndex === pageIndex);
  if (pageRegions.length === 0) return null;

  return (
    <div className={styles['field-hints']} aria-hidden="true">
      {pageRegions.map((region) => (
        <span
          key={`${region.left}-${region.top}-${region.cells}`}
          className={styles['field-hint']}
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
