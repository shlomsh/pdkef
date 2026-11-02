/*
 * Small SVG icons shared by more than one tool's toolbar. Kept byte-for-byte
 * identical to what each call site rendered before this module existed -
 * moving them here is purely so Redact and Sign (and ElementToolbar and
 * EditorPageHeader) stop maintaining separate copies of the same markup.
 */

/* One scaffold for the three cover tools: a top line, a middle band, a bottom
 * line - a line of text with something over it. Blur, Blackout and Whiteout
 * vary only the band (soft, solid, hollow), so the row reads as three results
 * of the same act. Redact and Sign render the same Whiteout; Sign passes the
 * heavier stroke its own toolbar icons use, since there it stands alone. */
export function WhiteoutIcon({ size = 18, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={strokeWidth} stroke-linecap="round" stroke-linejoin="round">
      <line x1="4" y1="5" x2="15" y2="5" />
      <rect x="3" y="9.5" width="18" height="5" rx="1" />
      <line x1="4" y1="19" x2="12" y2="19" />
    </svg>
  );
}

/* SIGN-46: a chisel-tip highlighter, tilted, with a short swipe under its tip. */
export function HighlightIcon({ size = 18, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={strokeWidth} stroke-linecap="round" stroke-linejoin="round">
      <path d="m15 3 6 6-8.5 8.5-6-6z" />
      <path d="m6.5 11.5-2.5 5.5 4 1 3.5-1.5" />
      <line x1="13" y1="21" x2="21" y2="21" />
    </svg>
  );
}

/* SIGN-44: a speech bubble with two lines of text. */
export function CommentIcon({ size = 18, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={strokeWidth} stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L3 20.5l1.5-4.9A8 8 0 1 1 21 12z" />
      <line x1="8.5" y1="10" x2="15.5" y2="10" />
      <line x1="8.5" y1="14" x2="13" y2="14" />
    </svg>
  );
}

/* Blackout's bar, softened: the band is drawn with a real Gaussian blur, which
 * is what the tool does to the page. The filter region is padded so the blur is
 * not clipped at the band's edge; the id is fixed because every instance
 * defines the same filter. */
export function BlurToolIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <defs>
        <filter id="pdkef-blur-icon" x="-25%" y="-80%" width="150%" height="260%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
      </defs>
      <line x1="4" y1="5" x2="15" y2="5" />
      <rect x="4" y="9.5" width="16" height="5" rx="1" fill="currentColor" stroke="none" filter="url(#pdkef-blur-icon)" />
      <line x1="4" y1="19" x2="12" y2="19" />
    </svg>
  );
}

/* A solid bar over a line of text: Blackout hides what is under the box. */
export function BlackoutToolIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="4" y1="5" x2="15" y2="5" />
      <rect x="3" y="9.5" width="18" height="5" rx="1" fill="currentColor" stroke="none" />
      <line x1="4" y1="19" x2="12" y2="19" />
    </svg>
  );
}

/* An eraser: Delete takes the object out of the file itself. */
export function EraserIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
      <path d="M22 21H7" />
      <path d="m13.3 4 5.3 5.3" />
    </svg>
  );
}

/*
 * ElementToolbar's trash is 14px, stroke-width 2.5, no linecap/linejoin.
 * EditorPageHeader's trash is 14px, stroke-width 2, round caps/joins. `size`,
 * `strokeWidth` and `rounded` let each call site keep rendering exactly what
 * it rendered before.
 */
export function TrashIcon({
  size = 14,
  strokeWidth = 2,
  rounded = true,
}: {
  size?: number;
  strokeWidth?: number;
  rounded?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      {...(rounded ? { 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } : {})}
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

/** A pencil (the note card's Edit), drawn to sit beside TrashIcon at the same size and stroke. */
export function PencilIcon({ size = 14, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={strokeWidth} stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

/** A clockwise quarter-turn arrow (the page header's Rotate). */
export function RotateIcon({ size = 14, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M13 8a5 5 0 1 1-1.5-3.6" />
      <path d="M13 2v3h-3" />
    </svg>
  );
}
