// Reads what a sheet needs off the main thread (PE-06), so the first page stays smooth while a scan is assessed.
import { assess } from '#lib/pageEnhance/plan.ts';
import type { AssessReply, AssessRequest } from './assessor.ts';

self.onmessage = (e: MessageEvent<AssessRequest>) => {
  const { id, gray } = e.data;
  let reply: AssessReply;
  try {
    reply = { id, ok: true, value: assess(gray) };
  } catch (error) {
    // expected: the main thread learns the sheet could not be read, and the check ends there
    reply = { id, ok: false, error: String(error) };
  }
  self.postMessage(reply);
};
