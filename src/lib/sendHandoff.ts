import { handoffHrefOf, handoffKeyOf } from './toolIds.ts';

/** What travels: one file, or a `files` list in pick order; `from` names the sending tool for a detour. */
type HandoffFile = { fileName: string; fileType?: string; fileBytes: ArrayBuffer };
export type HandoffPayload = (HandoffFile | { files: HandoffFile[] }) & { from?: string };

export interface SendHandoffOptions {
  /** Where to go. Default: the target's page in the registry (src/lib/toolIds.ts). A locale edition or a query passes its own. */
  href?: string;
  /** Tests only: jsdom cannot navigate. */
  navigate?: (href: string) => void;
  /** Asked once the bytes are parked; false stays put (a newer run took over while this one saved). */
  proceed?: () => boolean;
}

/**
 * ARCH-38: the one "park the file for the next tool, then go there" every hand-off runs through.
 * `target` is the receiving tool's id (or page slug). Resolves true once navigation is under way,
 * false when `proceed` declined. Throws when the store would not take the file, so a caller's own
 * `catch` shows its one quiet failure line (the store has already reported it).
 *
 * The store stays a dynamic import: it is only needed once a result is being handed off, so it is
 * out of the eager graph of every tool.
 */
export async function sendHandoff(target: string, payload: HandoffPayload, options: SendHandoffOptions = {}): Promise<boolean> {
  const { saveHandoff } = await import('./drafts/draftStore.ts');
  const saved = await saveHandoff(handoffKeyOf(target), payload);
  if (!saved) throw new Error('handoff');
  if (options.proceed && !options.proceed()) return false;
  const href = options.href ?? handoffHrefOf(target) ?? `/${target}/`;
  (options.navigate ?? ((to: string) => { window.location.href = to; }))(href);
  return true;
}
