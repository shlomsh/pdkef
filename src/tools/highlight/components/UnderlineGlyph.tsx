/** The underline "U" glyph, shared by the Marker's menu and the mark toolbar; given a thickness in pt, its bar draws at that weight. */
export default function UnderlineGlyph({ bar }: { bar?: number }) {
  return (
    <svg
      width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={2}
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
    >
      <path d="M6 4v7a6 6 0 0 0 12 0V4" />
      <path d="M4 21h16" stroke-width={bar === undefined ? 2 : 1 + bar * 0.75} />
    </svg>
  );
}
