import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { useNativeChange } from './useNativeChange.ts';
import styles from './ColorWheelInput.module.css';

interface ColorWheelInputProps extends Omit<JSX.HTMLAttributes<HTMLLabelElement>, 'onChange' | 'onInput' | 'value'> {
  /** The committed colour, '#rrggbb' (anything else reads as white). */
  value: string;
  /** The accessible name and the tooltip, e.g. "Choose a color". */
  label: string;
  /** Called on every drag step of the native picker: paint the live preview only, commit nothing. */
  onPreview?: (hex: string) => void;
  /** Called once per pick. A pick equal to `value` commits nothing and undoes the preview (`onPreview(value)`). */
  onCommit: (hex: string) => void;
  /** Rings the wheel: the colour in force is one only the wheel can name. */
  pressed?: boolean;
}

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * The app's "choose any color" control: a hue wheel over a native colour input. It previews on `input` and
 * commits once from the native `change` (preact/compat rewrites onChange to `input`, which fires on every drag
 * step). `blur` and unmount settle a pick whose `change` never arrived, e.g. the host is deselected as the
 * picker closes. Uncontrolled while a pick is in flight, so a parent re-render never re-asserts the old colour.
 */
export default function ColorWheelInput({ value, label, onPreview, onCommit, pressed, children, ...rest }: ColorWheelInputProps) {
  const hex = HEX.test(value) ? value : '#ffffff';
  const colorInput = useRef<HTMLInputElement>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  const previewRef = useRef(onPreview);
  previewRef.current = onPreview;
  const committed = useRef(hex);
  committed.current = hex;
  const pending = useRef(false);
  const reconcile = (el: HTMLInputElement) => {
    if (el.value.toLowerCase() !== committed.current.toLowerCase()) {
      commitRef.current(el.value);
      // A blur then a change with no render between must not commit twice.
      committed.current = el.value.toLowerCase();
    } else previewRef.current?.(committed.current);
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
  useEffect(() => {
    if (colorInput.current && !pending.current) colorInput.current.value = hex;
  }, [hex]);

  return (
    <label className={styles.custom} title={label} data-color-wheel data-pressed={pressed ? '' : undefined} {...rest}>
      {children ?? <span className={styles.wheel} />}
      <input
        type="color"
        className={styles.native}
        aria-label={label}
        ref={colorInput}
        onInput={(e) => {
          previewRef.current?.((e.currentTarget as HTMLInputElement).value);
          pending.current = true;
        }}
      />
    </label>
  );
}
