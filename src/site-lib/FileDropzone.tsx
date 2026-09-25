import { useEffect, useRef, useState } from 'preact/hooks';
import { saveHandoff, setCurrentEntry, readRecentFiles } from '../lib/drafts/draftStore.js';
import { useNavigatingAway } from '../lib/useNavigatingAway.ts';
import RecentFiles, { type RecentFileItem } from './RecentFiles.tsx';
import styles from './FileDropzone.module.css';
import { SAMPLE_FILE_NAME, SAMPLE_PREVIEW_SRC } from './sampleDocument.ts';
import { tools } from '../data/tools.js';
import { englishFileDropzoneMessages, formatMessage, type FileDropzoneMessages } from '../i18n/toolMessages';
import type { RecentFilesMessages } from '../i18n/toolMessages';

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
  const container = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // MEM-03: no more "Open this instead?" - once work lives on the entry
  // rather than a per-tool draft slot, opening a file here overwrites
  // nothing, so a hand-off is just park-the-bytes-then-navigate.
  const handOff = async (file: File, tool = toolTarget) => {
    setBusy(true);
    try {
      const saved = await saveHandoff(tool, {
        fileName: file.name, fileType: file.type || 'application/pdf', fileBytes: await file.arrayBuffer(),
      });
      if (!saved) throw new Error('handoff');
      window.location.href = toolHref(tool);
    } catch {
      setError(messages.handoffFailed);
      setBusy(false);
    }
  };
  const handleFiles = async (files: FileList | File[]) => {
    const incoming = Array.from(files || []);
    if (!incoming.length || busy) return;
    if (incoming.length > 1) { setError(messages.multipleFilesPicked); return; }
    const file = incoming[0];
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { setError(messages.notAPdf); return; }
    setError('');
    await handOff(file);
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
    window.location.href = toolHref(recent.tool);
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
      await handleFiles([new File([await response.blob()], SAMPLE_FILE_NAME, { type: 'application/pdf' })]);
    } catch { setError(messages.sampleLoadFailed); }
  };
  const resolvedToolDisplayName = toolDisplayName ?? tools.find(t => t.slug === toolTarget)?.gridTitle ?? toolTarget;
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
      <button type="button" class={styles.tile} data-home-picker disabled={busy} onClick={() => input.current?.click()}>
        <svg width="36" height="42" viewBox="0 0 36 42" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path d="M6 2h16l9 9v28H6zM22 2v10h9M12 26h13M18.5 19.5v13" />
        </svg>
        <strong>{busy ? messages.opening : messages.chooseFiles}</strong>
        <span>{messages.orDropPdfsHere}</span>
      </button>
      <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={event => {
        const files = Array.from(event.currentTarget.files || []);
        event.currentTarget.value = '';
        void handleFiles(files);
      }} />
      {error && <p class={styles.error} role="alert">{error}</p>}
    </div>
  );
}
