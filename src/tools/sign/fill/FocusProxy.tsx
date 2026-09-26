/**
 * Fill mode's focus proxy (SNG-15): a tap that opens a free slot focuses this,
 * inside the touch handler, so iOS raises the keyboard (MOBI-24) before the slot
 * it is for even exists. FillLayer's pending-focus effect moves focus from here to
 * the real slot once it renders, with the keyboard already up.
 */
import { useFill } from './FillContext.tsx';
import styles from './fill.module.css';

export default function FocusProxy() {
  const { proxyRef } = useFill();
  return <input ref={proxyRef} type="text" className={styles.proxy} tabIndex={-1} aria-hidden="true" autocomplete="off" />;
}
