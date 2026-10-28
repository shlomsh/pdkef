import { useCallback, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { sanitizeOutputName } from '#lib/output/sanitizeOutputName.ts';
import { recordAction } from '#lib/telemetry/actionTrail.ts';
import { splitOutputName, fullNameOffset } from './outputNameCut.ts';
import styles from './OutputName.module.css';

// MERGE-11 (2026-09-13, Shlomi's rejection of the bordered-input look): the
// output name is a WYSIWYG span, not a button-plus-input pair. Firefox does
// not implement `contentEditable="plaintext-only"` (only Chromium and
// WebKit do), so it needs a feature-detect rather than a browser sniff:
// create a throwaway element, try to set the value, and read it back.
// Computed once per module evaluation, not per render.
function detectPlaintextOnlyContentEditable(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const probe = document.createElement('span');
    probe.contentEditable = 'plaintext-only';
    return probe.contentEditable === 'plaintext-only';
  } catch {
    // expected: feature detect, no plaintext-only support means false
    return false;
  }
}

const PLAINTEXT_ONLY_SUPPORTED = detectPlaintextOnlyContentEditable();

// Firefox's fallback is plain `contentEditable="true"`, which (unlike
// `plaintext-only`) accepts rich text on paste/drop; these insert only the
// plain-text payload, in place of the current selection.
function insertPlainTextAtSelection(text: string) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.setEndAfter(node);
  selection.removeAllRanges();
  selection.addRange(range);
}

function setNameContentEditable(el: HTMLElement, editing: boolean) {
  const value = editing ? (PLAINTEXT_ONLY_SUPPORTED ? 'plaintext-only' : 'true') : 'false';
  // Both the IDL property (what the browser's editing behaviour actually
  // reads) and the reflected attribute (some environments, jsdom included, do
  // not reliably reflect one to the other for `contenteditable`).
  el.contentEditable = value;
  el.setAttribute('contenteditable', value);
}

// A real click on a not-yet-editable element does not get the browser's own
// click-to-place-caret behaviour: this span only becomes editable inside our
// own mousedown handler, one tick too late. So a click finds its OWN offset,
// from the same clientX/clientY, via `caretRangeFromPoint` (Chromium/WebKit)
// or `caretPositionFromPoint` (Firefox). At rest a long name is two parts
// (head, tail) and editing swaps them for the full text, so the offset is read
// in the cut layout and mapped into the full name. Null falls back to the end
// of the text (never the start, which reads as if nothing happened).
function offsetAtPoint(el: HTMLElement, x: number, y: number): number | null {
  const doc = el.ownerDocument as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  let node: Node | null = null;
  let offset = 0;
  if (typeof doc.caretRangeFromPoint === 'function') {
    const range = doc.caretRangeFromPoint(x, y);
    node = range?.startContainer ?? null;
    offset = range?.startOffset ?? 0;
  } else if (typeof doc.caretPositionFromPoint === 'function') {
    const position = doc.caretPositionFromPoint(x, y);
    node = position?.offsetNode ?? null;
    offset = position?.offset ?? 0;
  }
  if (!node || !el.contains(node)) return null;
  const tail = el.querySelector('[data-name-tail]');
  const head = el.querySelector('[data-name-head]');
  if (tail?.contains(node)) return fullNameOffset(head?.textContent ?? '', 'tail', offset);
  return offset;
}

function placeCaretAtOffset(el: HTMLElement, offset: number | null) {
  const range = document.createRange();
  const text = el.firstChild;
  if (text && offset !== null) {
    range.setStart(text, Math.min(offset, text.textContent?.length ?? 0));
    range.collapse(true);
  } else {
    range.selectNodeContents(el);
    range.collapse(false);
  }
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export interface OutputNameProps {
  /** The editable part of the file name, without prefix or extension. */
  name: string;
  /** Default '.pdf'. Never editable. */
  extension?: string;
  /** aria-label of the editable name. */
  label: string;
  /** Called on commit with the sanitised text; '' means the person emptied it
   * (the name reverts to `name`, and the owner goes back to its automatic one). */
  onRename: (next: string) => void;
  /** Non-editable text before the name, e.g. 'extracted_'. */
  prefix?: string;
  /** Meta after the file name ("· 4 pages"); the coarse-pointer pencil follows it. */
  children?: ComponentChildren;
  /** Reports edit mode on and off (the owner may hold focus-stealing work while true). */
  onEditingChange?: (editing: boolean) => void;
  /** Phone widths: let a long name wrap instead of ellipsising (Merge's heading). */
  wrapOnPhone?: boolean;
}

/**
 * The output file name as a WYSIWYG heading part: click to edit in place,
 * Enter or blur commits, Escape reverts, paste is plain text. Renders a
 * fragment (the name isolate, the children, a pencil) for its owner's flex
 * heading; one line, a long name is cut in the middle first.
 */
export default function OutputName({
  name, extension = '.pdf', label, onRename, prefix, children, onEditingChange, wrapOnPhone = false,
}: OutputNameProps) {
  const [editing, setEditingState] = useState(false);
  const skipNextBlurCommit = useRef(false);
  // Typing into a contenteditable node can replace its Text child with a new
  // DOM object, leaving Preact's reference pointing at a detached node.
  // Bumping the key on the way OUT of edit mode (never in, which would drop the
  // caret just placed) makes Preact mount a fresh span from the current name.
  const remountKey = useRef(0);
  const nameRef = useRef<HTMLSpanElement | null>(null);
  // What to select once the full name is in the DOM (the render after `begin`).
  const pendingSelection = useRef<{ all: boolean; offset: number | null } | null>(null);

  const setEditing = useCallback((next: boolean) => {
    setEditingState(next);
    onEditingChange?.(next);
  }, [onEditingChange]);

  const begin = useCallback((selectAll: boolean, point?: { x: number; y: number }) => {
    const el = nameRef.current;
    if (!el || editing) return;
    pendingSelection.current = { all: selectAll, offset: point ? offsetAtPoint(el, point.x, point.y) : null };
    setNameContentEditable(el, true);
    setEditing(true);
    el.focus();
  }, [editing, setEditing]);

  // A layout effect, so the selection lands in the same task as the swap to
  // the full name: a passive effect ran after the person's next keystroke
  // (select-all) and moved the caret over it.
  useLayoutEffect(() => {
    const el = nameRef.current;
    const pending = pendingSelection.current;
    if (!editing || !el || !pending) return;
    pendingSelection.current = null;
    if (pending.all) {
      // Keyboard-activated: select the whole name so typing replaces it.
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    } else {
      placeCaretAtOffset(el, pending.offset);
    }
  }, [editing]);

  const commit = useCallback(() => {
    let sanitized = sanitizeOutputName(nameRef.current?.textContent ?? '');
    // The extension is shown after the name, so one the person typed too
    // ("x.pdf") would double up ("x.pdf.pdf"); drop a single trailing copy.
    if (sanitized.toLowerCase().endsWith(extension.toLowerCase())) {
      sanitized = sanitized.slice(0, sanitized.length - extension.length).trim();
    }
    setEditing(false);
    remountKey.current += 1;
    onRename(sanitized);
    recordAction('change_setting');
  }, [onRename, setEditing, extension]);

  const cancel = useCallback(() => {
    skipNextBlurCommit.current = true;
    setEditing(false);
    remountKey.current += 1;
  }, [setEditing]);

  const onBlur = useCallback(() => {
    if (skipNextBlurCommit.current) {
      skipNextBlurCommit.current = false;
      return;
    }
    commit();
  }, [commit]);

  const onMouseDown = useCallback((event: MouseEvent) => {
    begin(false, { x: event.clientX, y: event.clientY });
  }, [begin]);

  const onKeyDown = useCallback((event: KeyboardEvent) => {
    if (!editing) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        begin(true);
      }
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      (event.currentTarget as HTMLElement).blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  }, [editing, begin, cancel]);

  // A no-op wherever `plaintext-only` is supported, since the browser already restricts it.
  const onPaste = useCallback((event: ClipboardEvent) => {
    if (PLAINTEXT_ONLY_SUPPORTED) return;
    event.preventDefault();
    insertPlainTextAtSelection(event.clipboardData?.getData('text/plain') ?? '');
  }, []);

  const onDrop = useCallback((event: DragEvent) => {
    if (PLAINTEXT_ONLY_SUPPORTED) return;
    event.preventDefault();
    insertPlainTextAtSelection(event.dataTransfer?.getData('text/plain') ?? '');
  }, []);

  // At rest a long name is cut in the middle (the tail stays whole); editing
  // shows the full text as one node so the caret and typing behave natively.
  const { head, tail } = editing ? { head: name, tail: '' } : splitOutputName(name);
  const wrapClass = wrapOnPhone ? ` ${styles['wrap-on-phone']}` : '';

  return (
    <>
      {/* The prefix, the name and its extension are one file name, so one
          isolate (UX guideline 9). `<bdi>` takes its direction from the first
          strong character, which is why the name carries no `dir` of its own;
          the extension is an LTR run inside it. A prefix outside the isolate
          landed on the far side of the name on a Hebrew page. */}
      <bdi class={`${styles['doc-heading-file']}${wrapClass}`}>
        {prefix ? <span class={styles.prefix}>{prefix}</span> : null}
        <span
          key={remountKey.current}
          ref={nameRef}
          class={`${styles.name}${editing ? ` ${styles.editing}` : ''}${wrapClass}`}
          tabIndex={0}
          role={editing ? 'textbox' : undefined}
          aria-label={label}
          contentEditable={editing ? (PLAINTEXT_ONLY_SUPPORTED ? 'plaintext-only' : 'true') : 'false'}
          onMouseDown={onMouseDown}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          onPaste={onPaste}
          onDrop={onDrop}
        >
          {tail ? (
            <>
              <span class={styles['name-head']} data-name-head>{head}</span>
              <span class={styles['name-tail']} data-name-tail>{tail}</span>
            </>
          ) : head}
        </span>
        <span class={styles['doc-heading-ext']} dir="ltr">{extension}</span>
      </bdi>
      {children}
      {/* Coarse pointer only (CSS-gated): no hover to reveal the affordance. */}
      <svg class={styles['name-affordance-icon']} width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M11.3 2.3a1.3 1.3 0 0 1 1.9 1.9l-7.2 7.2-2.6.7.7-2.6 7.2-7.2Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round" />
      </svg>
    </>
  );
}
