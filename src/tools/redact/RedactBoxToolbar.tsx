import { Check, Pipette } from 'lucide-preact';
import { useEffect, useRef } from 'preact/hooks';
import BlurStrengthSlider from './BlurStrengthSlider.tsx';
import ToolbarMenu from '../../editor-ui/ToolbarMenu.tsx';
import { TrashIcon } from '../../editor-ui/toolIcons.tsx';
import type { BlurStrength } from '../../editor/model/blurStrength.ts';
import { englishSignMessages as t, formatMessage } from '../../i18n/toolMessages';
import type { RedactBoxElement, RedactStrokeElement } from './redactElements.ts';
import { swatchInk } from './swatchInk.ts';
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
}

const HEX = /^#[0-9a-f]{6}$/i;

const pagesIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="6" y="2" width="14" height="16" rx="2" />
    <path d="M4 6v14a2 2 0 0 0 2 2h12" />
  </svg>
);

/**
 * RED-51: the groups inside the selected box's pill. A fragment, so the pill
 * (RedactBoxBar on a phone, a floating wrapper on desktop) wraps whole groups.
 */
export default function RedactBoxToolbar({
  element, eyedropping, onToggleEyedropper, onMatchPage, onPickColor, onChangeStrength,
  onDuplicate, onDelete, onRepeatOnEveryPage, repeatGroupSize, onUnlinkFromGroup,
  onRemoveGroup, findSetSize, onRemoveFindSet,
}: RedactBoxToolbarProps) {
  const isWhiteout = element.type === 'whiteout' || element.type === 'whiteoutStroke';
  const isBlur = element.type === 'blur' || element.type === 'blurStroke';
  const auto = isWhiteout && (element as { colorMode?: string }).colorMode === 'auto';
  const color = isWhiteout ? String((element as { color?: unknown }).color ?? '') : '';
  const hex = HEX.test(color) ? color : '#ffffff';
  const ink = swatchInk(hex);

  // Listen for the native `change` (fires once, when the picker closes). preact/compat maps
  // onChange to `input`, which fires on every drag step and split one pick into several undo steps.
  const colorInput = useRef<HTMLInputElement>(null);
  const pickRef = useRef(onPickColor);
  pickRef.current = onPickColor;
  useEffect(() => {
    const el = colorInput.current;
    if (!el) return undefined;
    const onNativeChange = () => pickRef.current(el.value);
    el.addEventListener('change', onNativeChange);
    return () => el.removeEventListener('change', onNativeChange);
  }, [isWhiteout]);

  const linked = repeatGroupSize !== undefined && repeatGroupSize >= 2;
  const groupLabel = linked ? formatMessage(t.repeatGroupTitleTemplate, { n: repeatGroupSize }) : '';
  const inFindSet = findSetSize !== undefined && findSetSize >= 2 && !!onRemoveFindSet;
  const hasDeleteScope = (linked && onRemoveGroup) || inFindSet;
  const trashIcon = <TrashIcon strokeWidth={2.5} rounded={false} />;
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
          <label className={styles.custom} data-redact-color-custom title="Choose any colour">
            <span className={styles.wheel} />
            {!auto && (
              <span
                className={`${styles.swatch} ${ink === 'dark' ? styles.inkDark : styles.inkLight}`}
                data-redact-color-swatch
                ref={(el) => { if (el) el.style.setProperty('--swatch', hex); }}
              >
                <Check size={14} strokeWidth={3} />
              </span>
            )}
            <input
              type="color"
              className={styles.native}
              aria-label="Choose any colour"
              value={hex}
              ref={colorInput}
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
            labels={{ title: t.blurStrengthTitle, lighter: t.blurStrengthLighter, stronger: t.blurStrengthStronger, defaultTick: t.blurStrengthDefault }}
          />
        </div>
      )}
      <div className={styles.group}>
        <button type="button" className={styles.button} onClick={() => onDuplicate()} title={t.duplicateElementTitle}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
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
