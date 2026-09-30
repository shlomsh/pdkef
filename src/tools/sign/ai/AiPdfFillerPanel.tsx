import { useEffect, useRef, useState } from 'preact/hooks';
import type { PdfEditorSession } from '../PdfSignTool.tsx';
import { proposalElements, validateAnalysis, type Analysis } from './proposals.ts';
import styles from './AiPdfFillerPanel.module.css';

type Runner = { localRunner: true; connected: boolean; models: {slug: string; display_name: string}[] };
type Review = Analysis & {image: string; width: number; height: number; pageIndex: number; revision: number};

export default function AiPdfFillerPanel({session}: {session: PdfEditorSession}) {
  const [runner, setRunner] = useState<Runner | null>(null);
  const [model, setModel] = useState('');
  const [facts, setFacts] = useState('');
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [notice, setNotice] = useState('Checking the local preview connection…');
  const request = useRef<AbortController | null>(null);
  const live = useRef(session);
  live.current = session;

  async function checkConnection(signal?: AbortSignal) {
    try {
      const response = await fetch('/api/ai/status', {signal});
      if (!response.ok) throw new Error();
      const result = await response.json() as Runner;
      if (result.localRunner !== true || typeof result.connected !== 'boolean' || !Array.isArray(result.models) || result.models.some(item => !item || typeof item.slug !== 'string' || typeof item.display_name !== 'string')) throw new Error();
      setRunner(result);
      setModel(previous => result.models.some(item => item.slug === previous) ? previous : result.models[0]?.slug ?? '');
      setNotice(result.connected ? 'Connected. Review every answer before signing.' : 'Connect your ChatGPT account to try this local preview.');
    } catch (error) {
      if (signal?.aborted) return;
      setRunner(null);
      setNotice('AI requires the PDkef local preview runner. You can fill and sign this PDF manually here.');
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void checkConnection(controller.signal);
    return () => {controller.abort(); request.current?.abort();};
  }, []);
  function invalidateAnalysis() {
    request.current?.abort(); request.current = null;
    setBusy(false); setReview(null);
  }
  useEffect(() => {
    invalidateAnalysis();
  }, [session.pdfDocument, session.currentPageIndex]);

  function useManual() {
    request.current?.abort(); request.current = null;
    setBusy(false); setReview(null); setManual(true);
    setNotice('Manual mode. All applied answers and signatures remain editable below.');
  }
  async function analyze() {
    const controller = new AbortController();
    request.current?.abort(); request.current = controller;
    const started = live.current;
    const pageIndex = started.currentPageIndex;
    setBusy(true); setReview(null); setNotice('Analyzing this page…');
    try {
      const page = await started.pdfDocument.getPage(pageIndex + 1);
      const base = page.getViewport({scale: 1});
      const viewport = page.getViewport({scale: Math.min(2, 1800 / Math.max(base.width, base.height))});
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const render = page.render({canvas, canvasContext: canvas.getContext('2d')!, viewport});
      const cancelRender = () => render.cancel();
      controller.signal.addEventListener('abort', cancelRender, {once: true});
      try {await render.promise;} finally {controller.signal.removeEventListener('abort', cancelRender);}
      if (controller.signal.aborted) return;
      const image = canvas.toDataURL('image/png');
      const response = await fetch('/api/ai/analyze', {method: 'POST', signal: controller.signal,
        headers: {'Content-Type': 'application/json'}, body: JSON.stringify({model, image, facts, width: canvas.width, height: canvas.height})});
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'AI analysis failed. You can continue manually.');
      const analysis = validateAnalysis(payload, canvas.width, canvas.height);
      if (controller.signal.aborted || request.current !== controller) return;
      if (live.current.pdfDocument !== started.pdfDocument || live.current.documentRevision !== started.documentRevision) {
        setNotice('The PDF changed during analysis. Your edits are safe; analyze again when ready.'); return;
      }
      setReview({...analysis, image, width: canvas.width, height: canvas.height, pageIndex, revision: started.documentRevision});
      setNotice(`Review ${analysis.fields.length} proposed fields on page ${pageIndex + 1}. Empty answers stay unfilled.`);
    } catch (error) {
      if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : 'AI failed. You can continue manually.');
    } finally {
      if (request.current === controller) {setBusy(false); request.current = null;}
    }
  }
  function apply() {
    if (!review) return;
    const geometry = session.pageSizes[review.pageIndex];
    if (!geometry) {setNotice('This page is not ready. Continue manually or retry.'); return;}
    const validated = validateAnalysis(review, review.width, review.height);
    const elements = proposalElements(validated.fields, review, review.pageIndex, geometry);
    if (!elements.length) {setNotice('No supplied answers to apply. Update your facts or fill manually.'); return;}
    if (!session.applyElements(elements, review.revision)) {
      setNotice('The PDF changed. Analyze again before applying; your manual edits are safe.'); return;
    }
    setReview(null); setNotice('Answers applied. Correct anything below, add your signature, then download.');
  }
  return <section className={styles.panel} aria-label="AI PDF Filler beta">
    <div className={styles.row}><strong>AI PDF Filler <span className={styles.beta}>Beta · local preview</span></strong>
      <button type="button" onClick={manual ? () => {setManual(false); setNotice('AI mode. Your manual work stays in the editor.');} : useManual}>{manual ? 'Use AI' : 'Use manual mode'}</button></div>
    <p role="status" aria-live="polite">{notice}</p>
    {!manual && <>
      <p>This experiment sends only the selected original PDF page image and the facts you enter to OpenAI using your connected ChatGPT plan. Applied annotations and signatures are not sent. Use synthetic facts while trying the beta.</p>
      <div className={styles.row}>
        {runner && !runner.connected && <a className={styles.connect} href="/auth/start" target="_blank" rel="noopener noreferrer">Continue with ChatGPT</a>}
        <button type="button" onClick={() => void checkConnection()}>Check connection</button>
        {runner?.connected && <label>Model <select value={model} onChange={event => {invalidateAnalysis(); setModel(event.currentTarget.value); setNotice('Model changed. Analyze again when ready.');}}>{runner.models.map(item => <option key={item.slug} value={item.slug}>{item.display_name || item.slug}</option>)}</select></label>}
      </div>
      <label className={styles.facts}>Facts to use <textarea rows={4} maxLength={12000} value={facts} onInput={event => {invalidateAnalysis(); setFacts(event.currentTarget.value); setNotice('Facts updated. Analyze again when ready.');}} placeholder="Name: Example Person&#10;Address: 12 Example Street" /></label>
      <div className={styles.row}><button type="button" disabled={busy || !runner?.connected || !model || !facts.trim() || session.status !== 'editing'} onClick={() => void analyze()}>Fill page {session.currentPageIndex + 1} with AI</button>
        {busy && <button type="button" onClick={useManual}>Cancel and fill manually</button>}</div>
      {review && <>
        <div className={styles.preview} aria-label={`Proposed answers on page ${review.pageIndex + 1}`}>
          <img src={review.image} alt="Original PDF page with proposed answers" />
          {review.fields.map(field => <span key={field.id} className={styles.proposal} title={field.label} dir="auto" style={{left: `${field.x / review.width * 100}%`, top: `${field.y / review.height * 100}%`, width: `${field.width / review.width * 100}%`, height: `${field.height / review.height * 100}%`}}>{field.value || '?'}</span>)}
        </div>
        <p>These are proposals. Edit answers here, then apply and adjust their positions in the PDF editor.</p>
        <div className={styles.answers}>{review.fields.map(field => <label key={field.id}>{field.label || 'Unlabelled field'} {field.kind === 'checkbox' ? <input type="checkbox" checked={['true','yes','checked','check','x','1'].includes(field.value?.toLowerCase() ?? '')} onChange={event => setReview({...review, fields: review.fields.map(item => item.id === field.id ? {...item,value: event.currentTarget.checked ? 'true' : null} : item)})} /> : <input dir="auto" value={field.value ?? ''} maxLength={2000} onInput={event => setReview({...review, fields: review.fields.map(item => item.id === field.id ? {...item,value: event.currentTarget.value} : item)})} />}</label>)}</div>
        {review.questions.length > 0 && <div><strong>Missing or unclear facts</strong><ul>{review.questions.map(question => <li key={question}>{question}</li>)}</ul><p>Add these facts above, then analyze again.</p></div>}
        <button type="button" onClick={apply} disabled={session.status !== 'editing' || session.documentRevision !== review.revision}>Apply reviewed answers</button>
      </>}
    </>}
  </section>;
}
