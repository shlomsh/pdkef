import { useEffect, useRef, useState } from 'preact/hooks';
import { loadDraft, deleteDraft, saveHandoff, readDraftMeta } from '../editor/workspace/draftStore.js';
import ConfirmDialog from './ConfirmDialog.tsx';
import dialogStyles from './Dialog.module.css';
import ResumeDraftCard from './ResumeDraftCard.tsx';
import styles from './FileDropzone.module.css';
import { SAMPLE_FILE_NAME } from './sampleDocument.ts';

// One real document per supported editor; the homepage does not own a cache.
const DRAFT_TOOLS = ['sign', 'redact'];

function readAllDraftMeta(): any[] {
  return DRAFT_TOOLS.map(tool => {
    const meta: any = readDraftMeta(tool);
    return meta && { tool, ...meta };
  }).filter(Boolean).sort((a: any, b: any) => (b.savedAt || 0) - (a.savedAt || 0));
}
export default function FileDropzone({ toolTarget, final = false }: { toolTarget: string; final?: boolean }) {
  const [pending, setPending] = useState<{ file: File; draftName?: string } | null>(null);
  const [drafts, setDrafts] = useState(readAllDraftMeta);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const handOff = async (file: File, { discardDraft = false } = {}) => {
    setBusy(true);
    try {
      const saved = await saveHandoff(toolTarget, {
        fileName: file.name, fileType: file.type || 'application/pdf', fileBytes: await file.arrayBuffer(),
      });
      if (!saved) throw new Error('handoff');
      if (discardDraft && !(await deleteDraft(toolTarget))) throw new Error('draft');
      window.location.href = `/${toolTarget}/`;
    } catch {
      setError('This browser could not open the file. Choose a tool below and open it there.');
      setBusy(false);
    }
  };
  const handleFiles = async (files: FileList | File[]) => {
    const incoming = Array.from(files || []);
    if (!incoming.length || busy) return;
    if (incoming.length > 1) { setError('Choose one PDF here, or use Merge PDF below for several files.'); return; }
    const file = incoming[0];
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { setError('Please choose a PDF file.'); return; }
    setError('');
    const draft: any = await loadDraft(toolTarget);
    if (draft?.fileBytes) setPending({ file, draftName: draft.fileName });
    else await handOff(file);
  };
  useEffect(() => {
    const area = container.current?.closest<HTMLElement>('[data-working-area]');
    if (!area) return;
    const over = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      area.dataset.dragOver = '';
    };
    const leave = (event: DragEvent) => {
      if (!area.contains(event.relatedTarget as Node)) delete area.dataset.dragOver;
    };
    const drop = (event: DragEvent) => {
      event.preventDefault();
      delete area.dataset.dragOver;
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
  }, [busy]);
  useEffect(() => {
    const refresh = () => setDrafts(readAllDraftMeta());
    window.addEventListener('pageshow', refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener('pageshow', refresh); window.removeEventListener('storage', refresh); };
  }, []);
  const sample = async () => {
    try {
      const response = await fetch('/images/redaction-guide/sample.pdf');
      if (!response.ok) throw new Error('sample');
      await handleFiles([new File([await response.blob()], SAMPLE_FILE_NAME, { type: 'application/pdf' })]);
    } catch { setError('The sample could not be loaded. Please try again or choose your own PDF.'); }
  };
  return (
    <div ref={container} class={final ? styles.final : styles.launcher}>
      {!final && <ResumeDraftCard drafts={drafts} />}

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
        <span>Practice document · opens in Sign &amp; Fill</span>
      </button>}
      <button type="button" class={styles.tile} data-home-picker disabled={busy} onClick={() => input.current?.click()}>
        <svg width="36" height="42" viewBox="0 0 36 42" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path d="M6 2h16l9 9v28H6zM22 2v10h9M12 26h13M18.5 19.5v13" />
        </svg>
        <strong>{busy ? 'Opening…' : 'Choose files'}</strong>
        <span>or drop PDFs here</span>
      </button>
      <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={event => {
        const files = Array.from(event.currentTarget.files || []);
        event.currentTarget.value = '';
        void handleFiles(files);
      }} />
      {error && <p class={styles.error} role="alert">{error}</p>}
      <ConfirmDialog open={!!pending} titleId={final ? 'confirm-final-handoff' : 'confirm-handoff'} title="Open this instead?" confirmLabel="Open it"
        onCancel={() => setPending(null)} onConfirm={() => {
          const next = pending; setPending(null);
          if (next) void handOff(next.file, { discardDraft: true });
        }}>
        Opening <span class={dialogStyles['confirm-file']}>{pending?.file.name}</span> replaces your saved work in{' '}
        <span class={dialogStyles['confirm-file']}>{pending?.draftName}</span>. That can’t be undone.
      </ConfirmDialog>
    </div>
  );
}
