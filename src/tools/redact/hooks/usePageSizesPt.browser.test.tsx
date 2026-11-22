import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { HttpResponse } from 'msw';
import { PDFDocument } from '@cantoo/pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { getPdfjs } from '#lib/pdf/loadPdfjs.js';
import { drainPromises } from '../../../test/support/drainPromises.ts';
import { answerInTurn, answerNetwork } from '../../../test/support/network.browser.ts';
import { reportError, resetErrorReportingForTests, setReportingEnabledForTests } from '#lib/telemetry/errorReport.ts';
import usePageSizesPt from './usePageSizesPt.ts';

answerNetwork();

const PAGES = 3;

async function openDocument() {
  const pdf = await PDFDocument.create();
  for (let page = 0; page < PAGES; page += 1) pdf.addPage([612, 792]);
  const task = (await getPdfjs()).getDocument({ data: await pdf.save() });
  return { task, document: await task.promise };
}

function Sizes({ document }: { document: PDFDocumentProxy }) {
  usePageSizesPt(document, PAGES, true);
  return null;
}

let host: HTMLElement | null = null;

beforeEach(() => {
  resetErrorReportingForTests();
  setReportingEnabledForTests(true);
});

afterEach(() => {
  setReportingEnabledForTests(false);
  if (host) render(null, host);
  host?.remove();
  host = null;
});

const accepted = () => new HttpResponse(null, { status: 204 });
const stepOf = async (request: Request) => ((await request.json()) as { step?: string }).step;

async function readWhileClosing({ unmount }: { unmount: boolean }) {
  const { task, document } = await openDocument();
  host = window.document.createElement('div');
  window.document.body.append(host);
  await act(() => render(<Sizes document={document} />, host!));
  if (unmount) await act(() => render(null, host!));
  await task.destroy();
  await act(drainPromises);
}

describe('usePageSizesPt', () => {
  it('reports a size read that fails while the document is still shown', async () => {
    const reports = answerInTurn('post', '/api/report', accepted);
    await readWhileClosing({ unmount: false });
    await reports.arrived(1);
    expect(await stepOf(reports[0]!)).toBe('read_page_sizes');
  });

  it('reports nothing when the island closes the document while its sizes are read', async () => {
    const reports = answerInTurn('post', '/api/report', accepted);
    await readWhileClosing({ unmount: true });
    reportError('redact', new Error('sent after the read settled'), 'after_the_read');
    await reports.arrived(1);
    expect(await stepOf(reports[0]!)).toBe('after_the_read');
  });
});
