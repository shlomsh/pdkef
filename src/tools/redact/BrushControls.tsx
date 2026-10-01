import { Pipette } from 'lucide-preact';
import ColorPickerMenu from '../../editor-ui/ColorPickerMenu.tsx';
import type { DocumentStyle } from '../../editor/model/documentStyle.ts';
import styles from './BrushControls.module.css';

// RED-32: the Box / Brush choice inside Blur and Whiteout, the brush's size,
// and (whiteout only) its colour. No new top-level tool buttons: this row sits
// under the toolbar while Blur or Whiteout is armed.

export type BrushMode = 'box' | 'brush';
export interface BrushSettings { mode: BrushMode; size: number }

export const BRUSH_MIN_SIZE = 2;
export const BRUSH_MAX_SIZE = 40;
export const DEFAULT_BRUSH: BrushSettings = { mode: 'box', size: 12 };

/** Quick colours: white, a warm paper grey, light blue. Values, not styling. */
export const QUICK_COLORS: readonly { color: string; label: string }[] = [
  { color: '#ffffff', label: 'White' },
  { color: '#ecebe6', label: 'Paper grey' },
  { color: '#dbeafe', label: 'Light blue' },
];

export function clampBrushSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BRUSH.size;
  return Math.min(BRUSH_MAX_SIZE, Math.max(BRUSH_MIN_SIZE, Math.round(value)));
}

/** A document's brush: its own carried choice, else the person's latest choice
 * in any document (the app-wide style), else the default. Pure, so opening a
 * document never re-derives it anywhere else. */
export function resolveBrush(carried: Partial<DocumentStyle> | undefined, appStyle: Partial<DocumentStyle>): BrushSettings {
  const mode = carried?.brushMode ?? appStyle.brushMode ?? DEFAULT_BRUSH.mode;
  const size = carried?.brushSize ?? appStyle.brushSize ?? DEFAULT_BRUSH.size;
  return { mode, size: clampBrushSize(size) };
}

/** The document-style keys that hold a brush choice. */
export function brushStyleOf(settings: BrushSettings): Partial<DocumentStyle> {
  return { brushMode: settings.mode, brushSize: settings.size };
}

export default function BrushControls({
  tool,
  settings,
  onSettings,
  color,
  onColor,
  eyedropping,
  onToggleEyedropper,
}: {
  tool: 'blur' | 'whiteout';
  settings: BrushSettings;
  onSettings: (next: BrushSettings) => void;
  color: string;
  onColor: (color: string) => void;
  eyedropping: boolean;
  onToggleEyedropper: () => void;
}) {
  const brush = settings.mode === 'brush';
  const modeButton = (mode: BrushMode, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={settings.mode === mode}
      className={`${styles.seg}${settings.mode === mode ? ` ${styles.on}` : ''}`}
      onClick={() => onSettings({ ...settings, mode })}
    >
      {label}
    </button>
  );

  return (
    <div className={styles.row} role="group" aria-label={`${tool === 'blur' ? 'Blur' : 'Whiteout'} shape`} data-brush-controls>
      <div className={styles.segmented} role="radiogroup" aria-label="Shape">
        {modeButton('box', 'Box')}
        {modeButton('brush', 'Brush')}
      </div>
      {brush && (
        <label className={styles.size}>
          <span>Size</span>
          <input
            type="range"
            min={BRUSH_MIN_SIZE}
            max={BRUSH_MAX_SIZE}
            step={1}
            value={settings.size}
            aria-label="Brush size"
            onInput={(e) => onSettings({ ...settings, size: clampBrushSize(Number((e.target as HTMLInputElement).value)) })}
          />
          <output>{settings.size}</output>
        </label>
      )}
      {brush && tool === 'whiteout' && (
        <div className={styles.colors} role="group" aria-label="Whiteout colour">
          {QUICK_COLORS.map(({ color: c, label }) => (
            <button
              key={c}
              type="button"
              className={`${styles.swatch}${color === c ? ` ${styles.on}` : ''}`}
              aria-label={label}
              aria-pressed={color === c}
              title={label}
              ref={(el) => { if (el) el.style.setProperty('--swatch', c); }}
              onClick={() => onColor(c)}
            />
          ))}
          {!QUICK_COLORS.some((q) => q.color === color) && (
            <button
              type="button"
              className={`${styles.swatch} ${styles.on}`}
              aria-label="Current colour"
              aria-pressed="true"
              title="Current colour"
              ref={(el) => { if (el) el.style.setProperty('--swatch', color); }}
            />
          )}
          <ColorPickerMenu value={color} onChange={onColor} title="More colours" defaultColor="#ffffff" />
          <button
            type="button"
            className={`${styles.pipette}${eyedropping ? ` ${styles.on}` : ''}`}
            aria-pressed={eyedropping}
            aria-label="Pick a colour from the page"
            title="Pick a colour from the page"
            onClick={onToggleEyedropper}
          >
            <Pipette size={18} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
