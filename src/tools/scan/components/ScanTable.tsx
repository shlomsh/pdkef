import type { ComponentProps } from 'preact';
import { englishScanMessages as t } from '../messages.ts';
import ScanPageGrid from './ScanPageGrid.tsx';
import styles from './ScanTable.module.css';

/** The desktop's loaded state: the pages as a numbered grid ending in Add pages, and the hint. The rail carries the rest;
 * a phone renders ScanPhoneTable instead. */
export default function ScanTable(props: ComponentProps<typeof ScanPageGrid>) {
  return (
    <div class={styles.table}>
      <ScanPageGrid {...props} />
      <p class={styles.hint}>{t.tableHintWide}</p>
    </div>
  );
}
