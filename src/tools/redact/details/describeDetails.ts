/**
 * RED-59: the words for what a file says about itself. Pure: it takes the
 * `DocumentTraces` the adapter read and returns one row per detail the person
 * can keep, alter or delete, plus the two summary lines and the read-back
 * check. The UI wraps a row's `text` in `<bdi>` and a `iso` date in `<time>`.
 */
import { attachmentDetailId, expandDetailEdits } from '../../../editor/adapters/pdf/detailEdits.js';
import type { DetailEdits } from '../../../editor/adapters/pdf/detailEdits.js';
import type { DocumentTraces } from '../../../editor/adapters/pdf/documentTraces.js';
import { formatMessage } from '../../../lib/formatMessage.ts';
import { englishRedactMessages } from '../messages.ts';
import type { RedactMessages } from '../messages.ts';

const en = englishRedactMessages;

export interface DetailRow {
  id: string;
  label: string;
  text: string;
  iso?: string;
  editable: boolean;
}

const TEXT_ROWS = ['title', 'author', 'subject', 'keywords'] as const;

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

const hasHidden = (t: DocumentTraces) => t.xmp.present || t.otherInfoKeys.length > 0 || t.pageDetails.length > 0;
const hasScripts = (t: DocumentTraces) => t.scripts.document || t.scripts.pages.length > 0;

export function describeDetails(traces: DocumentTraces, options: { locale: string; now: Date }, messages: RedactMessages = en): DetailRow[] {
  const { locale, now } = options;
  const m = messages.details;
  const rows: DetailRow[] = [];

  for (const id of TEXT_ROWS) {
    const value = traces[id];
    if (value) rows.push({ id, label: m.labels[id], text: value, editable: true });
  }

  const { creator, producer } = traces;
  if (creator || producer) {
    const text = creator && producer && creator !== producer ? `${creator} · ${producer}` : (creator || producer)!;
    rows.push({ id: 'made', label: m.labels.madeWith, text, editable: true });
  }

  const { creationDate, modDate } = traces;
  if (creationDate) {
    rows.push({ id: 'created', label: m.labels.created, text: formatDate(creationDate.iso, locale, now), iso: creationDate.iso, editable: false });
  }
  if (modDate && (!creationDate || wallMs(modDate.iso) - wallMs(creationDate.iso) >= 60_000)) {
    rows.push({ id: 'changed', label: m.labels.changed, text: formatDate(modDate.iso, locale, now), iso: modDate.iso, editable: false });
  }

  for (const file of traces.attachments) {
    rows.push({
      id: attachmentDetailId(file),
      label: file.pageIndex === undefined ? m.labels.attached : formatMessage(m.attachedOnPage, { page: file.pageIndex + 1 }),
      text: file.name,
      editable: false,
    });
  }

  if (hasScripts(traces)) rows.push({ id: 'scripts', label: m.labels.scripts, text: m.scriptsText, editable: false });

  if (hasHidden(traces)) {
    const parts: string[] = [];
    if (traces.xmp.present) parts.push(traces.xmp.hasHistory ? m.hiddenXmpHistory : m.hiddenXmp);
    if (traces.otherInfoKeys.length > 0 || traces.pageDetails.length > 0) parts.push(m.hiddenNotes);
    const joined = parts.join(', ');
    rows.push({ id: 'hidden', label: m.labels.hidden, text: joined.charAt(0).toUpperCase() + joined.slice(1), editable: false });
  }

  return rows;
}

/**
 * The footer line under the last page, as pieces (the UI wraps each in its own
 * `<bdi>`). It follows the person's edits: a deleted detail, or one the engine
 * deletes with it (`expandDetailEdits`), is left out; an altered one shows its
 * new value. Empty when the file has no details (nothing is rendered then).
 */
export function detailsSummary(rows: DetailRow[], edits: DetailEdits, messages: RedactMessages = en): string[] {
  const m = messages.details;
  if (rows.length === 0) return [];
  const effective = expandDetailEdits(edits);
  const kept = rows.filter((row) => effective[row.id]?.action !== 'delete');
  const pieces = ['title', 'author', 'made', 'created']
    .map((id) => {
      const row = kept.find((r) => r.id === id);
      if (!row) return undefined;
      const edit = edits[id];
      // Made with reads "app · library"; the footer names the app only.
      return edit?.action === 'alter' ? edit.value : id === 'made' ? row.text.split(' · ')[0] : row.text;
    })
    .filter((text): text is string => Boolean(text));
  const attached = kept.filter((row) => row.id.startsWith('attachment:')).length;
  if (attached > 0) pieces.push(attached === 1 ? m.attachedFileOne : formatMessage(m.attachedFileMany, { count: attached }));
  if (kept.some((row) => row.id === 'scripts')) pieces.push(m.summaryScripts);
  if (kept.some((row) => row.id === 'hidden')) pieces.push(m.summaryHidden);
  return pieces;
}

/** One change in words: the UI puts only `name` in a `<bdi>`, the verb stays in the sentence's own direction. */
export interface ChangePiece {
  name: string;
  verb: 'deleted' | 'altered';
}

/** What the person changed, in row order, one piece each. Only explicit edits (the implied Hidden row is not one). */
export function changesPieces(rows: DetailRow[], edits: DetailEdits, messages: RedactMessages = en): ChangePiece[] {
  const parts: ChangePiece[] = [];
  for (const row of rows) {
    const edit = edits[row.id];
    if (!edit) continue;
    const verb = edit.action === 'delete' ? 'deleted' : 'altered';
    const name = row.id.startsWith('attachment:') ? row.text : row.id === 'made' ? messages.details.appName : row.label.toLowerCase();
    parts.push({ name, verb });
  }
  return parts;
}

export const changesSummary = (rows: DetailRow[], edits: DetailEdits, messages: RedactMessages = en): string => (
  changesPieces(rows, edits, messages).map((piece) => `${piece.name} ${messages.details.verbs[piece.verb]}`).join(', ')
);

const isText = (id: string): id is (typeof TEXT_ROWS)[number] => (TEXT_ROWS as readonly string[]).includes(id);

function attachmentSurvives(id: string, saved: DocumentTraces): boolean {
  const rest = id.slice('attachment:'.length);
  const split = rest.indexOf(':');
  const pageIndex = split === 0 ? undefined : Number(rest.slice(0, split));
  const name = rest.slice(split + 1);
  return saved.attachments.some((file) => file.name === name && file.pageIndex === pageIndex);
}

/** Ids of edits that did not take, the implied ones too (Hidden, Changed), read back from the saved file. */
export function survivedDetails(edits: DetailEdits, saved: DocumentTraces): string[] {
  const out: string[] = [];
  for (const [id, edit] of Object.entries(expandDetailEdits(edits))) {
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

/**
 * Page pictures and app data always go on export, whatever the person edited,
 * so finding either in the saved file is a failure of its own. Labels, not ids.
 */
export function survivedAlways(saved: DocumentTraces, messages: RedactMessages = en): string[] {
  const out: string[] = [];
  if (saved.thumbnails.length > 0) out.push(messages.details.pagePictures);
  if (saved.pieceInfo) out.push(messages.details.appData);
  return out;
}


/** A survivor's label for the alert: from its row, or its plain label while the rows are still loading. */
export function survivorLabel(id: string, rows: DetailRow[], messages: RedactMessages = en): string {
  const { labels } = messages.details;
  const plain: Record<string, string> = { made: labels.app, scripts: labels.scripts, hidden: labels.hidden, created: labels.created, changed: labels.changed };
  const row = rows.find((r) => r.id === id);
  if (row) return id.startsWith('attachment:') ? row.text : row.label;
  if (id.startsWith('attachment:')) {
    const rest = id.slice('attachment:'.length);
    return rest.slice(rest.indexOf(':') + 1);
  }
  return plain[id] ?? labels[id as keyof typeof labels] ?? id.charAt(0).toUpperCase() + id.slice(1);
}
