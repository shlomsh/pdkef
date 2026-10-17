import { useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import pdfToolStyles from './PdfTool.module.css';

/**
 * The single-output "done" download link, auto-focused when it mounts. Every
 * adopting tool only ever renders this once its output exists, so mounting
 * IS the "just finished" moment - a separate status-watching useEffect
 * elsewhere (every tool had its own, all identical) is redundant with that.
 *
 * Only for the single-output shape. Split and PDF to Image branch between
 * this and a "Download all N" button for multi-file output; that's a
 * genuinely different case; they keep their own ref/focus handling for it
 * rather than adopting this component for just one of their two branches.
 *
 * `detail` (SEO-25, 2026-09-12) is an optional second, smaller line inside
 * the button - e.g. the result's size, "172.98 KB" - so far only passed by
 * PdfCompressTool (see its `downloadDetail`). It's inside the button text, so it's part of
 * the accessible name for free; every other tool passes nothing and renders
 * exactly as before. `preventScroll` on the focus call is also part of that
 * fix: the button no longer moves when a result lands, so nothing should
 * scroll the viewport to it either.
 *
 * `onClick` (MERGE-12) lets Merge count the tap itself: the browser handles
 * the download through the anchor as before, the tool only observes it.
 *
 * `autoFocus={false}` is for a tool that reruns on every option change
 * (Compress): there the result landing is not "you just finished", and taking
 * focus would pull it off the option the person is still adjusting. The
 * tool's live region still announces the result.
 *
 * `busy` (HERO-07) swaps the content for a progress look while keeping the same
 * focused anchor (aria-disabled, so a tap does nothing but the tool's own
 * handler runs first): focus is not lost when a tap starts a wait.
 */
export default function DownloadButton({ href, download, label = 'Download PDF', detail, onClick, autoFocus = true, busy }: { href: string; download: string; label?: string; detail?: string; onClick?: (event: MouseEvent) => void; autoFocus?: boolean; busy?: ComponentChildren }) {
  const ref = useRef<HTMLAnchorElement | null>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true });
  }, []);

  return (
    <a
      ref={ref}
      class={busy ? `${pdfToolStyles['tool-primary-action']} ${pdfToolStyles['is-processing']}` : pdfToolStyles['download-button']}
      href={href}
      download={download}
      aria-disabled={busy ? 'true' : undefined}
      onClick={(event) => {
        onClick?.(event);
        if (busy) event.preventDefault();
      }}
    >
      {busy ? busy : (<>
      <svg class={pdfToolStyles['download-check']} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" class={pdfToolStyles['check-circle']} />
        <path d="M7.5 12.5l3 3 6-6.5" class={pdfToolStyles['check-mark']} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
      </svg>
      <span class={pdfToolStyles['download-button-label']}>
        {label}
        {detail && <span class={pdfToolStyles['download-button-detail']}>{detail}</span>}
      </span>
      </>)}
    </a>
  );
}
