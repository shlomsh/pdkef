# Redaction guide visual assets

Created for `/blur-vs-blackout-vs-delete-pdf/` on 28 August 2026.

## Sources and boundaries

The tool screenshots use the real local PDkef app and a fictional PDF created with the project's existing `@cantoo/pdf-lib` dependency. The sample contains only an example.com address, a `DEMO-` reference, and a draft note. No real personal data is present, and no image-generation model was used to invent interface controls.

The accompanying SVG is an explanatory diagram, **not** a screenshot. It uses PDkef's Sea Glass palette and labels itself as a diagram. It must not be presented as the editor's exact interface.

## Assets

| Asset | Intrinsic dimensions | Suggested alt text |
| --- | --- | --- |
| `/images/redaction-guide/flatten.svg` | 1200 × 560 | Diagram showing an editable blackout box becoming part of one flattened page image when the PDF is downloaded. |
| `/images/redaction-guide/sample.pdf` | One page, 680 × 500 PDF points | Download a fictional sample PDF to try the redaction tools. |

## Accuracy notes

- Blur, Blackout and Whiteout are editable marks while in the editor.
- Download automatically flattens pages with these marks. There is no separate Flatten button.
- Pages with no such marks are not automatically rasterized.
- Flattening removes the separate editable cover and original text layer from a rasterized page. It does not make blurred pixels safe for secrets; visual patterns may remain.
- Delete is useful for document cleanup. It is not a sanitization guarantee: residual source streams or resources may remain in a Delete-only file.
- Review the downloaded PDF before sharing. The draft on the same device is separate from the exported copy.

These statements were checked against `PdfRedactTool.tsx`, `RedactToolbar.tsx`, `applyPageEdits.js`, and `redact.js`. The main task separately audited deletion behavior.

## Reproduction

1. Start the development server and visit `/redact/` on a fresh local origin. A previously installed service worker on another local origin can serve stale built HTML.
2. Choose `public/images/redaction-guide/sample.pdf`.
3. Select Blur and drag around the example email. Select Blackout and drag around the demo reference. Select Delete and click the highlighted draft-note text run.
4. Capture the actual editor through Browser's screenshot API. Crop to the toolbar and document, preserving all visible UI pixels. Optimize to WebP with the existing `sharp` dependency, without overlaying fabricated labels.
5. For the conceptual SVG, render with `sharp` and inspect the resulting PNG for layout and legibility.

The SVG was rendered to a 1200 × 560 PNG and visually inspected. A silent video was not produced: the supported browser surface provides screenshots, not a recording API. A sequence of real screenshots and the lightweight diagram avoids shipping a fabricated video.
