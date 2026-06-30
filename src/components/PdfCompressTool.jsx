import { useState } from 'preact/hooks';
import BasePdfTool from './BasePdfTool.jsx';

export default function PdfCompressTool() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle');

  const handleFilesAdded = (files) => {
    const pdfs = Array.from(files).filter(f => f.type === 'application/pdf');
    if (pdfs.length > 0) {
      setFile(pdfs[0]); 
    }
  };

  const handleCompress = () => {
    setStatus('processing');
    setTimeout(() => {
      setStatus('done');
    }, 1500);
  };

  const reset = () => {
    setFile(null);
    setStatus('idle');
  };

  const hasFiles = !!file;

  return (
    <BasePdfTool hasFiles={hasFiles} onFilesAdded={handleFilesAdded} multiple={false}>
      {hasFiles && (
        <div class="tool-workspace">
          <div class="list-header">
            <span class="list-count">Compressing: {file.name}</span>
            <button type="button" class="clear-all" onClick={reset}>
              Start over
            </button>
          </div>

          <div class="mock-ui-placeholder" style={{ margin: '2rem 0', padding: '2rem', textAlign: 'center', background: 'var(--color-surface-sunken)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--color-border-strong)' }}>
            <p style={{ color: 'var(--color-muted)' }}><em>[Compression Level Slider will be rendered here]</em></p>
          </div>

          <button
            type="button"
            class={`merge-button${status === 'processing' ? ' is-merging' : ''}${status === 'done' ? ' is-done' : ''}`}
            disabled={status === 'processing'}
            onClick={handleCompress}
          >
            {status === 'processing' ? 'Compressing...' : 'Compress PDF'}
          </button>

          {status === 'done' && (
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <p style={{ color: 'var(--color-success)', fontWeight: '600' }}>Done! (Mock Phase 1)</p>
            </div>
          )}
        </div>
      )}
    </BasePdfTool>
  );
}
