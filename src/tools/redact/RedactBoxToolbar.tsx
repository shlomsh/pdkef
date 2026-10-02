import { CopyPlus, Layers } from 'lucide-preact';
import { paintWhiteoutColor } from '../../editor/registry/redactionSurface.ts';
import BlurStrengthSlider from './BlurStrengthSlider.tsx';
import ToolbarMenu from '../../editor-ui/ToolbarMenu.tsx';
import { TrashIcon } from '../../editor-ui/toolIcons.tsx';
import type { BlurStrength } from '../../editor/model/blurStrength.ts';
import { englishSignMessages as t, formatMessage } from '../../i18n/toolMessages';
import type { RedactBoxElement, RedactStrokeElement } from './redactElements.ts';
import WhiteoutColorGroup, { shownRecents } from '../../editor-ui/whiteout/WhiteoutColorGroup.tsx';
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

export { shownRecents };

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
        <WhiteoutColorGroup
          elementId={element.id}
          color={color}
          auto={auto}
          eyedropping={eyedropping}
          recentColors={recentColors}
          onToggleEyedropper={onToggleEyedropper}
          onMatchPage={onMatchPage}
          onPickColor={onPickColor}
          paintPreview={(c) => paintWhiteoutColor(document, element.id, c)}
        />
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
