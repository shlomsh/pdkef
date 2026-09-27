import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import Popover from '../shell/Popover.tsx';
import styles from './EditorControls.module.css';

export interface ToolbarMenuItem {
  label: string;
  onSelect: () => void;
  /** Extra attributes on the item button, e.g. a `data-editor-*` hook. */
  attrs?: Record<string, string | boolean>;
}

/**
 * A toolbar button that opens a short list of actions (RED-03): the linked
 * set's menu and the delete-scope choice on a repeated box. Each item fires
 * once and closes the menu. Pickers with a selected value (colour,
 * thickness, blur strength) keep their own components.
 */
export default function ToolbarMenu({
  title,
  triggerClassName,
  triggerAttrs,
  triggerContent,
  heading,
  items,
}: {
  title: string;
  triggerClassName: string;
  triggerAttrs?: Record<string, string | boolean>;
  triggerContent: ComponentChildren;
  heading?: string;
  items: ToolbarMenuItem[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="bottom"
      trigger={
        <button
          type="button"
          className={triggerClassName}
          title={title}
          aria-haspopup="true"
          aria-expanded={open}
          {...triggerAttrs}
        >
          {triggerContent}
        </button>
      }
      content={
        <div className={`${styles.popover} ${styles['toolbar-menu']}`} role="menu">
          {heading && <div className={styles['toolbar-menu-heading']}>{heading}</div>}
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={styles['menu-item']}
              onClick={() => {
                item.onSelect();
                setOpen(false);
              }}
              {...item.attrs}
            >
              {item.label}
            </button>
          ))}
        </div>
      }
    />
  );
}
