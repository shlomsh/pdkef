/**
 * RED-59: the words for what a file said about itself. Pure: it takes the
 * `DocumentTraces` the adapter read and returns rows of parts, so the UI can
 * wrap a person's own text (`value`) in `<bdi>` and a `date` in `<time>`.
 */
import type { DocumentTraces } from '../../../editor/adapters/pdf/documentTraces.js';
import { pageList } from './checkCopy.ts';

export type TracePart =
  | { type: 'text'; text: string }
  | { type: 'value'; text: string }
  | { type: 'date'; iso: string; text: string };

export type TraceRowKind = 'made' | 'titled' | 'described' | 'other' | 'xmp' | 'attachment' | 'scripts' | 'thumbnail' | 'pageDetails';

export interface TraceRow {
  id: string;
  kind: TraceRowKind;
  parts: TracePart[];
  attachment?: string;
  pageIndex?: number;
}

const text = (t: string): TracePart => ({ type: 'text', text: t });
const value = (t: string): TracePart => ({ type: 'value', text: t });

function devicePhrase(source: string): string | null {
  if (source.includes('iPhone')) return 'on an iPhone';
  if (source.includes('iPad')) return 'on an iPad';
  if (source.includes('iOS')) return 'on an iPhone or iPad';
  if (source.includes('Android')) return 'on Android';
  if (source.includes('Mac OS') || source.includes('macOS')) return 'on a Mac';
  if (source.includes('Windows')) return 'on Windows';
  return null;
}

/** The recorded wall time, read back as the device's clock said it. */
const wallMs = (iso: string) => Date.parse(`${iso}Z`);

function datePart(iso: string, locale: string, now: Date): TracePart {
  const when = new Date(wallMs(iso));
  const sameYear = when.getUTCFullYear() === now.getUTCFullYear();
  const formatted = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' as const }),
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
  }).format(when);
  return { type: 'date', iso, text: formatted };
}

export function describeTraces(traces: DocumentTraces, options: { locale: string; now: Date }): TraceRow[] {
  const { locale, now } = options;
  const rows: TraceRow[] = [];

  const app = traces.creator || traces.producer;
  const created = traces.creationDate;
  if (app || created) {
    const parts: TracePart[] = [];
    if (app) {
      parts.push(value(app));
      const device = devicePhrase(`${traces.creator ?? ''} ${traces.producer ?? ''}`);
      if (device) parts.push(text(` ${device}`));
      if (created) parts.push(text(', '), datePart(created.iso, locale, now));
    } else if (created) {
      parts.push(text('Saved '), datePart(created.iso, locale, now));
    }
    const mod = traces.modDate;
    if (created && mod && wallMs(mod.iso) - wallMs(created.iso) >= 60_000) {
      parts.push(text(', changed '), datePart(mod.iso, locale, now));
    }
    rows.push({ id: 'made', kind: 'made', parts });
  }

  if (traces.title || traces.author) {
    const parts: TracePart[] = [];
    if (traces.title) {
      parts.push(text('“'), value(traces.title), text('”'));
      if (traces.author) parts.push(text(', by '), value(traces.author));
    } else if (traces.author) {
      parts.push(text('By '), value(traces.author));
    }
    rows.push({ id: 'titled', kind: 'titled', parts });
  }

  if (traces.subject || traces.keywords) {
    const parts: TracePart[] = [];
    if (traces.subject) parts.push(text('Described as “'), value(traces.subject), text('”'));
    if (traces.keywords) {
      parts.push(text(traces.subject ? ', tagged “' : 'Tagged “'), value(traces.keywords), text('”'));
    }
    rows.push({ id: 'described', kind: 'described', parts });
  }

  if (traces.otherInfoKeys.length > 0) {
    rows.push({ id: 'other', kind: 'other', parts: [text(`${traces.otherInfoKeys.length} more details the app added`)] });
  }

  if (traces.xmp.present) {
    rows.push({
      id: 'xmp',
      kind: 'xmp',
      parts: [text(traces.xmp.hasHistory ? 'A second set of details, with its save history' : 'A second set of details')],
    });
  }

  traces.attachments.forEach((file, index) => {
    const lead = file.pageIndex === undefined ? 'Attached: ' : `Attached in a comment on page ${file.pageIndex + 1}: `;
    rows.push({
      id: `attachment:${index}:${file.name}`,
      kind: 'attachment',
      parts: [text(lead), value(file.name)],
      attachment: file.name,
      ...(file.pageIndex === undefined ? {} : { pageIndex: file.pageIndex }),
    });
  });

  if (traces.scripts.document || traces.scripts.pages.length > 0) {
    rows.push({ id: 'scripts', kind: 'scripts', parts: [text('Scripts that run on open')] });
  }

  if (traces.thumbnails.length > 0) {
    const one = traces.thumbnails.length === 1;
    rows.push({
      id: 'thumbnail',
      kind: 'thumbnail',
      parts: [text(`A small picture of page${one ? '' : 's'} ${pageList(traces.thumbnails)} as ${one ? 'it was' : 'they were'}`)],
    });
  }

  if (traces.pageDetails.length > 0) {
    const one = traces.pageDetails.length === 1;
    rows.push({
      id: 'pageDetails',
      kind: 'pageDetails',
      parts: [text(`Hidden details on page${one ? '' : 's'} ${pageList(traces.pageDetails)}`)],
    });
  }

  return rows;
}

/** Ids of the rows whose kind is still present in the saved file's traces. */
export function survivedRows(rows: TraceRow[], saved: DocumentTraces): Set<string> {
  const out = new Set<string>();
  for (const row of rows) {
    let present = false;
    switch (row.kind) {
      case 'made': present = Boolean(saved.creator || saved.producer || saved.creationDate || saved.modDate); break;
      case 'titled': present = Boolean(saved.title || saved.author); break;
      case 'described': present = Boolean(saved.subject || saved.keywords); break;
      case 'other': present = saved.otherInfoKeys.length > 0; break;
      case 'xmp': present = saved.xmp.present; break;
      case 'attachment': present = saved.attachments.some((file) => file.name === row.attachment); break;
      case 'scripts': present = saved.scripts.document || saved.scripts.pages.length > 0; break;
      case 'thumbnail': present = saved.thumbnails.length > 0; break;
      case 'pageDetails': present = saved.pageDetails.length > 0; break;
    }
    if (present) out.add(row.id);
  }
  return out;
}
