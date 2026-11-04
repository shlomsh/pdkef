import { ScanLine } from 'lucide-preact';

export const scanToPdfEntry = {
  slug: 'scan-to-pdf',
  href: '/scan-to-pdf/',
  icon: ScanLine,
  gridDescription:
    'Turn photos of paper into a clean PDF: straighten each page, even out the light, keep it small.',
  sitemapPriority: '0.9',
  sitemapChangefreq: 'monthly',
  seoTitle: 'Scan to PDF Online Free - Scan Documents with Your Phone | PDkef',
  seoDescription:
    'Scan documents to PDF with your phone camera or photos you already have. Straighten pages, clean them up, pick A4 or Letter and a size limit. Free, no upload.',
  schemaName: 'PDkef - Scan to PDF',
  toolName: 'Scan to PDF',
  h1: 'Scan to PDF Online Free: Scan Documents with Your Phone',
  h1Name: 'Scan to PDF',
  subhead:
    'Take a photo of a page, or pick photos you already have, and get a clean PDF. Drag the corners to straighten each page, choose a crisp black-and-white look, and keep the file under the size a form asks for. Free, open source, and your photos stay on your device.',
  ariaLabel: 'Scan to PDF tool',
  aboutHeading: 'How to scan a document to PDF with your phone',
  aboutLead:
    'Photograph each page, check the corners, and download one PDF. The straightening and cleanup run in your browser, so a passport page or a signed form never leaves your phone.',
  freeNoteLead:
    'Scan as many pages as you like, with no account and no watermark. When an upload form caps files at 1 MB, set a size limit and the quality steps down until the PDF fits. For the scanners built into iPhone and Android, see <a class="font-medium text-[var(--color-primary-text)]" href="/how-to-scan-a-document-to-pdf/">how to scan a document to PDF</a>.',
  aboutSketch: 'grid',
  aboutIconPos: 'tl',
  faqSketch: 'rings',
  faqIconPos: 'br',
  steps: [
    { title: 'Add your pages', text: 'Take a photo of each page, or pick photos you already have. Each photo becomes one page.' },
    { title: 'Straighten and clean up', text: 'Drag the four corners to the edges of each page, which are placed for you when they can be found. Choose Document for crisp black text on white.' },
    { title: 'Download', text: "Pick A4, Letter or each scan's own size and an optional size limit, then download, or take the PDF straight to Sign, Merge or Compress." },
  ],
  faq: [
    { question: 'Is Scan to PDF free?', answer: 'Yes. Like every tool on PDkef, it is free with no signup, no watermark and no page limit.' },
    { question: 'Are my photos uploaded?', answer: 'No. The corners, the straightening, the cleanup and the PDF itself are all made in your browser. Your photos never leave your device, and there is no processing server.' },
    { question: 'Can I scan with my phone camera?', answer: 'Yes. On a phone, Take a photo opens the camera, one page per shot. You can also pick photos you already took, or JPG and PNG files on a computer.' },
    { question: 'How do I straighten a crooked page?', answer: "Each page has four corners. They are placed on the page edges when those can be found; drag any corner onto the page's real corner and the page is flattened into a rectangle, as if it had been scanned flat." },
    { question: 'What does the Document look do?', answer: 'It evens out shadows and uneven light, then turns the page into dark text on a white background, which reads well and keeps the file small. Original keeps the colours and Grayscale drops them.' },
    { question: 'Can I keep the PDF under 1 MB?', answer: 'Yes. Choose a size limit and the image quality, and then the resolution, steps down until the whole PDF is under it. The final size is shown before you download, and if a long scan cannot get that small, it tells you so.' },
    { question: 'What page size will the PDF be?', answer: 'Fit keeps each page the size of its scan. A4 and Letter put every page on that paper size, turned to match the scan, so it prints at the size people expect.' },
    { question: 'Can I sign or merge the scan afterwards?', answer: 'Yes. Once the PDF is ready, Sign, Merge and Compress each take it with one tap, with no need to download it and open it again.' },
  ],
  examples: {
    heading: 'What you get',
    lead: 'Every picture here was made by Scan to PDF from one sample photo, in a browser, the same way it runs for you.',
    figures: [
      {
        kind: 'compare',
        beforeSrc: '/images/scan-guide/photo.jpg',
        afterSrc: '/images/scan-guide/scan.jpg',
        beforeLabel: 'Photo',
        afterLabel: 'Scan',
        alt: 'A form photographed at an angle on a dark table, and the flat, even page Scan to PDF made from it',
        width: 900,
        height: 1200,
        caption: 'Four corners and the Document look turn a page photographed at an angle into a flat, even scan.',
      },
      {
        kind: 'row',
        heading: 'Three looks',
        caption: 'Original keeps the colours, Grayscale drops them, and Document evens out the light for dark text on white.',
        items: [
          { src: '/images/scan-guide/look-original.jpg', label: 'Original', width: 600, height: 800, alt: 'The scanned page in its original colours' },
          { src: '/images/scan-guide/look-grayscale.jpg', label: 'Grayscale', width: 600, height: 800, alt: 'The same page in shades of gray' },
          { src: '/images/scan-guide/look-document.jpg', label: 'Document', width: 600, height: 800, alt: 'The same page with even light, dark text on a white background' },
        ],
      },
      {
        kind: 'row',
        heading: 'Page size',
        caption: "Fit keeps the scan's own shape. A4 and Letter lay it on that paper, turned to match.",
        items: [
          { src: '/images/scan-guide/size-fit.jpg', label: 'Fit', width: 600, height: 800, alt: 'The scan as a page with exactly its own shape' },
          { src: '/images/scan-guide/size-a4.jpg', label: 'A4', width: 600, height: 800, alt: 'The scan laid on an A4 page' },
          { src: '/images/scan-guide/size-letter.jpg', label: 'Letter', width: 600, height: 800, alt: 'The scan laid on a Letter page' },
        ],
      },
      {
        kind: 'row',
        heading: 'Size limit',
        caption: 'The same words at full size. Under a 500 KB limit the text stays readable.',
        items: [
          { src: '/images/scan-guide/limit-none.jpg', label: 'No limit', width: 600, height: 400, alt: 'The signature line of the sample form at full size, from the PDF made with no size limit' },
          { src: '/images/scan-guide/limit-500kb.jpg', label: 'Under 500 KB', width: 600, height: 400, alt: 'The same signature line from the PDF made under a 500 KB limit, still sharp and readable' },
        ],
      },
    ],
  },
};
