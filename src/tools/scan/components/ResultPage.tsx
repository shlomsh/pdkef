import styles from './ResultPage.module.css';

/** placeImage's shape (src/lib/imagePage.js): PDF points, y measured from the page's bottom. */
export interface Placement { pageWidth: number; pageHeight: number; x: number; y: number; width: number; height: number }

interface ResultPageProps {
  src: string | null;
  place: Placement | null;
  exact: boolean;
  labels: { exact: string; updating: string; making: string };
  detail?: string;
}

const A4_W = 595.28;
const A4_H = 841.89;

/** One PDF page exactly as it will download: the paper, the image placed on it, and a caption. */
export default function ResultPage({ src, place, exact, labels, detail }: ResultPageProps) {
  const ready = src !== null && place !== null;
  const w = ready ? place.pageWidth : A4_W;
  const h = ready ? place.pageHeight : A4_H;
  const updating = ready && !exact;
  const caption = !ready ? labels.making : exact ? (detail ? `${labels.exact} · ${detail}` : labels.exact) : labels.updating;

  return (
    <figure class={styles.figure}>
      <div
        class={styles.paper}
        data-paper
        data-exact={ready && exact ? '' : undefined}
        data-updating={updating ? '' : undefined}
        style={{ aspectRatio: `${w} / ${h}`, width: `min(100%, calc(var(--scan-paper-h, 62svh) * ${w} / ${h}))` }}
      >
        {ready ? (
          <img
            class={styles.img}
            src={src}
            alt=""
            draggable={false}
            style={{
              left: `${(place.x / w) * 100}%`,
              top: `${((h - place.y - place.height) / h) * 100}%`,
              width: `${(place.width / w) * 100}%`,
              height: `${(place.height / h) * 100}%`,
            }}
          />
        ) : (
          <span class={styles.making}>{labels.making}</span>
        )}
        {updating && (
          <div class={styles.updating} aria-hidden="true">
            <span class={styles.beam} />
            <span class={styles.pill}>
              <span class={styles.spinner} />
              {labels.updating}
            </span>
          </div>
        )}
      </div>
      <figcaption class={styles.caption} aria-live="polite">
        {/* While it rebuilds, the pill on the page says so: the caption keeps the words for screen
            readers and its line, so nothing below moves. */}
        {updating ? <><span class="sr-only">{caption}</span>{'\u00a0'}</> : caption}
      </figcaption>
    </figure>
  );
}
