/*
 * Small SVG icons shared by more than one tool's toolbar. Kept byte-for-byte
 * identical to what each call site rendered before this module existed -
 * moving them here is purely so Redact and Sign (and ElementToolbar and
 * EditorPageHeader) stop maintaining separate copies of the same markup.
 */

/* The "blank slot": a top line, corner marks where the middle bar was, a
 * bottom line - the same line-of-text grammar as Blur and Blackout, where
 * the middle bar is painted over and blank. Redact and Sign render the
 * identical icon so the same tool looks the same in both editors. */
export function WhiteoutIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
      <line x1="4" y1="5" x2="15" y2="5" stroke-width="2" />
      <path d="M3 11.5V9.5h2.5M18.5 9.5H21v2M21 12.5v2h-2.5M5.5 14.5H3v-2" stroke-width="1.6" />
      <line x1="4" y1="19" x2="12" y2="19" stroke-width="2" />
    </svg>
  );
}

/* A droplet: Blur softens what is under the box. */
export function BlurToolIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2c4 5 7 8.5 7 12.5a7 7 0 1 1-14 0C5 10.5 8 7 12 2Z" />
    </svg>
  );
}

/* A solid bar over a line of text: Blackout hides what is under the box. */
export function BlackoutToolIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
      <line x1="4" y1="5" x2="15" y2="5" stroke-width="2" />
      <rect x="3" y="9.5" width="18" height="5" rx="1" fill="currentColor" stroke="none" />
      <line x1="4" y1="19" x2="12" y2="19" stroke-width="2" />
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
