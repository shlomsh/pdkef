import { Check, Pipette } from 'lucide-preact';
import { useEffect, useRef } from 'preact/hooks';
import { swatchInk } from './swatchInk.ts';
import { useNativeChange } from '../useNativeChange.ts';
import styles from './WhiteoutColorGroup.module.css';

/** The group's visible and accessible text, supplied by the host so each edition shows its own language. */
export interface WhiteoutColorLabels {
  group: string;
  auto: string;
  autoTitle: string;
  pipette: string;
  /** Contains {color}. */
  useColorTemplate: string;
  customColor: string;
}

export interface WhiteoutColorGroupProps {
  labels: WhiteoutColorLabels;
  /** The whiteout's colour, '#rrggbb' (anything else reads as white). */
  color: string;
  /** True when the colour follows the page around the box. */
  auto: boolean;
  eyedropping: boolean;
  /** Most recent first, '#rrggbb'. */
  recentColors?: readonly string[];
  onToggleEyedropper: () => void;
  onMatchPage: () => void;
  onPickColor: (color: string) => void;
  /** Paints a colour on the box's DOM only (no state, no undo step): the live preview, and its undo. */
  paintPreview: (color: string) => void;
}

const HEX = /^#[0-9a-f]{6}$/i;

const MAX_RECENTS = 3;

/** The current colour first (when the box is not auto), then the recents: lowercase, deduped, at most three. */
export function shownRecents(current: string | null, recents: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of [...(current && HEX.test(current) ? [current] : []), ...recents]) {
    const hex = c.toLowerCase();
    if (!HEX.test(hex) || seen.has(hex)) continue;
    seen.add(hex);
    out.push(hex);
  }
  return out.slice(0, MAX_RECENTS);
}

/** The whiteout colour group: Auto, eyedropper, recent colours and a native colour input. */
export default function WhiteoutColorGroup({
  labels, color, auto, eyedropping, recentColors = [], onToggleEyedropper, onMatchPage, onPickColor, paintPreview,
}: WhiteoutColorGroupProps) {
  const hex = HEX.test(color) ? color : '#ffffff';

  // The picker previews live: `input` only paints the box's DOM (no state, no undo step). The
  // pick commits once, from the native `change` (preact/compat rewrites onChange to `input`, which
  // fires on every drag step). `blur` and unmount settle a pick whose `change` never arrived, e.g.
  // the box is deselected as the picker closes. A pick equal to the committed colour commits
  // nothing and undoes the preview paint.
  const colorInput = useRef<HTMLInputElement>(null);
  const pickRef = useRef(onPickColor);
  pickRef.current = onPickColor;
  const paintRef = useRef(paintPreview);
  paintRef.current = paintPreview;
  const committed = useRef(hex);
  committed.current = hex;
  const pending = useRef(false);
  const reconcile = (el: HTMLInputElement) => {
    if (el.value.toLowerCase() !== committed.current.toLowerCase()) {
      pickRef.current(el.value);
      // A blur then a change with no render between must not commit twice.
      committed.current = el.value.toLowerCase();
    } else paintRef.current(committed.current);
    pending.current = false;
  };
  const reconcileRef = useRef(reconcile);
  reconcileRef.current = reconcile;
  useNativeChange(colorInput, (el) => reconcileRef.current(el), []);
  useEffect(() => {
    const el = colorInput.current;
    if (!el) return undefined;
    const onBlur = () => { if (pending.current) reconcileRef.current(el); };
    el.addEventListener('blur', onBlur);
    return () => {
      el.removeEventListener('blur', onBlur);
      if (pending.current) reconcileRef.current(el);
    };
  }, []);
  // Uncontrolled: a parent re-render while the native picker is open must not re-assert the
  // committed colour over a pick in flight. The input follows the committed colour only when idle.
  useEffect(() => {
    if (colorInput.current && !pending.current) colorInput.current.value = hex;
  }, [hex]);
  const previewColor = (e: Event) => {
    paintPreview((e.currentTarget as HTMLInputElement).value);
    pending.current = true;
  };
  const recents = shownRecents(auto ? null : color, recentColors);

  return (
    <div className={styles.group} role="group" aria-label={labels.group}>
      <button
        type="button"
        className={styles.auto}
        data-whiteout-color-auto
        aria-pressed={auto}
        title={labels.autoTitle}
        onClick={onMatchPage}
      >
        <span className={styles.autoFace}>{labels.auto}</span>
      </button>
      <button
        type="button"
        className={styles.eyedropper}
        data-whiteout-color-eyedropper
        aria-pressed={eyedropping}
        aria-label={labels.pipette}
        title={labels.pipette}
        onClick={onToggleEyedropper}
      >
        <Pipette size={18} />
      </button>
      {recents.map((c) => {
        const pressed = !auto && c === color.toLowerCase();
        return (
          <button
            key={c}
            type="button"
            className={styles.recent}
            data-whiteout-color-recent={c}
            aria-pressed={pressed}
            aria-label={labels.useColorTemplate.replace('{color}', c)}
            title={c}
            onClick={() => onPickColor(c)}
          >
            <span className={styles.recentFace} ref={(el) => { if (el) el.style.setProperty('--swatch', c); }}>
              {pressed && (
                <span className={swatchInk(c) === 'dark' ? styles.inkDark : styles.inkLight}>
                  <Check size={14} strokeWidth={3} />
                </span>
              )}
            </span>
          </button>
        );
      })}
      <label className={styles.custom} data-whiteout-color-custom title={labels.customColor}>
        <span className={styles.wheel} />
        <input
          type="color"
          className={styles.native}
          aria-label={labels.customColor}
          ref={colorInput}
          onInput={previewColor}
        />
      </label>
    </div>
  );
}
