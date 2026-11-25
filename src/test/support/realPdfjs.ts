import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as pdfjs from 'pdfjs-dist';

// A file URL built from the working directory: it resolves in the Node and jsdom environments alike
// (jsdom resolves a bundled worker's URL to http, which node's loader refuses).
const workerFile = (build: string) => pathToFileURL(resolve(process.cwd(), `node_modules/pdfjs-dist/${build}pdf.worker.mjs`)).href;

type WorkerHost = { GlobalWorkerOptions: object };

/** Points a real pdf.js build at its own worker file, and keeps it there when the code under test sets it. */
function pointAtWorker(lib: WorkerHost, url: string) {
  Object.defineProperty(lib.GlobalWorkerOptions, 'workerSrc', { get: () => url, set() {}, configurable: true });
}

/** The legacy (Node) build, as the tests that import `pdfjs-dist/legacy/build/pdf.mjs` open real PDFs. */
export const pointAtLegacyWorker = (lib: WorkerHost) => pointAtWorker(lib, workerFile('legacy/build/'));

// The shipped pdf.js, pointed at its own worker file.
pointAtWorker(pdfjs, workerFile('build/'));
