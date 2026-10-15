// @ts-nocheck - renders islands from several tools; this folder is the cross-tool exemption
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach } from 'vitest';
import PdfMergeTool from '../../tools/merge/PdfMergeTool.tsx';
import PdfSplitTool from '../../tools/split/PdfSplitTool.tsx';
import PdfCompressTool from '../../tools/compress/PdfCompressTool.tsx';
import PdfToImageTool from '../../tools/to-image/PdfToImageTool.tsx';
import PdfImageToPdfTool from '../../tools/image-to-pdf/PdfImageToPdfTool.tsx';
import PdfSecurityTool from '../../tools/security/PdfSecurityTool.tsx';
import PdfEditPagesTool from '../../tools/edit-pages/PdfEditPagesTool.tsx';
import PdfSignTool from '../../tools/sign/PdfSignTool.tsx';
import PdfRedactTool from '../../tools/redact/PdfRedactTool.tsx';
import paper from '../../shell/verb/paper.module.css';
import dropzone from '../../shell/Dropzone.module.css';

// docs/tool-hero-show-the-verb.md, Guards: every page-grid tool's empty sheet shows its
// verb (VerbStage) instead of the generic file-plus icon.

const WITH_VERB = [
  ['merge', () => <PdfMergeTool />],
  ['image-to-pdf', () => <PdfImageToPdfTool />],
  ['security (unlock/protect)', () => <PdfSecurityTool />],
  ['edit-pages', () => <PdfEditPagesTool />],
  ['to-image', () => <PdfToImageTool />],
  ['compress', () => <PdfCompressTool />],
  ['compress-image', () => <PdfCompressTool analyticsTool="compress-image" />],
  ['split', () => <PdfSplitTool />],
  ['sign', () => <PdfSignTool />],
  ['redact', () => <PdfRedactTool />],
];

let container;

function renderEmpty(make) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    render(make(), container);
  });
  const sheet = container.querySelector('[data-empty-state]');
  expect(sheet).not.toBeNull();
  return sheet;
}

afterEach(() => {
  if (container) {
    act(() => render(null, container));
    container.remove();
    container = null;
  }
});

describe('page-grid tools pass an emptyArt', () => {
  it.each(WITH_VERB)('%s shows the verb stage, not the file-plus icon', (_name, make) => {
    const sheet = renderEmpty(make);
    expect(sheet.querySelector(`[aria-hidden="true"].${paper.box}`)).not.toBeNull();
    expect(sheet.querySelector(`.${dropzone['dropzone-icon']}`)).toBeNull();
  });
});
