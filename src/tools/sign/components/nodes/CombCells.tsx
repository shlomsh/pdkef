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
 */
export default function CombCells({ cells, isRtl, showGuides, visible, color, fontFamily, fontWeight, fontStyle }: {
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
