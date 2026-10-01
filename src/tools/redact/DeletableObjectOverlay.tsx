import styles from './PdfRedactTool.module.css';

export interface DeletablePdfObject {
  id: string;
  pageIndex: number;
  kind: 'image' | 'text';
  /** Text only: the words in the box, read from the page's glyphs (RED-16); absent until read. */
  preview?: string;
  /** The box in PDF user space, as the parser found it. */
  bbox?: { x: number; y: number; width: number; height: number };
  /** Images only: the XObject the PDF draws, e.g. "5 0 R" (RED-26). */
  imageRef?: string;
  rect: { left: number; top: number; width: number; height: number };
  start: number;
  end: number;
  /** RED-29: the Form XObjects from page to the stream holding the span; absent or empty for the page's own content. */
  formPath?: string[];
}

/**
 * Hover targets for the Delete tool: one invisible-until-hovered region per
 * object the PDF actually stores as a single piece (an image placement, or
 * whatever span of text the producing tool wrote in one `BT`/`ET` run).
 *
 * Only unmarked objects render here: once something is queued for deletion
 * the page is drawn without it (RED-13), so there is nothing left to target.
 */
export default function DeletableObjectOverlay({ objects, markedIds, onSelect }: {
  objects: DeletablePdfObject[];
  markedIds: ReadonlySet<string>;
  onSelect: (object: DeletablePdfObject) => void;
}) {
  return objects
    .filter((object) => !markedIds.has(object.id))
    .map((object) => (
      <div
        key={object.id}
        className={styles['delete-candidate']}
        data-delete-id={object.id}
        title={
          object.kind === 'image'
            ? 'Click to delete this image'
            : object.preview?.trim()
              ? `Click to delete: "${object.preview.trim()}"`
              : 'Click to delete this text'
        }
        style={{
          position: 'absolute',
          left: `${object.rect.left}%`,
          top: `${object.rect.top}%`,
          width: `${object.rect.width}%`,
          height: `${object.rect.height}%`,
          zIndex: 12,
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(object);
        }}
      />
    ));
}
