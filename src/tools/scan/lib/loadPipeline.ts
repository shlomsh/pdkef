type Pipeline = typeof import('./scanPipeline.ts');
let pipelinePromise: Promise<Pipeline> | null = null;

/** The warp, filter and edge code load once, when the first photo arrives (docs/scan-to-pdf.md). */
export const loadPipeline = () => (pipelinePromise ??= import('./scanPipeline.ts'));
