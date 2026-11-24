import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as pdfjs from 'pdfjs-dist';

// The shipped pdf.js, pointed at its own worker file: jsdom resolves the bundled worker's URL to http.
const workerUrl = pathToFileURL(resolve(process.cwd(), 'node_modules/pdfjs-dist/build/pdf.worker.mjs')).href;
Object.defineProperty(pdfjs.GlobalWorkerOptions, 'workerSrc', { get: () => workerUrl, set() {}, configurable: true });
