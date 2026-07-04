// Single source of truth for every PDF tool in the suite.
//
// This one array feeds: the home-page tool grid + hero card (index.astro), each
// tool page (via ToolPageLayout.astro, keyed by slug), and the generated
// sitemap (src/pages/sitemap.xml.js). Add or change a tool here and all three
// stay in sync. The interactive island component is intentionally NOT stored
// here - each tool page imports its own island so the home grid never pulls in
// island code it does not render.
//
// Order = SEO priority (search volume x winnability x client-side fit); the
// highest-opportunity tools surface first on the home page.
import {
  FileSignature,
  Merge,
  ImageUp,
  ImageDown,
  Split,
  Shrink,
  FileLock2,
  FileEdit,
  Eraser,
} from 'lucide-preact';

export const tools = [
  {
    slug: 'sign',
    href: '/sign/',
    icon: FileSignature,
    gridTitle: 'Sign & Fill PDF',
    gridDescription:
      'Fill interactive PDF forms and draw secure digital signatures instantly in your browser with zero registration, zero limits, and no watermarks. Your progress auto-saves locally so a crash never loses your work.',
    sitemapPriority: '0.9',
    sitemapChangefreq: 'monthly',
    seoTitle: 'Sign PDF Free - Fill Forms, No Sign-Up, Runs Locally | PDkef',
    seoDescription:
      'Sign PDF files online for free. Add signatures, fill forms, write text, and check boxes in your browser securely. Your files never leave your device.',
    schemaName: 'PDkef - Sign PDF',
    toolName: 'Sign & Fill PDF',
    h1: 'Sign & Fill PDF Free: No Sign-Up, Runs Locally',
    subhead:
      'Fill out forms, tick checkboxes, type text, and add your signature to any PDF - school consent slips, contracts, and applications. Your progress is auto-saved on your device, so a crash or accidental refresh never loses your work.',
    ariaLabel: 'PDF sign tool',
    aboutHeading: 'How to fill and sign PDF files',
    aboutLead:
      'Fill out and sign PDFs securely in your browser. No upload, no servers. Your work auto-saves on your device, so a crash never loses it.',
    freeNoteLead:
      'Fill and sign as many PDFs as you like, with no account, no watermark, and no page limits. Because signing runs on your device, your signature and file are never uploaded, and your progress auto-saves locally so a crash never loses your work.',
    aboutSketch: 'waves',
    aboutIconPos: 'tr',
    faqSketch: 'arcs',
    faqIconPos: 'bl',
    steps: [
      { title: 'Upload your form', text: 'Select or drag-and-drop the PDF document you want to fill and sign.' },
      { title: 'Add text & signatures', text: 'Click to place text blocks, checkmarks, or signatures on the pages.' },
      { title: 'Sign with ease', text: 'Draw your signature on screen, type it out using a cursive font, or upload a signature image.' },
      { title: 'Position & resize', text: 'Drag items to place them exactly where they belong in the agreement.' },
      { title: 'Save & download', text: 'Click Sign and Download PDF to generate and download your completed document.' },
    ],
    faq: [
      {
        question: 'Do I need to create an account to sign a PDF?',
        answer: 'No. Unlike DocuSign, Adobe Sign, or other e-signature platforms, there is no signup, no email verification, and no trial period. Open the tool and start signing immediately.',
      },
      {
        question: 'Can I sign school trip agreements?',
        answer: "Yes. This tool is perfect for child school trip agreements, consent slips, and standard PDF forms. You can type the child's name, tick the consent checkboxes, and draw your parent signature.",
      },
      {
        question: 'Is my signature safe here?',
        answer: 'Absolutely. Unlike standard PDF signing websites that upload your signature and PDF file to their servers, this tool runs entirely on your device. There is no account and no server-side copy of your document to retain or breach - your signature image is embedded in the PDF in-memory and never leaves your computer or phone.',
      },
      {
        question: 'Can I type my signature instead of drawing?',
        answer: "Yes. If you don't want to draw with a mouse or touch, you can select the \"Type\" option. It renders your name in a handwriting font and embeds it as a signature.",
      },
      {
        question: 'What happens if my browser crashes while filling out a form?',
        answer: 'Your work is not lost. As you add text, checkmarks, and signatures, the tool auto-saves your progress to local storage in your own browser, and restores it automatically the next time you open the tool on the same device. Because this happens on your device, your file is still never uploaded, and your saved draft is only cleared when you click Start over.',
      },
    ],
  },

  {
    slug: 'merge',
    href: '/merge/',
    icon: Merge,
    gridTitle: 'Merge PDF',
    gridDescription:
      'Combine multiple PDFs into one document, in any order, with no page limit or watermark.',
    sitemapPriority: '0.9',
    sitemapChangefreq: 'monthly',
    seoTitle: 'Merge PDF Online Free - Combine PDFs in Your Browser | PDkef',
    seoDescription:
      'Merge PDF files online for free. Drag, reorder, and combine PDFs in your browser instantly. No upload, no signup, no watermark.',
    schemaName: 'PDkef - Merge PDF',
    toolName: 'Merge PDF',
    h1: 'Merge PDF Free: No Sign-Up, Runs Locally',
    subhead:
      'Combine multiple PDFs into a single document and reorder pages by drag-and-drop before you export.',
    ariaLabel: 'PDF merge tool',
    aboutHeading: 'How to merge PDF files online for free',
    aboutLead:
      'Combine multiple PDFs into one, right in your browser. No upload, no server. Your files never leave your device.',
    freeNoteLead:
      "Combine as many PDFs as you like, in any order, with no watermark and no page limits. Because merging runs on your device, there's nothing to upload and no usage to ration.",
    aboutSketch: 'waves',
    aboutIconPos: 'tr',
    faqSketch: 'grid',
    faqIconPos: 'bl',
    steps: [
      { title: 'Add your PDFs', text: 'Select or drag-and-drop the files you want to combine.' },
      { title: 'Reorder them', text: 'Sort by name or date, or drag files into the order you want.' },
      { title: 'Merge and download', text: 'Click Merge PDFs and save your combined file.' },
    ],
    faq: [
      { question: 'Is PDkef really free?', answer: 'Yes. PDkef is completely free, with no limits, no signup, and no watermark on your merged PDF.' },
      { question: 'Are my files uploaded to a server?', answer: 'No. PDkef runs entirely in your browser. Your PDF files are never sent over the network - they stay on your device the entire time.' },
      { question: 'Does PDkef work on mobile?', answer: 'Yes. PDkef works in Chrome on Android and iOS, as well as desktop browsers on macOS and Windows.' },
      { question: 'Is there a file size or page limit?', answer: "No artificial limit is imposed by PDkef. The only constraint is your device's available memory, since merging happens locally." },
      { question: 'Can I combine scanned receipts or reports into one PDF?', answer: 'Yes - this is one of the most common uses. Add each scanned page or report PDF, reorder them, and merge into a single file for an expense report, portfolio, or ebook.' },
    ],
  },

  {
    slug: 'pdf-to-image',
    href: '/pdf-to-image/',
    icon: ImageUp,
    gridTitle: 'PDF to Image',
    gridDescription:
      'Convert PDF pages into high-quality JPG or PNG images at full resolution, with no watermark.',
    sitemapPriority: '0.9',
    sitemapChangefreq: 'monthly',
    seoTitle: 'Convert PDF to Image Online Free - No Watermark | PDkef',
    seoDescription:
      'Convert PDF pages to high-quality JPG or PNG images online for free, with no watermark. Secure, fast, and 100% private in-browser conversion.',
    schemaName: 'PDkef - PDF to Image',
    toolName: 'PDF to Image',
    h1: 'PDF to Image Free: No Watermark, Runs Locally',
    subhead:
      'Turn each PDF page into a high-quality JPG or PNG, with no watermark and nothing uploaded.',
    ariaLabel: 'PDF to Image tool',
    aboutHeading: 'How to convert PDF to JPG or PNG online for free',
    aboutLead:
      'Convert PDF pages to images, right in your browser. No upload, no server. Your files never leave your device.',
    freeNoteLead:
      "Convert as many PDFs to JPG or PNG as you like, at full resolution with no watermark. Because conversion runs on your device, there's nothing to upload and no server cost to pass on to you.",
    aboutSketch: 'arcs',
    aboutIconPos: 'tr',
    faqSketch: 'rings',
    faqIconPos: 'bl',
    steps: [
      { title: 'Add your PDF', text: 'Select or drag-and-drop the file you want to convert.' },
      { title: 'Choose format and quality', text: 'Pick PNG or JPG, and a quality level from Standard to Maximum.' },
      { title: 'Convert and download', text: 'Click Convert and download your image, one file per page.' },
    ],
    faq: [
      { question: 'Is PDkef really free?', answer: 'Yes. PDkef is completely free, with no limits, no signup, and no watermark on your converted images.' },
      { question: 'Does PDkef add a watermark to converted images?', answer: 'No. Unlike many free online converters, JPG and PNG exports here have zero watermarks and no forced resolution downgrade on the free tier - because the conversion runs on your device, there is no server cost to recoup by limiting the free tier.' },
      { question: 'Are my files uploaded to a server?', answer: 'No. PDkef runs entirely in your browser. Your PDF files are never sent over the network - they stay on your device the entire time.' },
      { question: 'What is the difference between PNG and JPG?', answer: 'PNG keeps a transparent background and is lossless, which is best for text-heavy or graphic pages. JPG uses a white background and smaller file sizes, which works well for photos and scans.' },
      { question: 'What happens with a multi-page PDF?', answer: 'By default each page is converted to its own image file, downloadable individually or all at once. You can also choose "Single combined image" to stack every page into one tall image instead.' },
      { question: 'Can I turn a scanned worksheet or slide deck into images?', answer: 'Yes. Upload the PDF, choose JPG or PNG, and each page - a scanned worksheet, presentation slide, or contract page - becomes its own image file ready to share or embed.' },
    ],
  },

  {
    slug: 'image-to-pdf',
    href: '/image-to-pdf/',
    icon: ImageDown,
    gridTitle: 'Image to PDF',
    gridDescription:
      'Combine JPG or PNG images into one PDF at their original quality, with no watermark.',
    sitemapPriority: '0.9',
    sitemapChangefreq: 'monthly',
    seoTitle: 'Image to PDF Online Free - Combine JPG/PNG into One PDF | PDkef',
    seoDescription:
      'Combine multiple JPG or PNG images into a single PDF online for free. Reorder pages and download instantly. No upload, no signup, no watermark.',
    schemaName: 'PDkef - Image to PDF',
    toolName: 'Image to PDF',
    h1: 'Image to PDF Free: No Watermark, Runs Locally',
    subhead:
      'Combine JPG or PNG images into a single PDF in any order - scanned pages, photographed slides, or screenshots.',
    ariaLabel: 'Image to PDF tool',
    aboutHeading: 'How to combine images into a PDF online for free',
    aboutLead:
      'Combine images into one PDF, right in your browser. No upload, no server. Your files never leave your device.',
    freeNoteLead:
      "Combine as many JPG or PNG images into a PDF as you like, at their original quality with no watermark. Because it runs on your device, there's nothing to upload and no limits to ration.",
    aboutSketch: 'arcs',
    aboutIconPos: 'tr',
    faqSketch: 'waves',
    faqIconPos: 'bl',
    steps: [
      { title: 'Add your images', text: 'Select or drag-and-drop the JPG or PNG files you want to combine.' },
      { title: 'Reorder them', text: 'Sort by name or date, or drag images into the order you want.' },
      { title: 'Convert and download', text: 'Click Convert and download a single PDF with one image per page.' },
    ],
    faq: [
      { question: 'Is the image to PDF tool really free?', answer: 'Yes. Like all tools on PDkef, this is completely free with no limits, no signup, and no watermark on the resulting PDF.' },
      { question: 'Are my images uploaded to a server?', answer: 'No. PDkef runs 100% on your device. Your images are processed locally in your browser and are never uploaded to any server.' },
      { question: 'What image formats are supported?', answer: 'JPG and PNG. Each image becomes its own page in the final PDF, in the order you arrange them.' },
      { question: 'Will my images be resized or compressed?', answer: 'No. Each image is embedded into its PDF page at full, original quality and at its native dimensions - no recompression or downscaling.' },
      { question: 'Can I combine scanned documents or school presentations into one PDF?', answer: 'Yes. This is exactly the use case it was built for - add as many image pages as you like (scanned pages, photographed slides, screenshots), reorder them, and download a single combined PDF.' },
      { question: 'Is there a limit on the number of images?', answer: "No artificial limit. The only constraint is your device's available memory, since everything runs locally." },
    ],
  },

  {
    slug: 'split',
    href: '/split/',
    icon: Split,
    gridTitle: 'Split PDF',
    gridDescription:
      'Extract specific pages or split a PDF into multiple files, with no page limit or watermark.',
    sitemapPriority: '0.9',
    sitemapChangefreq: 'monthly',
    seoTitle: 'Split PDF Online Free - Extract Pages from PDF | PDkef',
    seoDescription:
      'Split a PDF file online for free. Extract specific pages or separate into multiple documents in your browser. No upload, no signup, no watermark.',
    schemaName: 'PDkef - Split PDF',
    toolName: 'Split PDF',
    h1: 'Split PDF Free: No Sign-Up, Runs Locally',
    subhead:
      'Extract a page range, pull out single pages, or break one PDF into several separate files.',
    ariaLabel: 'PDF split tool',
    aboutHeading: 'How to split PDF files online for free',
    aboutLead:
      'Extract pages or split a PDF file into separate documents, right in your browser. No upload, no server. Your files never leave your device.',
    freeNoteLead:
      "Extract pages or split a PDF into separate files as often as you like, with no watermark or page caps. Because it runs on your device, there's nothing to upload and no usage to ration.",
    aboutSketch: 'grid',
    aboutIconPos: 'tr',
    faqSketch: 'arcs',
    faqIconPos: 'bl',
    steps: [
      { title: 'Upload your PDF', text: 'Select the PDF file you want to split or drag-and-drop it into the tool.' },
      { title: 'Choose split mode', text: 'Extract your pages into a single combined PDF, or split each page into a separate PDF.' },
      { title: 'Select pages', text: 'Click the page thumbnails or type page numbers and ranges (e.g., 1-3, 5, 8-).' },
      { title: 'Split and download', text: 'Click the Split PDF button and download your generated files instantly.' },
    ],
    faq: [
      { question: 'Is the PDF split tool completely free to use?', answer: 'Yes. Like all tools on PDkef, the Split PDF tool is completely free with no limits, no signup required, and no watermarks added.' },
      { question: 'Are my PDF files uploaded to a server?', answer: 'No. PDkef runs 100% on your device (client-side). Your files are processed locally in your browser and are never uploaded to any server, guaranteeing total privacy.' },
      { question: 'How do page ranges work?', answer: 'You can enter specific pages separated by commas (e.g., 1, 3, 5), closed ranges (e.g., 2-4), or open-ended ranges like "5-" (from page 5 to the end of the document).' },
      { question: 'What is the difference between Combined and Separate mode?', answer: 'Combined mode takes all selected pages and merges them into a single output PDF document. Separate mode extracts each selected page as its own individual PDF file.' },
      { question: 'Is there a limit on file size or number of pages?', answer: "There is no artificial limit. The tool can handle any file size and page count, constrained only by your device's system memory." },
      { question: 'Can I pull a single chapter or receipt out of a large PDF?', answer: 'Yes. Type the page range for just the chapter, invoice, or receipt you need, and Split extracts exactly those pages into their own file.' },
    ],
  },

  {
    slug: 'compress',
    href: '/compress/',
    icon: Shrink,
    gridTitle: 'Compress PDF',
    gridDescription:
      "Shrink a PDF's file size, even down to an exact target like 100KB, with no daily limit.",
    sitemapPriority: '0.9',
    sitemapChangefreq: 'monthly',
    seoTitle: 'Compress PDF to 100KB Free - Reduce File Size | PDkef',
    seoDescription:
      'Compress any PDF to an exact target size - 100KB, 200KB, or any portal limit - or choose a quality preset. Free, no upload, no watermark. Runs 100% in your browser.',
    schemaName: 'PDkef - Compress PDF',
    toolName: 'Compress PDF',
    h1: 'Compress PDF Free: No Limits, Runs Locally',
    subhead:
      "Shrink your PDF's file size instantly, even down to a target like 100KB for strict portal upload limits on tax records, applications, and scanned IDs.",
    ariaLabel: 'PDF compress tool',
    aboutHeading: 'How to compress a PDF online for free',
    aboutLead:
      'Reduce the file size of your PDFs, right in your browser. No upload, no server. Your files never leave your device.',
    freeNoteLead:
      "Shrink PDFs to a target like 100KB for strict portal limits as many times as you need, with no watermark or daily cap. Because compression runs on your device, there's nothing to upload and no server cost to pass on to you.",
    aboutSketch: 'waves',
    aboutIconPos: 'br',
    faqSketch: 'rings',
    faqIconPos: 'tr',
    steps: [
      { title: 'Upload your PDF', text: 'Select or drag-and-drop the file you want to compress.' },
      { title: 'Choose a mode', text: 'Pick a quality preset (Extreme, Recommended, or High Quality), or select Target Size and enter a specific limit like 100 KB, 200 KB, or 1 MB.' },
      { title: 'Compress and download', text: 'Click Compress PDF, review the size savings shown, and save your compressed file.' },
    ],
    faq: [
      { question: 'Can I compress a PDF to exactly 100KB?', answer: 'Yes. Select the "Target Size" option, enter 100 in the KB field (or click the 100 KB quick-pick), and click Compress. The tool automatically searches for the highest image quality that fits the target, stepping down the resolution only as far as needed. Quick-pick presets for 100 KB, 200 KB, 500 KB, and 1 MB are provided for common portal limits.' },
      { question: 'How does the target size compression work?', answer: 'The tool rasterizes each PDF page to a canvas, then binary-searches JPEG quality settings until the total output size fits your target. It tries the highest resolution first and only drops DPI if the minimum JPEG quality still exceeds the budget - so you always get the best possible quality that fits. Everything happens locally in your browser; no file is ever uploaded.' },
      { question: 'Is the PDF compression secure?', answer: 'Yes. Compression is 100% client-side and runs entirely in your browser. Your files - and any sensitive content like tax records, scanned IDs, or contracts - are never uploaded to any server.' },
      { question: 'What is the difference between the compression levels?', answer: 'Extreme compression reduces file size by 60-80% using 72 DPI images. Recommended compression reduces size by 40-60% at 110 DPI. High Quality compression reduces size by 10-30% at 150 DPI. The Target Size option lets you name a specific byte limit and the tool finds the best quality that fits.' },
      { question: 'Does compressing a PDF affect text search or copying?', answer: 'Yes. To compress client-side, pages are rasterized into images. Text selection, copy-pasting, and embedded links will be disabled in the output. This trade-off is necessary for any browser-based compressor that achieves real file size reduction.' },
      { question: 'Is there a limit on the file size I can compress?', answer: "No artificial limit - no daily task cap, no watermark, no paywall. Most online compressors impose limits because server processing costs them money. This tool runs entirely on your device, so the only constraint is your device's available memory." },
    ],
  },

  {
    slug: 'unlock',
    href: '/unlock/',
    icon: FileLock2,
    gridTitle: 'Protect & Unlock',
    gridDescription: 'Add a password to secure your PDF or remove a known password.',
    sitemapPriority: '0.8',
    sitemapChangefreq: 'weekly',
    seoTitle: 'Unlock or Protect a PDF Free - Add or Remove Password | PDkef',
    seoDescription:
      'Add a password to protect a PDF, or remove one you already know, free and online. 100% private - runs entirely in your browser, nothing uploaded.',
    schemaName: 'PDkef - Protect & Unlock PDF',
    toolName: 'Protect & Unlock PDF',
    h1: 'Unlock or Protect PDF Free: No Sign-Up, Runs Locally',
    subhead:
      'Add a password to protect a PDF, or remove one you already know - the tool detects which you need.',
    ariaLabel: 'PDF unlock tool',
    aboutHeading: 'How to unlock or password-protect a PDF online for free',
    aboutLead:
      'Add or remove a PDF password, right in your browser. No upload, no server. Your file and its password never leave your device.',
    freeNoteLead:
      'Protect or unlock as many PDFs as you like, with no watermark or usage caps. Because the file and its password are processed on your device, nothing is ever uploaded.',
    aboutSketch: 'rings',
    aboutIconPos: 'tl',
    faqSketch: 'grid',
    faqIconPos: 'br',
    steps: [
      { title: 'Upload your PDF', text: 'Select or drag-and-drop the file you want to protect or unlock.' },
      { title: 'Enter a password', text: 'Type the current password to remove it, or set a new one to add protection.' },
      { title: 'Save and download', text: 'Click the button and save a copy with the password added or removed.' },
    ],
    faq: [
      { question: 'Is protecting or unlocking a PDF here secure?', answer: 'Yes. The password and the file are processed 100% client-side, entirely in your browser, whether you are adding or removing protection. Nothing is uploaded to any server.' },
      { question: 'How do I add a password to a PDF?', answer: 'Upload a PDF that is not already encrypted and the tool switches to protect mode automatically. Set the password you want, click Protect PDF, and download a copy that requires that password to open.' },
      { question: 'Do I need to know the PDF password to unlock it?', answer: 'Yes. To remove a password you must already know it - this tool does not crack, guess, or recover unknown passwords. To add a password, you choose it yourself.' },
      { question: 'What if I enter the wrong password?', answer: 'You will see an error and can try again. No file data is sent anywhere when this happens, so there is no risk in retrying.' },
      { question: 'Is there a limit on file size?', answer: "No artificial limit. Both protecting and unlocking run entirely on your device, so the only constraint is your device's available memory." },
    ],
  },

  {
    slug: 'edit-pdf',
    href: '/edit-pdf/',
    icon: FileEdit,
    gridTitle: 'Edit PDF Pages',
    gridDescription:
      'Remove, rotate, and reorder pages, and add page numbers, all in a single pass.',
    sitemapPriority: '0.9',
    sitemapChangefreq: 'monthly',
    seoTitle: 'Edit PDF Online Free - Rotate, Reorder, Remove Pages | PDkef',
    seoDescription:
      'Edit your PDF for free in your browser: remove unwanted pages, rotate pages, reorder pages by drag & drop, and add page numbers. 100% private - your file never leaves your device.',
    schemaName: 'PDkef - Edit PDF Pages',
    toolName: 'Edit PDF',
    h1: 'Edit PDF Free: No Sign-Up, Runs Locally',
    subhead:
      'Remove pages, rotate them, reorder by drag-and-drop, and add page numbers to any PDF.',
    ariaLabel: 'Edit PDF pages tool',
    aboutHeading: 'How to edit a PDF online for free',
    aboutLead:
      'Edit, rotate, reorder, and delete pages from your PDF, right in your browser. No uploads, no servers, no tracking - absolute privacy.',
    freeNoteLead:
      "Remove, rotate, reorder, and number pages in as many PDFs as you like, with no watermark or daily cap. Because every edit runs on your device, there's nothing to upload and no usage to ration.",
    aboutSketch: 'arcs',
    aboutIconPos: 'br',
    faqSketch: 'waves',
    faqIconPos: 'tl',
    steps: [
      { title: 'Open your PDF', text: 'Click Choose file or drag and drop any PDF into the tool. Your file stays on your device, nothing is uploaded.' },
      { title: 'Make your edits', text: 'Click a thumbnail to mark a page for removal (it turns red), use the rotate buttons to turn a page 90 degrees at a time, drag the six-dot grip handle to reorder, or tick "Add page numbers" to stamp sequential numbers at the bottom of each page.' },
      { title: 'Apply and download', text: 'Click Apply Changes. The new PDF is built instantly in your browser and downloaded to your device.' },
    ],
    faq: [
      { question: 'Are my PDF files uploaded to a server?', answer: 'No. PDkef runs entirely in your browser. Your file is never uploaded, never sent over the network, and never stored anywhere outside your own device. Every operation - page removal, rotation, reordering, and numbering - happens locally using JavaScript.' },
      { question: 'How do I remove pages from a PDF?', answer: 'Load your PDF, then click any page thumbnail to mark it for removal (it turns red with an x). Click again to keep it. Once you have selected the pages you want to delete, click Apply Changes to generate the new PDF.' },
      { question: 'How do I rotate pages in a PDF?', answer: 'Use the rotate-left and rotate-right buttons below each page thumbnail. Each click rotates that page by 90 degrees. The live preview updates immediately so you can see the result before applying.' },
      { question: 'How do I reorder pages in a PDF?', answer: 'Grab the six-dot handle at the top of any page card and drag it to a new position. The grid updates in real time. The final order you see is exactly the order in the exported PDF.' },
      { question: 'How do I add page numbers to a PDF?', answer: 'Check the "Add page numbers" box below the page grid before clicking Apply Changes. Page numbers are printed at the bottom centre of each output page, numbered sequentially from 1.' },
      { question: 'Can I do all edits at once - rotate, remove, and reorder?', answer: 'Yes. All edits are applied together in a single pass when you click Apply Changes. You can freely mix removing pages, rotating individual pages, reordering, and adding page numbers before exporting.' },
      { question: 'Is there a file size limit?', answer: "There are no artificial file size limits. The only constraint is your device's available memory, since all processing runs locally in the browser." },
      { question: 'Can I remove all pages from a PDF?', answer: 'No. A valid PDF must contain at least one page. The Apply Changes button is disabled if every page is marked for removal.' },
    ],
  },

  {
    slug: 'redact',
    href: '/redact/',
    icon: Eraser,
    gridTitle: 'Redact & Blur',
    gridDescription:
      "Black out or blur sensitive text and permanently flatten the page so it can't be recovered.",
    sitemapPriority: '0.9',
    sitemapChangefreq: 'monthly',
    seoTitle: 'Blackout, Blur, or Redact PDF Online | Free & Private',
    seoDescription:
      'Securely hide text in your PDF files. Black out or blur sensitive information, and we permanently flatten the page so the data cannot be extracted. 100% private.',
    schemaName: 'PDkef - Redact PDF',
    toolName: 'Redact PDF',
    h1: 'Redact PDF Free: No Sign-Up, Runs Locally',
    subhead:
      "Black out or blur sensitive text like SSNs and addresses, then flatten the file so it can't be copied or extracted. Your redaction boxes are auto-saved on your device as you work, so a crash or accidental refresh never loses your progress.",
    ariaLabel: 'Redact PDF tool',
    aboutHeading: 'How to blackout or blur a PDF securely',
    aboutLead:
      'Permanently hide, blackout, blur, and flatten sensitive information in your PDFs, right in your browser. No uploads, absolute privacy.',
    freeNoteLead:
      'Black out or blur sensitive text in as many PDFs as you like, with no watermark or usage caps. Because redaction runs on your device, nothing is uploaded, and your boxes auto-save locally so a crash never loses your progress.',
    aboutSketch: 'grid',
    aboutIconPos: 'tr',
    faqSketch: 'rings',
    faqIconPos: 'bl',
    steps: [
      { title: 'Open your PDF', text: 'Click Choose file or drag and drop any PDF into the tool. Your file stays on your device, nothing is uploaded.' },
      { title: 'Draw boxes', text: 'Choose your style (solid blackout or blurred out), then click and drag over the text you want to hide.' },
      { title: 'Apply and download', text: 'Click Redact PDF. The tool flattens those pages, destroying the underlying text so it can never be extracted, and downloads the secure PDF.' },
    ],
    faq: [
      { question: 'Are my PDF files uploaded to a server?', answer: 'No. PDkef runs entirely in your browser. Your file is never uploaded, never sent over the network, and never stored anywhere outside your own device.' },
      { question: 'How is this different from just drawing a black box?', answer: 'Many free tools just draw a layer over the text, meaning anyone can still copy-paste the text hidden underneath. We perform "True Redaction": the page is converted into a flattened image, permanently destroying the underlying text data so it is impossible to recover.' },
      { question: 'How do I blackout or blur text in a PDF?', answer: 'Load your PDF, choose "Blackout" or "Blur" from the toolbar, then click and drag on any page to draw a box over the sensitive information. Once you have covered all sensitive areas, click Redact PDF. The tool will flatten the edited pages and generate your secure PDF.' },
      { question: 'Is there a file size limit?', answer: 'There are no artificial limits. However, because redacted pages are converted to high-quality images, your final file size may be larger than the original document.' },
      { question: 'If my browser crashes mid-redaction, do I lose my boxes?', answer: 'No. As you draw blackout and blur boxes, the tool auto-saves your progress to local storage in your own browser, and restores your boxes automatically the next time you open the tool on the same device. This happens on your device, so your file is still never uploaded, and your saved draft is only cleared when you click Start over.' },
    ],
  },
];

export const toolsBySlug = Object.fromEntries(tools.map((tool) => [tool.slug, tool]));
