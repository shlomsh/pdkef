import { useState } from 'preact/hooks';
import type { ComponentChildren, JSX, Ref } from 'preact';
import { forwardRef } from 'preact/compat';
import { Bug, Ellipsis } from 'lucide-preact';
import Popover from '#shell/Popover.tsx';
import { CommentIcon, HighlightIcon } from '#editor-ui/toolIcons.tsx';
import { useDoubleTap } from '#editor-ui/hooks/toolArming.js';
import styles from '#editor-ui/SignToolbar.module.css';
import controlStyles from '#editor-ui/EditorControls.module.css';
import type { SignMessages } from '#editor/registry/messages.ts';
import type { SignToolType } from '#editor/model/editorModel.ts';
import { toolButtonProps } from './toolButtonProps.ts';

/** The tools that live behind the More button (SIGN-49). @testSeam */
export type MoreTool = 'highlight' | 'comment' | 'ellipse' | 'rectangle' | 'line';
/** @testSeam */
export const MORE_TOOLS: readonly MoreTool[] = ['highlight', 'comment', 'ellipse', 'rectangle', 'line'];

export function isMoreTool(tool: string | null | undefined): tool is MoreTool {
  return tool != null && (MORE_TOOLS as readonly string[]).includes(tool);
}

/** What the More button says: the armed tool's name, or More when none is. */
export function moreLabelFor(tool: MoreTool | null, t: SignMessages): string {
  switch (tool) {
    case 'highlight': return t.highlightLabel;
    case 'comment': return t.commentToolLabel;
    case 'ellipse': return t.ellipseLabel;
    case 'rectangle': return t.rectangleLabel;
    case 'line': return t.lineLabel;
    default: return t.moreButton;
  }
}

function EllipseIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
      <ellipse cx="12" cy="12" rx="10" ry="7" />
    </svg>
  );
}
function RectangleIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
      <rect x="3" y="6" width="18" height="12" rx="2" />
    </svg>
  );
}
function LineIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
      <line x1="4" y1="20" x2="20" y2="4" />
    </svg>
  );
}

function iconFor(tool: MoreTool | null, size: number): ComponentChildren {
  switch (tool) {
    case 'highlight': return <HighlightIcon size={size} />;
    case 'comment': return <CommentIcon size={size} />;
    case 'ellipse': return <EllipseIcon size={size} />;
    case 'rectangle': return <RectangleIcon size={size} />;
    case 'line': return <LineIcon size={size} />;
    default: return <Ellipsis size={size} stroke-width={2} aria-hidden="true" />;
  }
}

type MoreToolsMenuProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, 'onPick'> & {
  t: SignMessages;
  selectedTool: SignToolType | null;
  toolLocked: boolean;
  onPick: (tool: MoreTool, event: MouseEvent) => void;
  onLock: (tool: MoreTool) => void;
  feedbackHref: string;
};

// forwardRef: ArmHint clones its child with a ref and hover/focus props for the hint's anchor,
// so both land on the root div rather than on this component.
function MoreToolsMenu({ t, selectedTool, toolLocked, onPick, onLock, feedbackHref, ...rootProps }: MoreToolsMenuProps, ref: Ref<HTMLDivElement>) {
  const [open, setOpen] = useState(false);
  const [lastPicked, setLastPicked] = useState<MoreTool | null>(null);
  const isDoubleTap = useDoubleTap();

  const armed = isMoreTool(selectedTool) ? selectedTool : null;
  const label = moreLabelFor(armed, t);

  const lock = () => {
    const target = armed ?? lastPicked;
    if (!target) return;
    onLock(target);
    setOpen(false);
  };
  const pick = (tool: MoreTool) => (event: MouseEvent) => {
    setLastPicked(tool);
    setOpen(false);
    onPick(tool, event);
  };

  const item = (tool: MoreTool, text: string) => (
    <button type="button" role="menuitem" className={controlStyles['menu-item']} data-active={armed === tool ? '' : undefined} onClick={pick(tool)}>
      {iconFor(tool, 14)}
      {text}
    </button>
  );
  const describedItem = (tool: MoreTool, text: string, description: string) => (
    <button type="button" role="menuitem" className={controlStyles['menu-item']} data-active={armed === tool ? '' : undefined} onClick={pick(tool)}>
      {iconFor(tool, 16)}
      <span className={controlStyles['menu-item-text']}>
        <span>{text}</span>
        <span className={controlStyles['menu-item-desc']}>{description}</span>
      </span>
    </button>
  );

  const words: { tool: MoreTool | null; text: string }[] = [
    { tool: null, text: t.moreButton },
    ...MORE_TOOLS.map((tool) => ({ tool, text: moreLabelFor(tool, t) })),
  ];

  return (
    <div {...rootProps} ref={ref} className={styles.dropdown} onDblClick={lock}>
      <Popover
        open={open}
        onOpenChange={setOpen}
        placement="bottom-end"
        trigger={
          <button
            type="button"
            {...toolButtonProps(armed !== null, toolLocked)}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-pressed={armed !== null}
            aria-label={label}
            title={armed ? undefined : t.moreTitle}
            onClick={(e: MouseEvent) => { if (isDoubleTap('more', e, open)) lock(); }}
          >
            {iconFor(armed, 18)}
            <span className={styles.label}>
              {/* All six words share one grid cell so arming from the menu
                  swaps the word without changing the button's width. */}
              <span className={styles['label-swap']}>
                {words.map(({ tool, text }) => {
                  const current = tool === armed;
                  return (
                    <span
                      key={tool ?? 'more'}
                      className={styles['label-swap-word']}
                      data-more-word=""
                      aria-hidden={current ? undefined : 'true'}
                      data-inactive={current ? undefined : ''}
                    >
                      {text}
                    </span>
                  );
                })}
              </span>
            </span>
            <svg className={styles.chevron} width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        }
        content={
          <div role="menu" dir={t.dir} lang={t.lang} className={`${controlStyles.popover} ${controlStyles['toolbar-menu']}`}>
            {describedItem('highlight', t.highlightLabel, t.highlightDescription)}
            {describedItem('comment', t.commentToolLabel, t.commentDescription)}
            <div className={controlStyles['toolbar-menu-heading']}>{t.shapesButton}</div>
            <div className={controlStyles['menu-shapes-row']}>
              {item('ellipse', t.ellipseLabel)}
              {item('rectangle', t.rectangleLabel)}
              {item('line', t.lineLabel)}
            </div>
            <div role="separator" className={controlStyles['menu-separator']} />
            <a
              role="menuitem"
              className={controlStyles['menu-item']}
              href={feedbackHref}
              target="_blank"
              rel="noopener noreferrer"
              title={t.feedbackTitle}
              onClick={() => setOpen(false)}
            >
              <Bug size={16} aria-hidden="true" />
              <span className={controlStyles['menu-item-text']}>
                <span>{t.feedbackButton}</span>
                <span className={controlStyles['menu-item-desc']}>{t.feedbackDescription}</span>
              </span>
            </a>
          </div>
        }
      />
    </div>
  );
}

export default forwardRef(MoreToolsMenu);
