/** The small chevron of the panel's menu buttons (More, Look): down, or up when the menu opens upward. */
export default function Chevron({ size = 10, up = false }: { size?: number; up?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points={up ? '6 15 12 9 18 15' : '6 9 12 15 18 9'} />
    </svg>
  );
}
