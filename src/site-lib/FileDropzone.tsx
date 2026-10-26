import { useEffect, useRef, useState } from 'preact/hooks';
import { routeFiles, handoffKeyFor, type FileRoute } from './routeFiles.ts';
import { saveHandoff, setCurrentEntry, readRecentFiles } from '../lib/drafts/draftStore.js';
import { noteRecentOpen } from '../lib/fileArrival.ts';
import { useNavigatingAway } from '../lib/useNavigatingAway.ts';
import RecentFiles, { type RecentFileItem } from './RecentFiles.tsx';
import styles from './FileDropzone.module.css';
import { SAMPLE_FILE_NAME, SAMPLE_PREVIEW_SRC } from './sampleDocument.ts';
import { withFillModeParam } from './withFillModeParam.ts';
import { tools, pageForToolId } from '../data/tools.js';
import { englishFileDropzoneMessages, type FileDropzoneMessages } from './fileDropzoneMessages';
import { formatMessage } from '../lib/formatMessage';
import type { RecentFilesMessages } from './recentFilesMessages';

/* MEM-03: every entry in the recency index - Sign/Redact source PDFs and a
   Merge file set alike - is an ordinary row now that work lives on the entry
   rather than in a separate per-tool draft slot (draftStore.js's one memory
   space). There is no longer a Merge-only row to read separately and dedupe
   against this list. readRecentFiles() already caps at six itself; the slice
   here is the same belt-and-suspenders this always had, not new capping
   logic. */
function readHomeRecents(): RecentFileItem[] {
  return readRecentFiles().map((entry: any) => ({ ...entry, cacheId: entry.id })).slice(0, 6);
}

/** The closing launcher cannot light a toolbar it has scrolled away from, so it sends the pick up to the first screen's island. */
export const LAUNCHER_PICK_EVENT = 'pdkef:launcher-pick';

const TYPE_BY_EXTENSION: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
/** Edit PDF Pages filters strictly by type, so a file the browser left untyped gets one from its extension. */
export const fileTypeOf = (file: File) =>
  file.type || TYPE_BY_EXTENSION[file.name.split('.').pop()?.toLowerCase() ?? ''] || 'application/pdf';

/* The bytes are read when the file is picked, not when a tool is tapped: an iOS file from the Files
   picker can stop being readable while it waits for a tool. Everything after this works on the copies. */
/* Each file on its own: one that cannot be read is named, the rest carry on. */
async function readCopies(files: File[]): Promise<{ copies: File[]; unreadable: File[] }> {
  const settled = await Promise.allSettled(files.map(async file =>
    new File([await file.arrayBuffer()], file.name, { type: fileTypeOf(file), lastModified: file.lastModified })));
  return {
    copies: settled.flatMap(result => (result.status === 'fulfilled' ? [result.value] : [])),
    unreadable: files.filter((_, index) => settled[index].status === 'rejected'),
  };
}

/** Each name in its own bidi isolate (U+2068 ... U+2069), so a Hebrew name beside a Latin one keeps its place in the list. */
export const isolateNames = (files: readonly { name: string }[]) =>
  files.map(file => `\u2068${file.name}\u2069`).join(', ');

/** What the two screen-reader regions say: failures at once, everything else politely, the prompt last. Pure. */
export function liveMessages(
  state: { note: string; failed: boolean; waiting: boolean },
  messages: FileDropzoneMessages,
) {
  return {
    alert: state.failed ? state.note : '',
    status: [state.failed ? '' : state.note, state.waiting ? messages.pickAToolBelow : ''].filter(Boolean).join('. '),
  };
}

type Choice = { files: File[]; tools: string[] };
type Opening = { title: string; tool: string };

/** What the tile says. Pure, so the states are testable without a DOM. A note (a failure or a
    "Left out" list) takes the second line in every state; the title stays. */
export function tileCopy(
  state: { choice: Choice | null; opening: Opening | null; busy: boolean; note?: string; final?: boolean },
  messages: FileDropzoneMessages,
) {
  const tone = state.note ? 'note' as const : 'plain' as const;
  const withLine = (title: string, line: string, choosing: boolean) =>
    ({ title, line: state.note || line, tone, choosing });
  if (state.opening) {
    return withLine(state.opening.title, formatMessage(messages.openingTool, { tool: state.opening.tool }), false);
  }
  if (state.choice) {
    const { files } = state.choice;
    return withLine(files.length === 1 ? files[0].name : formatMessage(messages.fileCount, { count: files.length }), messages.pickAToolBelow, true);
  }
  return withLine(state.busy ? messages.opening : messages.chooseFiles, state.final ? messages.orDropThem : messages.orDropThenPick, false);
}

/* The toolbar belongs to the page, not to this island: its links are static
   anchors that work without JavaScript, and while files wait the island only
   marks them with attributes (CSS dims, rings and fades from there). All of
   that DOM wiring lives in these helpers. */
const dockLinks = () => [...document.querySelectorAll<HTMLAnchorElement>('.home-dock a[data-tool]')];
const dockLink = (tool: string) => dockLinks().find(link => link.dataset.tool === tool);
const linkLabel = (link: HTMLAnchorElement | undefined, fallback: string) =>
  link?.querySelector('.app-label')?.textContent?.trim() || fallback;

function restDock() {
  document.querySelector('.home-hero')?.removeAttribute('data-picking');
  dockLinks().forEach(link => link.removeAttribute('data-fits'));
}

/** Marks the links that fit and returns the first one in dock order. */
function lightDock(tools: string[]) {
  document.querySelector('.home-hero')?.setAttribute('data-picking', '');
  const fits = dockLinks().filter(link => tools.includes(link.dataset.tool ?? ''));
  fits.forEach(link => link.setAttribute('data-fits', ''));
  return fits[0];
}

const DOCK_FADE_CLEARANCE = 56;

/* Scrolls the dock itself, never the page. scrollIntoView also scrolls the
   overflow-hidden ancestors of the pinned hero, which pushed the header down
   under a blank band the first time this was built. */
function wakeDock(tools: string[]) {
  const first = lightDock(tools);
  const dock = first?.closest<HTMLElement>('.home-dock');
  if (!first || !dock) return undefined;
  // Clear of the 40px edge fade at the dock's start, which is the right on an RTL page.
  const link = first.getBoundingClientRect();
  const box = dock.getBoundingClientRect();
  const left = getComputedStyle(dock).direction === 'rtl'
    ? dock.scrollLeft + link.right - box.right + DOCK_FADE_CLEARANCE
    : dock.scrollLeft + link.left - box.left - DOCK_FADE_CLEARANCE;
  const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  dock.scrollTo({ left, behavior: calm ? 'instant' : 'smooth' });
  first.focus({ preventScroll: true });
  return first;
}

export default function FileDropzone({
  toolTarget,
  final = false,
  messages = englishFileDropzoneMessages,
  recentFilesMessages,
  // LOC-09: the practice-document caption used to hardcode "Sign & Fill"
  // regardless of what a localized edition of that tool calls itself
  // (docs/home-page-localization-plan.md, section 2 row 21). Defaults to the
  // English tool registry's own name, so every existing caller is unaffected.
  toolDisplayName,
  // Where a hand-off lands, per tool slug. A localized home page passes the
  // hrefs its dock already resolved (the locale's own edition where one is
  // published, else the English page), so dropping a file on /he/ opens
  // /he/sign/ like the dock card beside it does, not the English /sign/.
  // The draft store and the recents cache stay keyed by the bare slug.
  toolHrefs,
}: {
  toolTarget: string;
  final?: boolean;
  messages?: FileDropzoneMessages;
  recentFilesMessages?: RecentFilesMessages;
  toolDisplayName?: string;
  toolHrefs?: Record<string, string>;
}) {
  const toolHref = (tool: string) => toolHrefs?.[tool] ?? `/${tool}/`;
  // `null` means "browser storage has not been read yet", and it is the state
  // both the server render and the client's first render start from, so the
  // two agree by construction. That agreement is the whole point: recent files
  // live in localStorage, no server render can know about them, and Preact
  // repairs a hydration mismatch by keeping the server's nodes and appending
  // its own - which is how the duplicate tiles fixed in 203b204 reached
  // production. Never read storage in a render body or a useState initializer
  // here; the mount effect below is the only thing that may.
  const [recents, setRecents] = useState<RecentFileItem[] | null>(null);
  const [error, setError] = useState('');
  // Disables every tile, the picker and the drop target while it is set, so it
  // is the hook's flag rather than a plain useState (../lib/useNavigatingAway.ts).
  const [busy, setBusy] = useNavigatingAway();
  // SITE-42: one file waits for a tool in the toolbar (`choice`), or several
  // are on their way to the one tool that takes them (`opening`). Both start
  // empty so the server render and the first client render agree.
  const [choice, setChoice] = useState<Choice | null>(null);
  const [opening, setOpening] = useState<Opening | null>(null);
  // The picked bytes are being read. Not a navigation, so a plain flag: it shows the busy tile
  // but never blocks a newer pick.
  const [reading, setReading] = useState(false);
  const latestPick = useRef(0);
  const container = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const tile = useRef<HTMLButtonElement>(null);
  // Set synchronously on the first accepted click on a lit tool, so a second
  // click before the first hand-off settles cannot write an orphan hand-off.
  const handing = useRef(false);

  // MEM-03: no more "Open this instead?" - once work lives on the entry
  // rather than a per-tool draft slot, opening a file here overwrites
  // nothing, so a hand-off is just park-the-bytes-then-navigate.
  // Resolves true once navigation is under way. On failure it shows the error
  // and frees the page, and leaves the dock and the tile's copy to the caller.
  const handOff = async (files: File[], tool = toolTarget, href = toolHref(tool)) => {
    handing.current = true;
    setBusy(true);
    try {
      const records = await Promise.all(files.map(async file => ({
        fileName: file.name, fileType: fileTypeOf(file), fileBytes: await file.arrayBuffer(),
      })));
      const saved = await saveHandoff(handoffKeyFor(tool), records.length === 1 ? records[0] : { files: records });
      if (!saved) throw new Error('handoff');
      window.location.href = withFillModeParam(href, window.location.search);
      return true;
    } catch {
      // expected: the user sees handoffFailed, and saveHandoff reports its own failure
      setError(messages.handoffFailed);
      handing.current = false;
      setBusy(false);
      return false;
    }
  };
  const leftOutNote = (skipped: File[]) =>
    skipped.length ? formatMessage(messages.leftOut, { names: isolateNames(skipped) }) : '';
  const enterChoice = (route: Extract<FileRoute, { kind: 'choose' }>) => {
    setError(leftOutNote(route.skipped));
    setChoice({ files: route.files, tools: route.tools });
  };
  const handleFiles = async (files: FileList | File[]) => {
    const incoming = Array.from(files || []);
    if (!incoming.length || busy) return;
    const first = routeFiles(incoming);
    if (first.kind === 'none') {
      setError(messages.unsupportedFiles);
      return;
    }
    // Reading comes first, and the newest pick wins: a slower, older read is dropped.
    const pick = ++latestPick.current;
    setChoice(null);
    setReading(true);
    const { copies, unreadable } = await readCopies(first.files);
    if (pick !== latestPick.current) return;
    setReading(false);
    const skipped = [...first.skipped, ...unreadable];
    if (!copies.length) {
      setError(leftOutNote(skipped));
      return;
    }
    const route = routeFiles(copies);
    if (route.kind === 'none') return;
    if (route.kind === 'choose' && final) {
      // The closing launcher wakes nothing itself: it scrolls up, and the first screen shows what was left out.
      setError('');
      document.querySelector<HTMLElement>('[data-workspace-return]')?.click();
      window.dispatchEvent(new CustomEvent(LAUNCHER_PICK_EVENT, { detail: { files: copies, skipped } }));
      return;
    }
    if (route.kind === 'choose') { enterChoice({ ...route, skipped }); return; }
    setError(leftOutNote(skipped));
    const link = dockLink(route.tool);
    setOpening({ title: formatMessage(messages.fileCount, { count: copies.length }), tool: linkLabel(link, tools.find(t => t.slug === route.tool)?.gridTitle ?? route.tool) });
    if (!final) lightDock([route.tool]);
    if (!await handOff(route.files, route.tool, link?.getAttribute('href') ?? undefined)) {
      setOpening(null);
      restDock();
    }
  };
  // Opening a recent tile is a pointer move and a navigation, nothing more.
  // The entry already holds the bytes and the work; the tool restores itself
  // from the pointer on the next page load, which is what Merge has always
  // done and is now what every tool does.
  //
  // It must stay synchronous. Reading the entry first, to learn which tool it
  // belongs to, meant awaiting a record that carries the whole PDF out of
  // IndexedDB for a single string - and on a phone, with a large scan, that
  // read can be slow enough (or block outright) to leave the tile stuck on
  // "Opening..." with nothing happening (reported 2026-09-20). `recent.tool`
  // is already on the index row this tile was rendered from: it is the label
  // printed under the thumbnail, so if it were wrong the tile would be
  // visibly wrong too.
  //
  // It must not hand the file off either. A hand-off means "a file the person
  // just dropped", so useEditorDraftPersistence's beforeRestore opens it with
  // empty elements and an empty history and returns true, short-circuiting the
  // branch that loads the saved work. That rule is right for a dropped file,
  // which really is newer than anything the pointer names. A recent tile is
  // the opposite case, and opening your own saved document through the
  // brand-new-file door is what discarded it (also 2026-09-20).
  const openRecent = (recent: RecentFileItem) => {
    if (busy || !recent.cacheId || !recent.tool) return;
    setBusy(true);
    setCurrentEntry(recent.tool, recent.cacheId);
    noteRecentOpen(recent.tool);
    window.location.href = withFillModeParam(toolHref(pageForToolId(recent.tool)?.slug ?? recent.tool), window.location.search);
  };

  useEffect(() => {
    const ownArea = container.current?.closest<HTMLElement>('[data-working-area]');
    // The whole first screen is a drop target, not just the picker tile. This
    // used to be `.home-scene`, the wrapper that held the launcher and the
    // demo side by side; that wrapper is gone now the demo is a sibling after
    // the dock (so mobile reading order matches what is on screen), and the
    // hero is the element that still spans exactly the pinned stage.
    const stage = final ? null : document.querySelector<HTMLElement>('.home-hero');
    const areas = [...new Set([ownArea, stage].filter(Boolean))] as HTMLElement[];
    const cleanups = areas.map(area => {
      const over = (event: DragEvent) => {
        if (!event.dataTransfer?.types.includes('Files')) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
        area.dataset.dragOver = '';
      };
      const leave = (event: DragEvent) => {
        if (!area.contains(event.relatedTarget as Node)) delete area.dataset.dragOver;
      };
      const drop = (event: DragEvent) => {
        event.preventDefault();
        event.stopPropagation();
        for (const target of areas) delete target.dataset.dragOver;
        if (event.dataTransfer) void handleFiles(event.dataTransfer.files);
      };
      area.addEventListener('dragover', over);
      area.addEventListener('dragleave', leave);
      area.addEventListener('drop', drop);
      return () => {
        area.removeEventListener('dragover', over);
        area.removeEventListener('dragleave', leave);
        area.removeEventListener('drop', drop);
      };
    });
    return () => cleanups.forEach(cleanup => cleanup());
  }, [busy, final]);
  // Waiting for a tool: light the toolbar, and let a lit link, Escape or the
  // tile end the wait. One dock listener, present only while waiting; a dimmed
  // link is never intercepted, it stays a plain link to its page.
  useEffect(() => {
    if (!choice) return;
    wakeDock(choice.tools);
    const dock = document.querySelector('.home-dock');
    const pickTool = (event: Event) => {
      const link = (event.target as Element).closest<HTMLAnchorElement>('a[data-fits]');
      const { metaKey, ctrlKey, shiftKey, altKey, button } = event as MouseEvent;
      if (!link || metaKey || ctrlKey || shiftKey || altKey || button !== 0) return;
      event.preventDefault();
      if (handing.current) return;
      const tool = link.dataset.tool ?? '';
      setOpening({ title: choice.files.length === 1 ? choice.files[0].name : formatMessage(messages.fileCount, { count: choice.files.length }), tool: linkLabel(link, tool) });
      void handOff(choice.files, tool, link.getAttribute('href') ?? undefined).then(ok => { if (!ok) setOpening(null); });
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if ((document.activeElement as Element | null)?.closest?.('dialog[open]')) return;
      setChoice(null);
      setError('');
      tile.current?.focus({ preventScroll: true });
    };
    dock?.addEventListener('click', pickTool);
    document.addEventListener('keydown', escape);
    return () => {
      dock?.removeEventListener('click', pickTool);
      document.removeEventListener('keydown', escape);
      restDock();
    };
  }, [choice]);
  // A page restored from the back/forward cache comes back with its state: every flag of the
  // navigation that left is reset here. The closing launcher's pick comes up from the far end.
  useEffect(() => {
    const restored = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      handing.current = false;
      setChoice(null);
      setOpening(null);
      setError('');
      restDock();
    };
    window.addEventListener('pageshow', restored);
    const picked = (event: Event) => {
      const { files, skipped = [] } = (event as CustomEvent<{ files: File[]; skipped?: File[] }>).detail;
      const route = routeFiles(files);
      if (route.kind === 'choose') enterChoice({ ...route, skipped: [...route.skipped, ...skipped] });
    };
    if (!final) window.addEventListener(LAUNCHER_PICK_EVENT, picked);
    return () => { window.removeEventListener(LAUNCHER_PICK_EVENT, picked); window.removeEventListener('pageshow', restored); };
  }, [final]);
  useEffect(() => {
    const refresh = () => setRecents(readHomeRecents());
    refresh();
    window.addEventListener('pageshow', refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener('pageshow', refresh); window.removeEventListener('storage', refresh); };
  }, []);
  const sample = async () => {
    try {
      const response = await fetch('/images/redaction-guide/sample.pdf');
      if (!response.ok) throw new Error('sample');
      if (busy) return;
      setError('');
      // The practice document is Sign's own, so it skips the routing.
      await handOff([new File([await response.blob()], SAMPLE_FILE_NAME, { type: 'application/pdf' })]);
    } catch {
      // expected: a same-origin fetch can fail offline, the user sees sampleLoadFailed
      setError(messages.sampleLoadFailed);
    }
  };
  const resolvedToolDisplayName = toolDisplayName ?? tools.find(t => t.slug === toolTarget)?.gridTitle ?? toolTarget;
  const { title, line, tone, choosing } = tileCopy({ choice, opening, busy: busy || reading, note: error, final }, messages);
  const failed = [messages.handoffFailed, messages.sampleLoadFailed, messages.unsupportedFiles].includes(error);
  const live = liveMessages({ note: error, failed, waiting: !!choice && !opening }, messages);
  return (
    <div ref={container} class={final ? styles.final : styles.launcher}>
      {!final && <RecentFiles
        files={recents && recents.length > 0 ? recents : [{
          tool: 'sign',
          fileName: SAMPLE_FILE_NAME,
          preview: SAMPLE_PREVIEW_SRC,
          bundledSample: true,
        }]}
        onOpenSample={sample}
        onOpenRecent={openRecent}
        busy={busy}
        messages={recentFilesMessages}
      />}

      {/* The practice document is offered as a document, not as a sentence
          about one. It deliberately borrows the recent-documents card shape -
          page thumbnail, filename, tool underneath - so the two ways into the
          app on this page look like the same kind of thing, and so someone
          who has used the page before recognises it without reading it.
          The thumbnail is inline SVG rather than a rasterised first page: the
          sample is 2KB of vector PDF with no page image shipped alongside it,
          and rendering one through pdf.js to decorate a button would pull the
          whole worker into the page for a 64x84 image. */}
      {final && <button type="button" class={styles.sample} onClick={sample} disabled={busy}>
        <svg class={styles['sample-page']} viewBox="0 0 64 84" aria-hidden="true">
          <path d="M2.5 2.5h39l20 20v59h-59z" fill="var(--color-surface)" stroke="var(--color-border-strong)" />
          <path d="M41.5 2.5v20h20" fill="none" stroke="var(--color-border-strong)" />
          <g stroke="var(--color-muted-light)" stroke-width="2.5" stroke-linecap="round">
            <path d="M10 34h30M10 42h44M10 50h34" />
          </g>
          <g stroke="var(--color-primary)" stroke-width="2.5" stroke-linecap="round">
            <path d="M10 62h20" />
          </g>
          <path d="M34 68c4-5 7 4 11-1s6 3 9 0" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" />
        </svg>
        <strong>{SAMPLE_FILE_NAME}</strong>
        <span>{formatMessage(messages.practiceDocumentCaption, { tool: resolvedToolDisplayName })}</span>
      </button>}
      <button type="button" ref={tile} class={styles.tile} data-home-picker data-picking={choice ? '' : undefined} disabled={busy}
        onClick={() => { setChoice(null); setError(''); input.current?.click(); }}>
        <svg width="36" height="42" viewBox="0 0 36 42" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path d="M6 2h16l9 9v28H6zM22 2v10h9M12 26h13M18.5 19.5v13" />
        </svg>
        <strong class={styles.title}><bdi class={styles.name}>{title}</bdi>{choosing && <em class={styles.change}>{messages.change}</em>}</strong>
        <span class={tone === 'note' ? styles.note : undefined} data-tone={tone === 'note' ? 'note' : undefined}
          title={tone === 'note' ? line : undefined}>{line}</span>
        {!final && <svg class={styles.arrow} viewBox="0 0 40 72" aria-hidden="true" focusable="false">
          {/* One path, shaft then head: Mobile Safari never runs a second, later draw-on on a separate head path. */}
          <path pathLength={1} d="M36 6C22 2 8 8 7 22C6 34 16 38 18 30C20 22 6 22 7 40C8 52 13 60 16 67M7 61L15.8 67.6L19 56.5" />
        </svg>}
      </button>
      <input ref={input} type="file" multiple accept="application/pdf,.pdf,image/jpeg,image/png,.jpg,.jpeg,.png" hidden onChange={event => {
        const files = Array.from(event.currentTarget.files || []);
        event.currentTarget.value = '';
        void handleFiles(files);
      }} />
      {/* Always present, so a screen reader hears them fill in; visually hidden. Failures interrupt, the rest waits its turn. */}
      <span class="sr-only" aria-live="assertive">{live.alert}</span>
      <span class="sr-only" aria-live="polite">{live.status}</span>
    </div>
  );
}
