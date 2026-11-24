import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import PagePreview from './PagePreview.tsx';
import { planPreview } from '../lib/previewPlan.js';
import { realFile } from './securityTool.test-helper.tsx';
import { installToolHarness, type ToolHarness } from '../../../test/harness/toolHarness.ts';
import { waitUntil } from '../../../test/support/waitUntil.ts';
import { drainPromises } from '../../../test/support/drainPromises.ts';

type Props = Parameters<typeof PagePreview>[0];
type Plan = Props['plan'];

const plan = (state: Parameters<typeof planPreview>[0]): Plan => {
  const planned = planPreview(state);
  if (!planned) throw new Error('Expected a plan');
  return planned;
};
const NEEDS_PASSWORD = plan({ mode: 'unlock', status: 'idle', noPassword: false });
const NOT_PROTECTED = plan({ mode: 'protect', status: 'idle', noPassword: false });
const PROTECTED = plan({ mode: 'protect', status: 'done', noPassword: false });
const brokenPdf = () => realFile('unreadable');

describe('PagePreview', () => {
  let harness: ToolHarness;
  let container: HTMLDivElement;
  const show = (props: Partial<Props> = {}) => act(() => {
    render(<PagePreview plan={NOT_PROTECTED} source={null} label="First page" {...props} />, container);
  });
  const section = () => container.querySelector('[data-security-preview]');
  const frame = () => container.querySelector('[data-page-frame]');
  const tag = () => container.querySelector('[data-preview-tag]');
  const placeholderIcon = () => container.querySelector('[data-page-frame] svg')?.getAttribute('class') ?? '';
  const busy = () => frame()?.getAttribute('aria-busy');
  const reports = async () => { await harness.flush(); return harness.reports(); };

  beforeEach(() => {
    harness = installToolHarness();
    container = document.createElement('div');
    document.body.append(container);
  });
  afterEach(() => {
    act(() => { render(null, container); });
    container.remove();
    harness.restore();
  });

  it('names its section by the label it is given', async () => {
    await show({ label: 'Page one of the file' });
    expect(section()?.getAttribute('aria-label')).toBe('Page one of the file');
  });

  it('shows the plan tag, with no lock in it before the protection is done', async () => {
    await show({ plan: NOT_PROTECTED });
    expect(tag()?.textContent).toBe('Not protected');
    expect(tag()?.querySelector('svg')).toBeNull();
  });

  it('puts a lock in the tag once the protection is done', async () => {
    await show({ plan: PROTECTED });
    expect(tag()?.textContent).toBe('Protected');
    expect(tag()?.querySelector('svg')?.getAttribute('class')).toContain('lucide-lock');
  });

  it('draws a lock placeholder for a locked plan and a page placeholder for any other', async () => {
    await show({ plan: NEEDS_PASSWORD });
    expect(placeholderIcon()).toContain('lucide-lock');
    expect(container.querySelector('[data-page-frame] img')).toBeNull();
    await show({ plan: NOT_PROTECTED });
    expect(placeholderIcon()).toContain('lucide-file-text');
    expect(placeholderIcon()).not.toContain('lucide-lock');
  });

  it('is busy while it waits for a source, and not otherwise', async () => {
    await show({ pending: true });
    expect(busy()).toBe('true');
    await show({ pending: false });
    expect(busy()).toBeNull();
  });

  it('is busy while a source is drawn, then keeps the placeholder and reports once when it cannot be', async () => {
    await show({ source: brokenPdf() });
    expect(busy()).toBe('true');
    await waitUntil(() => expect(busy()).toBeNull());
    expect(await reports()).toMatchObject([{ area: 'pdf_render', step: 'render_security_preview', name: 'InvalidPDFException' }]);
    expect(container.querySelector('[data-page-frame] img')).toBeNull();
    expect(placeholderIcon()).toContain('lucide-file-text');
    expect(tag()?.textContent).toBe('Not protected');
  });

  it('reports nothing when the run already failed for the same file', async () => {
    await show({ source: brokenPdf(), failed: true });
    await waitUntil(() => expect(busy()).toBeNull());
    await act(async () => { await drainPromises(); });
    expect(await reports()).toEqual([]);
  });

  it('is busy again when the same source comes back after it was cleared', async () => {
    const source = brokenPdf();
    await show({ source });
    await waitUntil(() => expect(busy()).toBeNull());
    await show({ source: null });
    expect(busy()).toBeNull();
    await show({ source });
    expect(busy()).toBe('true');
    await waitUntil(() => expect(busy()).toBeNull());
  });
});
