import {render} from 'preact';
import {act} from 'preact/test-utils';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import AiPdfFillerPanel from './AiPdfFillerPanel.tsx';
import type {PdfEditorSession} from '../PdfSignTool.tsx';
import {createPageGeometry} from '../../../editor/geometry/coords.ts';

const measureMock = vi.hoisted(() => vi.fn());
vi.mock('./measureProposalText.ts', () => ({measureProposalText: measureMock}));

describe('AI requests cannot replace manual work', () => {
  let host: HTMLDivElement;
  let session: PdfEditorSession;
  let complete!: (response: Response) => void;
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    measureMock.mockReset().mockResolvedValue((text: string, _font: string, size: number) => text.length * size / 2);
    host = document.createElement('div'); document.body.appendChild(host);
    const page = {getViewport: ({scale}: {scale:number}) => ({width: 500 * scale,height: 700 * scale}), render: () => ({promise: Promise.resolve(),cancel: vi.fn()})};
    session = {pdfDocument: {getPage: async () => page} as never,pageSizes:[createPageGeometry({cropBox:{x:0,y:0,width:500,height:700}})],currentPageIndex:0,documentRevision:1,status:'editing',applyElements:vi.fn(() => true)};
    fetchMock = vi.fn((url: string, _options?: RequestInit) => url.endsWith('/status') ? Promise.resolve(new Response(JSON.stringify({localRunner:true,connected:true,models:[{slug:'model',display_name:'Model'}]}))) : new Promise<Response>(resolve => {complete = resolve;}));
    vi.stubGlobal('fetch',fetchMock);
    vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({} as never);
    vi.spyOn(HTMLCanvasElement.prototype,'toDataURL').mockReturnValue('data:image/png;base64,AA==');
  });
  afterEach(() => {act(() => render(null,host)); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();});
  const button = (label: string) => Array.from(host.querySelectorAll('button')).find(item => item.textContent === label)!;
  async function start() {
    act(() => render(<AiPdfFillerPanel session={session} />,host));
    await vi.waitFor(() => expect(host.textContent).toContain('Connected.'));
    act(() => {const facts = host.querySelector('textarea')! as HTMLTextAreaElement; facts.value='Name: Example'; facts.dispatchEvent(new Event('input',{bubbles:true}));});
    act(() => button('Fill page 1 with AI').click());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  }
  function reply() {complete(new Response(JSON.stringify({fields:[{id:'name',label:'Name',kind:'text',x:10,y:10,width:100,height:25,value:'Example'}],questions:[]})));}
  it('discards a completed response after a manual document edit', async () => {
    await start();
    session={...session,documentRevision:2};
    act(() => render(<AiPdfFillerPanel session={session} />,host));
    await act(async () => reply());
    await vi.waitFor(() => expect(host.textContent).toContain('PDF changed during analysis'));
    expect(button('Apply reviewed answers')).toBeUndefined();
    expect(session.applyElements).not.toHaveBeenCalled();
  });
  it('invalidates an old-facts response when the facts change during analysis', async () => {
    await start();
    const signal = fetchMock.mock.calls[1][1]?.signal as AbortSignal;
    act(() => {const facts = host.querySelector('textarea')! as HTMLTextAreaElement; facts.value='Name: Changed'; facts.dispatchEvent(new Event('input',{bubbles:true}));});
    expect(signal.aborted).toBe(true);
    await act(async () => reply());
    expect(host.textContent).toContain('Facts updated.');
    expect(button('Apply reviewed answers')).toBeUndefined();
    expect(session.applyElements).not.toHaveBeenCalled();
  });
  it('cancels into manual mode and ignores a late provider response', async () => {
    await start();
    const signal = fetchMock.mock.calls[1][1]?.signal as AbortSignal;
    act(() => button('Use manual mode').click());
    expect(signal.aborted).toBe(true);
    await act(async () => reply());
    expect(host.textContent).toContain('Manual mode.');
    expect(button('Apply reviewed answers')).toBeUndefined();
    expect(session.applyElements).not.toHaveBeenCalled();
  });
  it('waits for font measurement before applying and discards cancellation during that wait', async () => {
    let ready!: (measure: (text: string, font: string, size: number) => number) => void;
    measureMock.mockImplementation(() => new Promise(resolve => {ready = resolve;}));
    await start(); await act(async () => reply());
    await vi.waitFor(() => expect(button('Apply reviewed answers')).toBeDefined());
    act(() => button('Apply reviewed answers').click());
    expect(session.applyElements).not.toHaveBeenCalled();
    act(() => button('Use manual mode').click());
    await act(async () => ready(() => 20));
    expect(session.applyElements).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Manual mode.');
  });
  it('rejects a document edit while waiting for the resolved font', async () => {
    let ready!: (measure: (text: string, font: string, size: number) => number) => void;
    measureMock.mockImplementation(() => new Promise(resolve => {ready = resolve;}));
    await start(); await act(async () => reply());
    await vi.waitFor(() => expect(button('Apply reviewed answers')).toBeDefined());
    act(() => button('Apply reviewed answers').click());
    session = {...session, documentRevision: 2};
    act(() => render(<AiPdfFillerPanel session={session} />, host));
    await act(async () => ready(() => 20));
    expect(session.applyElements).not.toHaveBeenCalled();
    expect(host.textContent).toContain('PDF changed.');
  });

});
