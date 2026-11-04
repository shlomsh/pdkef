// The camera in the page (SCAN-08): a full-screen dialog with the live outline, the hint, the shutter and
// its hold ring, the stack, Done, close and Auto. Loaded with import() after Start scanning.
import { useEffect, useRef, useState, type MutableRef } from 'preact/hooks';
import { X } from 'lucide-preact';
import { formatMessage } from '#lib/text/formatMessage.ts';
import TakePhotoButton from './TakePhotoButton.tsx';
import { playFlatten, relativeBox } from '../lib/flattenAnimation.ts';
import type { Quad } from '../lib/quad.ts';
import { englishScanMessages as t } from '../messages.ts';
import { useCamera } from '../hooks/useCamera.ts';
import { usePinchZoom } from '../hooks/usePinchZoom.ts';
import { coverRect, hintText } from '../lib/camera/viewfinderModel.ts';
import type { TakenPage, ViewfinderProps } from '../lib/camera/types.ts';
import styles from './Viewfinder.module.css';

const RING_RADIUS = 34;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
const FULL_FRAME: Quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
/** The hints that ask for a change (SCAN-24) sit on a light pill, so a new one catches the eye; the rest are plain. */
const ADVICE = new Set(['duplicate', 'fit', 'closer', 'contrast', 'flatter']);

/** The page taken flies from where it sits in the viewfinder into the stack. The stack's image is read after the
 * decode: by then it shows this page's thumbnail, the first page's too. */
function flyToStack(dialog: HTMLElement, url: string, quad: Quad | null, videoSize: { width: number; height: number }, stackImg: () => HTMLImageElement | null, stop: MutableRef<() => void>) {
  const photo = new Image();
  photo.src = url;
  // expected: a snapshot that will not decode only skips the flight; the page itself is already taken
  photo.decode().then(() => {
    const target = stackImg();
    if (!target || !dialog.isConnected) return;
    stop.current();
    const host = dialog.getBoundingClientRect();
    const cover = coverRect(videoSize, { width: host.width, height: host.height });
    stop.current = playFlatten(dialog, {
      photo,
      frame: relativeBox(new DOMRect(host.left + cover.x, host.top + cover.y, cover.width, cover.height), host),
      quad: quad ?? FULL_FRAME,
    }, target);
  }, () => {});
}

export default function Viewfinder(props: ViewfinderProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const stackImgRef = useRef<HTMLImageElement | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [snapUrl, setSnapUrl] = useState<string | null>(null);
  const stopFlight = useRef<() => void>(() => {});
  const snapUrlRef = useRef<string | null>(null);

  const camera = useCamera({
    paused: props.paused,
    onTaken: (page: TakenPage) => {
      const dialog = dialogRef.current;
      propsRef.current.onTaken(page.file);
      if (!page.snapshot) return;
      const url = URL.createObjectURL(page.snapshot);
      snapUrlRef.current = url;
      setSnapUrl((old) => { if (old) URL.revokeObjectURL(old); return url; });
      if (dialog) flyToStack(dialog, url, page.quad, camera.videoSize, () => stackImgRef.current, stopFlight);
    },
  });

  usePinchZoom(dialogRef, camera.track);

  // The top layer, so it shows in real fullscreen.
  useEffect(() => {
    const dialog = dialogRef.current!;
    if (!dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current!;
    const measure = () => { const r = dialog.getBoundingClientRect(); setSize({ width: r.width, height: r.height }); };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(dialog);
    return () => observer.disconnect();
  }, []);

  // The page's own thumbnail takes over from the snapshot once the island has it.
  useEffect(() => {
    if (!props.lastSrc) return;
    snapUrlRef.current = null;
    setSnapUrl((old) => { if (old) URL.revokeObjectURL(old); return null; });
  }, [props.lastSrc]);
  useEffect(() => () => {
    stopFlight.current();
    if (snapUrlRef.current) URL.revokeObjectURL(snapUrlRef.current);
  }, []);

  const { live } = camera;
  const thumb = snapUrl ?? props.lastSrc;
  const many = props.mode === 'many';
  // Kept in the layout from the start, hidden until a page is in it, so the first page has somewhere to fly.
  const showStack = many && (props.count > 0 || thumb !== null);
  const cover = coverRect(camera.videoSize, size);
  const offered = camera.status === 'refused' || camera.status === 'unavailable' || camera.status === 'slow';

  const onCancel = (event: Event) => { event.preventDefault(); props.onClose(); };

  return (
    <dialog ref={dialogRef} class={styles.dialog} onCancel={onCancel} aria-label={t.startScanning}>
      <video ref={camera.videoRef} class={styles.video} playsInline muted autoPlay />
      {camera.status === 'live' && live.quad && (
        <svg
          class={styles.outline}
          aria-hidden="true"
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          style={{ left: `${cover.x}px`, top: `${cover.y}px`, width: `${cover.width}px`, height: `${cover.height}px` }}
        >
          <polygon
            class={styles.polygon}
            points={live.quad.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke-width="3"
            vector-effect="non-scaling-stroke"
            stroke-linejoin="round"
            stroke-dasharray={live.locked ? undefined : '10 8'}
          />
        </svg>
      )}

      <div class={styles.top}>
        <button type="button" class={styles.round} data-close aria-label={t.closeCamera} onClick={props.onClose}>
          <X size={24} aria-hidden="true" />
        </button>
        <p class={styles.hint} data-hint={camera.status === 'live' ? live.hint : undefined}>
          {camera.status === 'live' && (
            <span class={styles.hintText} data-advice={ADVICE.has(live.hint) || undefined}>{hintText(live.hint, props.count, t)}</span>
          )}
        </p>
        {camera.status === 'live' ? (
          <button type="button" role="switch" aria-checked={camera.auto} class={styles.auto} onClick={() => camera.setAuto(!camera.auto)}>
            {t.autoLabel}
          </button>
        ) : <span class={styles.spacer} />}
      </div>

      {/* Screen readers hear the hint politely and at most every few seconds (stepGuidance), never frame by frame. */}
      <p class="sr-only" aria-live="polite" data-hint-spoken>
        {camera.status === 'live' && live.spoken ? hintText(live.spoken, props.count, t) : ''}
      </p>

      {camera.status === 'starting' && <p class={styles.status}>{t.cameraStarting}</p>}
      {offered && (
        <div class={styles.status}>
          <p>{camera.status === 'slow' ? t.cameraSlow : t.cameraOff}</p>
          <TakePhotoButton onFiles={props.onFallbackFiles} buttonClass={styles.fallback} />
        </div>
      )}

      {camera.status === 'live' && (
        <div class={styles.bottom}>
          <div class={styles.side}>
            {showStack && (
              <button type="button" class={styles.stack} data-stack aria-label={formatMessage(t.stackLabel, { count: props.count })} onClick={props.onReview}>
                {thumb && <img ref={stackImgRef} class={styles.thumb} src={thumb} alt="" />}
                <span class={styles.badge}>{props.count}</span>
              </button>
            )}
          </div>
          <button type="button" class={styles.shutter} aria-label={t.shutter} onClick={camera.shoot}>
            <svg class={styles.ring} aria-hidden="true" viewBox="0 0 80 80">
              <circle
                cx="40" cy="40" r={RING_RADIUS} fill="none" stroke-width="4" stroke-linecap="round"
                class={styles.ringFill}
                transform="rotate(-90 40 40)"
                stroke-dasharray={RING_LENGTH}
                stroke-dashoffset={(1 - live.hold) * RING_LENGTH}
              />
            </svg>
            <span class={styles.shutterDisc} />
          </button>
          <div class={`${styles.side} ${styles.sideEnd}`}>
            {many && <button type="button" class={styles.done} onClick={props.onClose}>{t.cameraDone}</button>}
          </div>
        </div>
      )}
    </dialog>
  );
}
