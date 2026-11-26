// Inspects and processes Scan's pages off the main thread (SCAN-21), so the live camera and the page stay
// smooth while a 12 MP photo is decoded, measured, flattened and encoded. Started by offThread.ts.
import { answer } from './pageAnswer.ts';
import type { PageRequest } from './protocol.ts';

self.onmessage = async (e: MessageEvent<PageRequest>) => self.postMessage(await answer(e.data));
