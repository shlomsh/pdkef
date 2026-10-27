import type { ComponentChildren, JSX, Ref } from 'preact';
import styles from './PageWorkspace.module.css';

export { styles as workspaceStyles };

interface PageWorkspaceProps {
  /** Attributes for the outermost element (a tool's ready / restored hooks). */
  rootAttrs?: JSX.HTMLAttributes<HTMLDivElement> & Record<string, unknown>;
  /** Below 1024px, above the pages: the files as a sticky bar (chips, quiet Download, done strip). */
  phoneBar?: ComponentChildren;
  /** Below 1024px, under the bar: the controls the rail carries on desktop. */
  phoneControls?: ComponentChildren;
  /** Coarse-pointer drag hint, already localized; nothing renders when empty. */
  touchHint?: string | false;
  /** The document heading's content. */
  heading: ComponentChildren;
  /** The header's right-hand slot: Undo and Redo, a one-off sentence. */
  headerStatus?: ComponentChildren;
  /** Under the header: errors, then the PageGrid. */
  children?: ComponentChildren;
  /** The rail's scrolling region (hidden below 1024px). */
  railContent?: ComponentChildren;
  /** The rail's pinned region: the Download element and what goes with it. */
  railPinned?: ComponentChildren;
  /** The stage fit measures the layout and the document column. */
  layoutRef?: Ref<HTMLDivElement>;
  documentRef?: Ref<HTMLDivElement>;
}

/**
 * The frame around a tool's page grid (GRID-02, moved from Merge): a document
 * column (header, then the pages) beside a rail, with the phone bar above on
 * narrow screens. Every region is a slot; the tool owns what goes in it.
 */
export default function PageWorkspace({
  rootAttrs,
  phoneBar,
  phoneControls,
  touchHint,
  heading,
  headerStatus,
  children,
  railContent,
  railPinned,
  layoutRef,
  documentRef,
}: PageWorkspaceProps) {
  return (
    <div class={styles.layout} {...rootAttrs}>
      {phoneBar}
      {phoneControls}
      {touchHint && <p class={styles['touch-drag-hint']}>{touchHint}</p>}

      <div class={styles.main} ref={layoutRef}>
        <div class={styles.document} ref={documentRef}>
          {/* A state that stands in for the document (a locked file) has no heading: no empty row above it. */}
          {(heading != null || headerStatus != null) && (
            <div class={styles['doc-header']}>
              <div class={styles['heading-row']}>{heading}</div>
              <div class={styles['doc-header-right']}>{headerStatus}</div>
            </div>
          )}
          {children}
        </div>

        <div class={styles.rail} data-rail>
          <div class={styles['rail-scroll']}>{railContent}</div>
          <div class={styles['rail-pinned']} data-rail-pinned>{railPinned}</div>
        </div>
      </div>
    </div>
  );
}
