/** The pencil style's glyph: parallel hatch lines at about -41 degrees inside a small rounded square, so it reads as hatching at 18 px. */
export default function PencilGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={2}
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 17 17 8M6.5 12.5 12.5 6.5M11.5 17.5 17.5 11.5" />
    </svg>
  );
}
