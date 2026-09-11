import { useEffect, useRef, useState } from 'preact/hooks';
import { loadDraft, deleteDraft, saveHandoff, readRecentFiles, loadRecentFile } from '../editor/workspace/draftStore.js';
import ConfirmDialog from './ConfirmDialog.tsx';
import dialogStyles from './Dialog.module.css';
import RecentFiles, { type RecentFileItem } from './RecentFiles.tsx';
import styles from './FileDropzone.module.css';
import { SAMPLE_FILE_NAME, SAMPLE_PREVIEW_SRC } from './sampleDocument.ts';
import { tools } from '../data/tools.js';
import { englishFileDropzoneMessages, formatMessage, type FileDropzoneMessages } from '../i18n/toolMessages';
import type { RecentFilesMessages } from '../i18n/toolMessages';

function readHomeRecents(): RecentFileItem[] {
  return readRecentFiles()
    .slice(0, 6)
    .map((entry: any) => ({ ...entry, cacheId: entry.id }));
}

/* Splits messages.confirmHandoffBody on its literal '{file}'/'{draft}'
   placeholders and re-inserts the two file names as styled spans, so a
   translated sentence can reorder them freely while keeping the
   .confirm-file emphasis - the same idea as BasePdfTool.tsx's own
   renderTemplate, using the plain placeholder text as the split marker
   instead of a NUL sentinel. */
function renderConfirmBody(template: string, file: string, draft: string) {
  return template.split(/(\{file\}|\{draft\})/).map((part, index) => {
    if (part === '{file}') return <span key={index} class={dialogStyles['confirm-file']}>{file}</span>;
    if (part === '{draft}') return <span key={index} class={dialogStyles['confirm-file']}>{draft}</span>;
    return part;
  });
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
}: {
  toolTarget: string;
  final?: boolean;
  messages?: FileDropzoneMessages;
  recentFilesMessages?: RecentFilesMessages;
  toolDisplayName?: string;
}) {
  const [pending, setPending] = useState<{ file: File; draftName?: string; tool: string } | null>(null);
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
  const [busy, setBusy] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const handOff = async (file: File, { discardDraft = false, tool = toolTarget }: { discardDraft?: boolean; tool?: string } = {}) => {
    setBusy(true);
    try {
      const saved = await saveHandoff(tool, {
        fileName: file.name, fileType: file.type || 'application/pdf', fileBytes: await file.arrayBuffer(),
      });
      if (!saved) throw new Error('handoff');
      if (discardDraft && !(await deleteDraft(tool))) throw new Error('draft');
      window.location.href = `/${tool}/`;
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
    const draft: any = await loadDraft(toolTarget);
    if (draft?.fileBytes) setPending({ file, draftName: draft.fileName, tool: toolTarget });
    else await handOff(file);
  };
  const openRecent = async (recent: RecentFileItem) => {
    if (busy || !recent.cacheId) return;
    setBusy(true);
    try {
      const cached: any = await loadRecentFile(recent.cacheId);
      if (!cached?.fileBytes) throw new Error('missing-recent');
      const target = cached.tool || recent.tool;
      const file = new File([cached.fileBytes], cached.fileName, { type: cached.fileType || 'application/pdf' });
      const draft: any = await loadDraft(target);
      if (draft?.fileBytes) {
        if (draft.sourceId === recent.cacheId) {
          window.location.href = `/${target}/`;
          return;
        }
        setPending({ file, draftName: draft.fileName, tool: target });
        setBusy(false);
      } else {
        await handOff(file, { tool: target });
      }
    } catch {
      setError(messages.recentFileUnavailable);
      setBusy(false);
    }
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
      <ConfirmDialog
        open={!!pending}
        titleId={final ? 'confirm-final-handoff' : 'confirm-handoff'}
        title={messages.confirmHandoffTitle}
        confirmLabel={messages.confirmHandoffConfirm}
        cancelLabel={messages.cancelLabel}
        closeLabel={messages.closeLabel}
        onCancel={() => setPending(null)} onConfirm={() => {
          const next = pending; setPending(null);
          if (next) void handOff(next.file, { discardDraft: true, tool: next.tool });
        }}>
        {renderConfirmBody(messages.confirmHandoffBody, pending?.file.name ?? '', pending?.draftName ?? '')}
      </ConfirmDialog>
    </div>
  );
}
