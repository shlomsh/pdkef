import { combCaretFraction } from '../../../../editor/text/comb.js';
import elementStyles from '../../../../editor-ui/EditorElement.module.css';

/** One laid-out cell, as `combLayout` (comb.js) returns it. */
interface CombCell {
  index: number;
  char: string;
  centerFraction: number;
}

/**
 * The `.text-comb` overlay: one cell per character, centred on its own
 * `centerFraction` (comb.js), drawn over the real input/textarea rather
 * than replacing it - the input stays focusable and takes the caret, this
 * is what is actually seen. Shared between TextNode.tsx (editing a placed
 * comb field) and FieldSlot.tsx (an empty slot previewing the comb it
 * would become), so the two can never drift on how a comb is drawn.
 *
 * The real input's own caret is hidden (its `.slot-comb`/comb rule sets
 * `caret-color: transparent`) because it sits at the input's own text
 * position, which is measured in unspaced characters and lands mid-field
 * instead of at the cell the next character will fill (RTL forms are the
 * common case). `caretIndex` draws the caret here instead, at the cell
 * boundary `combCaretFraction` computes - the same boundary math the guide
 * lines use, so the caret and the printed rule lines never disagree.
 */
export default function CombCells({ cells, isRtl, showGuides, visible, color, fontFamily, fontWeight, fontStyle, caretIndex = null }: {
  cells: CombCell[];
  isRtl: boolean;
  /** Editor-only guides between cells (TextNode shows them only while active). */
  showGuides: boolean;
  /** Mounted-but-hidden while a span drag is still under the comb floor. */
  visible: boolean;
  color: string;
  fontFamily: string;
  fontWeight: string | number;
  fontStyle: string;
  /** The character index the next keystroke would land at, or null while the
   * real input has no focus (no caret to show). */
  caretIndex?: number | null;
}) {
  return (
    <div
      className={elementStyles['text-comb']}
      data-editor-text-comb
      data-text-part="comb"
      aria-hidden="true"
      style={{
        display: visible ? undefined : 'none',
        fontFamily,
        fontWeight,
        fontStyle,
        color,
      }}
    >
      {/* Editor-only guides. They exist to be lined up against the rules
          printed on the page, and never reach the exported file. */}
      {showGuides && cells.slice(1).map((cell) => (
        <span
          key={`guide-${cell.index}`}
          className={elementStyles['text-comb-guide']}
          data-text-part="comb-guide"
          style={{ left: `${(isRtl ? 1 - cell.index / cells.length : cell.index / cells.length) * 100}%` }}
        />
      ))}
      {caretIndex != null && (
        <span
          className={elementStyles['text-comb-caret']}
          data-text-part="comb-caret"
          style={{ left: `${combCaretFraction(caretIndex, cells.length, isRtl) * 100}%` }}
        />
      )}
      {cells.map((cell) => (
        <span
          key={`cell-${cell.index}`}
          className={elementStyles['text-comb-cell']}
          data-text-part="comb-cell"
          style={{ left: `${cell.centerFraction * 100}%` }}
        >
          {cell.char}
        </span>
      ))}
    </div>
  );
}
