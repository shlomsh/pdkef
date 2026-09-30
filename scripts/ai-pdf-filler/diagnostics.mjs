import { mkdir, appendFile, stat, rename, chmod } from 'node:fs/promises';
import { dirname } from 'node:path';
export const clientStages = new Set(['started', 'review_ready', 'applied', 'stale_result_discard', 'page_source_change', 'facts_change', 'model_change', 'manual_cancel', 'error', 'font_error', 'apply_stale', 'apply_empty']);
const codes = new Set(['auth_missing', 'image_limit', 'invalid_request', 'model_unavailable', 'upstream_unavailable', 'stream_failure', 'schema_failure', 'local_failure']);
export function errorCode(error) {
  const message = error?.message;
  if (message === 'ChatGPT analysis unavailable. Check access/usage or use manual mode.') return 'upstream_unavailable';
  if (typeof message === 'string' && /^AI (stream|analysis|response|proposal)/.test(message)) return 'stream_failure';
  if (typeof message === 'string' && /^AI returned/.test(message)) return 'schema_failure';
  return 'local_failure';
}
export const stages = new Set(['accepted', 'upstream_headers', 'first_event', 'completed', 'schema_valid', 'schema_invalid', 'cancel', 'timeout', 'error']);
export function createDiagnostics(path, maxBytes = 1048576) {
  let queue = Promise.resolve(), pending = 0;
  return (requestId, stage, details = {}) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(requestId) || (!stages.has(stage) && !clientStages.has(stage))) return queue;
    if (pending >= 128) return Promise.resolve(); // Drop bursts instead of retaining unbounded work.
    pending++;
    const record = { time: new Date().toISOString(), requestId, stage };
    if (codes.has(details.code)) record.code = details.code;
    if (details.source === 'client') record.source = 'client';
    for (const key of ['elapsedMs', 'status', 'fields', 'questions']) {
      if (Number.isInteger(details[key]) && details[key] >= 0 && details[key] <= ({ fields: 200, questions: 100, status: 599, elapsedMs: 86400000 }[key])) record[key] = details[key];
    }
    // Never serialize exceptions, upstream bodies, model input, or arbitrary keys.
    const line = JSON.stringify(record) + '\n';
    queue = queue.then(async () => {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await chmod(dirname(path), 0o700);
      let size = 0; try { size = (await stat(path)).size; } catch (e) { if (e.code !== 'ENOENT') throw e; }
      if (size + Buffer.byteLength(line) > maxBytes) await rename(path, path + '.1');
      await appendFile(path, line, { mode: 0o600 }); await chmod(path, 0o600);
    }).catch(() => {}).finally(() => { pending--; }); // Logging failure must not break a fill request.
    return queue;
  };
}

export function validateClientEvent(input) {
  if (!input || Object.keys(input).some(key => !['requestId', 'stage', 'fields'].includes(key))
    || typeof input.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(input.requestId)
    || !clientStages.has(input.stage) || (input.fields !== undefined && (!Number.isInteger(input.fields) || input.fields < 0 || input.fields > 200))) return null;
  return { requestId: input.requestId, stage: input.stage, ...(input.fields === undefined ? {} : { fields: input.fields }) };
}
