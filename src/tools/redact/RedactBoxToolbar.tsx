import { Check, CopyPlus, Layers, Pipette } from 'lucide-preact';
import { useEffect, useRef } from 'preact/hooks';
import { paintWhiteoutColor } from '../../editor/registry/redactionSurface.ts';
import BlurStrengthSlider from './BlurStrengthSlider.tsx';
import ToolbarMenu from '../../editor-ui/ToolbarMenu.tsx';
import { TrashIcon } from '../../editor-ui/toolIcons.tsx';
import type { BlurStrength } from '../../editor/model/blurStrength.ts';
import { englishSignMessages as t, formatMessage } from '../../i18n/toolMessages';
import type { RedactBoxElement, RedactStrokeElement } from './redactElements.ts';
import { swatchInk } from './swatchInk.ts';
import { useNativeChange } from './useNativeChange.ts';
import styles from './RedactBoxToolbar.module.css';

export interface RedactBoxToolbarProps {
  element: RedactBoxElement | RedactStrokeElement;
  eyedropping: boolean;
  onToggleEyedropper: () => void;
  onMatchPage: () => void;
  onPickColor: (color: string) => void;
  onChangeStrength: (strength: BlurStrength) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRepeatOnEveryPage?: () => void;
  repeatGroupSize?: number;
  onUnlinkFromGroup?: () => void;
  onRemoveGroup?: () => void;
  findSetSize?: number;
  onRemoveFindSet?: () => void;
  /** Most recent first, '#rrggbb'. */
  recentColors?: readonly string[];
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

const pagesIcon = <Layers size={18} />;

/**
 * RED-51: the groups inside the selected box's pill. A fragment, so the pill
 * (RedactBoxBar on a phone, a floating wrapper on desktop) wraps whole groups.
 */
export default function RedactBoxToolbar({
  element, eyedropping, onToggleEyedropper, onMatchPage, onPickColor, onChangeStrength,
  onDuplicate, onDelete, onRepeatOnEveryPage, repeatGroupSize, onUnlinkFromGroup,
  onRemoveGroup, findSetSize, onRemoveFindSet, recentColors = [],
}: RedactBoxToolbarProps) {
  const isWhiteout = element.type === 'whiteout' || element.type === 'whiteoutStroke';
  const isBlur = element.type === 'blur' || element.type === 'blurStroke';
  const auto = isWhiteout && (element as { colorMode?: string }).colorMode === 'auto';
  const color = isWhiteout ? String((element as { color?: unknown }).color ?? '') : '';
  const hex = HEX.test(color) ? color : '#ffffff';

  // The picker previews live: `input` only paints the box's DOM (no state, no undo step). The
  // pick commits once, from the native `change` (preact/compat rewrites onChange to `input`, which
  // fires on every drag step). `blur` and unmount settle a pick whose `change` never arrived, e.g.
  // the box is deselected as the picker closes. A pick equal to the committed colour commits
  // nothing and undoes the preview paint.
  const colorInput = useRef<HTMLInputElement>(null);
  const pickRef = useRef(onPickColor);
  pickRef.current = onPickColor;
  const committed = useRef(hex);
  committed.current = hex;
  const pending = useRef(false);
  const reconcile = (el: HTMLInputElement) => {
    if (el.value.toLowerCase() !== committed.current.toLowerCase()) pickRef.current(el.value);
    else paintWhiteoutColor(document, element.id, committed.current);
    pending.current = false;
  };
  const reconcileRef = useRef(reconcile);
  reconcileRef.current = reconcile;
  useNativeChange(colorInput, (el) => reconcileRef.current(el), [isWhiteout]);
  useEffect(() => {
    const el = colorInput.current;
    if (!el) return undefined;
    const onBlur = () => { if (pending.current) reconcileRef.current(el); };
    el.addEventListener('blur', onBlur);
    return () => {
      el.removeEventListener('blur', onBlur);
      if (pending.current) reconcileRef.current(el);
    };
  }, [isWhiteout]);
  const previewColor = (e: Event) => {
    paintWhiteoutColor(document, element.id, (e.currentTarget as HTMLInputElement).value);
    pending.current = true;
  };
  const recents = isWhiteout ? shownRecents(auto ? null : color, recentColors) : [];

  const linked = repeatGroupSize !== undefined && repeatGroupSize >= 2;
  const groupLabel = linked ? formatMessage(t.repeatGroupTitleTemplate, { n: repeatGroupSize }) : '';
  const inFindSet = findSetSize !== undefined && findSetSize >= 2 && !!onRemoveFindSet;
  const hasDeleteScope = (linked && onRemoveGroup) || inFindSet;
  const trashIcon = <TrashIcon size={18} strokeWidth={2} rounded={false} />;
  const wide = `${styles.button} ${styles.buttonWide}`;
  const dangerClass = `${styles.button} ${styles.danger}`;

  return (
    <>
      {isWhiteout && (
        <div className={styles.group} role="group" aria-label="Whiteout colour">
          <button
            type="button"
            className={styles.auto}
            data-redact-color-auto
            aria-pressed={auto}
            title="Match the page around the box"
            onClick={onMatchPage}
          >
            <span className={styles.autoFace}>Auto</span>
          </button>
          <button
            type="button"
            className={styles.eyedropper}
            data-redact-color-eyedropper
            aria-pressed={eyedropping}
            aria-label="Pick a colour from the page"
            title="Pick a colour from the page"
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
                data-redact-color-recent={c}
                aria-pressed={pressed}
                aria-label={`Use ${c}`}
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
          <label className={styles.custom} data-redact-color-custom title="Choose any colour">
            <span className={styles.wheel} />
            <input
              type="color"
              className={styles.native}
              aria-label="Choose any colour"
              value={hex}
              ref={colorInput}
              onInput={previewColor}
            />
          </label>
        </div>
      )}
      {isBlur && (
        <div className={styles.group}>
          <BlurStrengthSlider
            elementId={element.id}
            value={(element as { strength?: unknown }).strength}
            onChange={(strength) => onChangeStrength(strength)}
            labels={{ title: t.blurStrengthTitle, lighter: t.blurStrengthLighter, stronger: t.blurStrengthStronger }}
          />
        </div>
      )}
      <div className={styles.group}>
        <button type="button" className={wide} onClick={() => onDuplicate()} title={t.duplicateElementTitle}>
          <CopyPlus size={18} /><span className={styles.label}>{t.duplicateElementTitle}</span>
        </button>
        {linked ? (
          <ToolbarMenu
            title={groupLabel}
            heading={groupLabel}
            triggerClassName={wide}
            triggerAttrs={{ 'data-editor-repeat-group-trigger': true }}
            triggerContent={<>{pagesIcon}<span className={styles.label}>{groupLabel}</span></>}
            items={[
              ...(onRepeatOnEveryPage
                ? [{ label: t.repeatGroupFill, onSelect: onRepeatOnEveryPage, attrs: { 'data-editor-repeat-group-fill': true } }]
                : []),
              ...(onUnlinkFromGroup
                ? [{ label: t.repeatGroupUnlink, onSelect: onUnlinkFromGroup, attrs: { 'data-editor-repeat-group-unlink': true } }]
                : []),
            ]}
          />
        ) : onRepeatOnEveryPage && (
          <button
            type="button"
            className={wide}
            onClick={onRepeatOnEveryPage}
            title={t.repeatOnEveryPageTitle}
            data-editor-repeat-every-page
          >
            {pagesIcon}<span className={styles.label}>{t.repeatOnEveryPageLabel}</span>
          </button>
        )}
        <span className={styles.separator} aria-hidden="true" />
        {hasDeleteScope ? (
          <ToolbarMenu
            title={t.deleteElementTitle}
            triggerClassName={dangerClass}
            triggerAttrs={{ 'data-editor-delete-scope-trigger': true }}
            triggerContent={trashIcon}
            items={[
              linked
                ? { label: t.deleteThisPage, onSelect: onDelete, attrs: { 'data-editor-delete-this-page': true } }
                : { label: t.deleteThisBox, onSelect: onDelete, attrs: { 'data-editor-delete-this-box': true } },
              ...(linked && onRemoveGroup
                ? [{ label: formatMessage(t.deleteAllPagesTemplate, { n: repeatGroupSize }), onSelect: onRemoveGroup, attrs: { 'data-editor-delete-all-pages': true } }]
                : []),
              ...(inFindSet
                ? [{ label: formatMessage(t.deleteFindSetTemplate, { n: findSetSize }), onSelect: onRemoveFindSet!, attrs: { 'data-editor-delete-find-set': true } }]
                : []),
            ]}
          />
        ) : (
          <button type="button" className={dangerClass} onClick={onDelete} title={t.deleteElementTitle}>
            {trashIcon}
          </button>
        )}
      </div>
    </>
  );
}
