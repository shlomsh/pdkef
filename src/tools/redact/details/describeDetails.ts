/**
 * RED-59: the words for what a file says about itself. Pure: it takes the
 * `DocumentTraces` the adapter read and returns one row per detail the person
 * can keep, alter or delete, plus the two summary lines and the read-back
 * check. The UI wraps a row's `text` in `<bdi>` and a `iso` date in `<time>`.
 */
import { attachmentDetailId } from '../../../editor/adapters/pdf/documentTraces.js';
import type { DetailEdits, DocumentTraces } from '../../../editor/adapters/pdf/documentTraces.js';

export interface DetailRow {
  id: string;
  label: string;
  text: string;
  iso?: string;
  editable: boolean;
}

const TEXT_ROWS = [
  ['title', 'Title'],
  ['author', 'Author'],
  ['subject', 'Subject'],
  ['keywords', 'Keywords'],
] as const;

/** The recorded wall time, read back as the device's clock said it. */
const wallMs = (iso: string) => Date.parse(`${iso}Z`);

function formatDate(iso: string, locale: string, now: Date): string {
  const when = new Date(wallMs(iso));
  const sameYear = when.getUTCFullYear() === now.getUTCFullYear();
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' as const }),
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
  }).format(when);
}

const hasHidden = (t: DocumentTraces) => t.xmp.present || t.pieceInfo || t.otherInfoKeys.length > 0 || t.pageDetails.length > 0;
const hasScripts = (t: DocumentTraces) => t.scripts.document || t.scripts.pages.length > 0;

export function describeDetails(traces: DocumentTraces, options: { locale: string; now: Date }): DetailRow[] {
  const { locale, now } = options;
  const rows: DetailRow[] = [];

  for (const [id, label] of TEXT_ROWS) {
    const value = traces[id];
    if (value) rows.push({ id, label, text: value, editable: true });
  }

  const { creator, producer } = traces;
  if (creator || producer) {
    const text = creator && producer && creator !== producer ? `${creator} · ${producer}` : (creator || producer)!;
    rows.push({ id: 'made', label: 'Made with', text, editable: true });
  }

  const { creationDate, modDate } = traces;
  if (creationDate) {
    rows.push({ id: 'created', label: 'Created', text: formatDate(creationDate.iso, locale, now), iso: creationDate.iso, editable: false });
  }
  if (modDate && (!creationDate || wallMs(modDate.iso) - wallMs(creationDate.iso) >= 60_000)) {
    rows.push({ id: 'changed', label: 'Changed', text: formatDate(modDate.iso, locale, now), iso: modDate.iso, editable: false });
  }

  for (const file of traces.attachments) {
    rows.push({
      id: attachmentDetailId(file),
      label: file.pageIndex === undefined ? 'Attached' : `Attached on page ${file.pageIndex + 1}`,
      text: file.name,
      editable: false,
    });
  }

  if (hasScripts(traces)) rows.push({ id: 'scripts', label: 'Scripts', text: 'Run when the file opens', editable: false });

  if (hasHidden(traces)) {
    const parts: string[] = [];
    if (traces.xmp.present) parts.push(traces.xmp.hasHistory ? 'a second copy of these details with its save history' : 'a second copy of these details');
    if (traces.pieceInfo || traces.otherInfoKeys.length > 0 || traces.pageDetails.length > 0) parts.push("the app's own notes");
    const joined = parts.join(', ');
    rows.push({ id: 'hidden', label: 'Hidden', text: joined.charAt(0).toUpperCase() + joined.slice(1), editable: false });
  }

  return rows;
}

/** The footer line under the last page. Empty when the file has no details (nothing is rendered then). */
export function detailsSummary(rows: DetailRow[]): string {
  if (rows.length === 0) return '';
  const parts = ['title', 'author', 'made', 'created']
    .map((id) => rows.find((row) => row.id === id)?.text)
    .filter((text): text is string => Boolean(text));
  const attached = rows.filter((row) => row.id.startsWith('attachment:')).length;
  if (attached > 0) parts.push(`${attached} attached ${attached === 1 ? 'file' : 'files'}`);
  if (rows.some((row) => row.id === 'scripts')) parts.push('scripts');
  if (rows.some((row) => row.id === 'hidden')) parts.push('hidden details');
  return parts.join(' · ');
}

/** What the person changed, in row order. Only explicit edits (the implied Hidden row is not one). */
export function changesSummary(rows: DetailRow[], edits: DetailEdits): string {
  const parts: string[] = [];
  for (const row of rows) {
    const edit = edits[row.id];
    if (!edit) continue;
    const verb = edit.action === 'delete' ? 'deleted' : 'altered';
    parts.push(row.id.startsWith('attachment:') ? `${row.text} deleted` : `${row.label.toLowerCase()} ${verb}`);
  }
  return parts.join(', ');
}

const isText = (id: string): id is (typeof TEXT_ROWS)[number][0] => TEXT_ROWS.some(([textId]) => textId === id);

function attachmentSurvives(id: string, saved: DocumentTraces): boolean {
  const rest = id.slice('attachment:'.length);
  const split = rest.indexOf(':');
  const pageIndex = split === 0 ? undefined : Number(rest.slice(0, split));
  const name = rest.slice(split + 1);
  return saved.attachments.some((file) => file.name === name && file.pageIndex === pageIndex);
}

/** Ids of explicit edits that did not take, read back from the saved file. */
export function survivedDetails(edits: DetailEdits, saved: DocumentTraces): string[] {
  const out: string[] = [];
  for (const [id, edit] of Object.entries(edits)) {
    let survived = false;
    if (isText(id)) {
      survived = edit.action === 'delete' ? Boolean(saved[id]) : saved[id] !== edit.value;
    } else if (id === 'made') {
      survived = edit.action === 'delete' ? Boolean(saved.creator || saved.producer) : saved.creator !== edit.value || Boolean(saved.producer);
    } else if (edit.action !== 'delete') {
      continue;
    } else if (id === 'created') survived = Boolean(saved.creationDate);
    else if (id === 'changed') survived = Boolean(saved.modDate);
    else if (id === 'scripts') survived = hasScripts(saved);
    else if (id === 'hidden') survived = hasHidden(saved);
    else if (id.startsWith('attachment:')) survived = attachmentSurvives(id, saved);
    if (survived) out.push(id);
  }
  return out;
}
