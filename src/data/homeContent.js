// The home page's SEO copy (title, meta description, FAQ), pulled out of
// index.astro so it has exactly one source: index.astro renders it as HTML
// (and feeds it to SeoSchema's FAQPage JSON-LD), index.md.ts renders the same
// object as the page's Markdown twin. Splitting it here is what keeps those
// two renderers from drifting the way tools.js already keeps a tool's HTML,
// JSON-LD and (now) Markdown in sync from one object.
export const homeContent = {
  title: 'Free PDF Tools - Private, Local, No Sign-Up | PDkef',
  description:
    'A free, open-source suite of PDF tools that run entirely in your browser. Merge, sign, split, redact, compress, and convert PDFs with nothing uploaded, no account, and no watermark. Your files never leave your device.',
  h1: 'Free PDF tools that run on your device',
  faq: [
    { question: 'Are the tools really free?', answer: 'Yes. Every tool is free, with no paywalls, usage limits, or watermarks.' },
    { question: 'Do I need to sign up or create an account?', answer: 'No account, email, or trial period. Just open a tool and get started.' },
    { question: 'Are my files uploaded to a server?', answer: 'No. Your PDFs stay on your device. Every tool runs locally in your desktop or mobile browser.' },
    { question: 'Is PDkef open source?', answer: 'Yes. The code is MIT licensed and open for anyone to inspect, use, or improve.' },
  ],
};
