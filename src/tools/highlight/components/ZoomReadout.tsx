import { useEffect, useRef, useState } from 'preact/hooks';
import styles from './ZoomReadout.module.css';

const READOUT_MS = 1200;

/** R26: a pill that names the zoom on every change and fades after 1200 ms. It never takes focus or wakes the capsule. */
export default function ZoomReadout({ text }: { text: string }) {
  const [shown, setShown] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setShown(true);
    const timer = setTimeout(() => setShown(false), READOUT_MS);
    return () => clearTimeout(timer);
  }, [text]);
  return <div class={styles.readout} data-shown={shown || undefined} aria-hidden="true">{text}</div>;
}
