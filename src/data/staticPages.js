// Trust-anchor pages (about/contact/privacy): the pages an agent or a
// cautious visitor checks to decide whether PDkef is a real, legitimate
// thing before recommending or using it. One registry feeds both the .astro
// page (src/pages/<slug>.astro) and its Markdown twin
// (src/pages/[slug].md.ts, via src/lib/markdownRender.js's
// staticPageToMarkdown), the same "one source, two renderers" pattern
// src/data/tools.js already uses for its own pages and JSON-LD.
//
// `paragraphs` may use the same two-tag inline dialect content-pages allow
// (see src/lib/contentMarkup.ts) - `<strong>` and `<a href="...">` only.
export const staticPages = [
  {
    slug: 'about',
    title: 'About PDkef - Free, Open Source PDF Tools',
    description:
      'Why PDkef exists, who built it, and how a suite of PDF tools runs entirely in your browser with nothing uploaded.',
    h1: 'About PDkef',
    sections: [
      {
        paragraphs: [
          'PDkef started with an ordinary errand. My partner needed to download all her course slides into a single PDF before an exam, and separately needed to sign a summer-camp consent form that had arrived over WhatsApp. We went looking for tools to do both. One capped the number of pages you could merge. One wanted a paid subscription plus a Windows install. One just felt like a place you would not want to send a personal document. So I built the tool I wanted for myself, and named it PDF + <strong>kef</strong> ("fun" in Hebrew) = PDkef.',
          'I believe simple tools like these should be free and accessible to everyone, everywhere, on any device. That is the whole reason PDkef exists: I wanted it for myself, and then I wanted to share it, so it saves other people the same time and hassle instead of sending them to a paywall or a site they have to trust with a personal document.',
        ],
      },
      {
        heading: 'What PDkef does',
        paragraphs: [
          'PDkef is a suite of PDF tools, sign and fill, merge, split, compress, edit pages, convert to and from images, redact, and unlock or protect, that all run inside your browser. There is no upload step and no server that processes your file: the code that reads and changes your PDF runs on your own device, the same way a desktop app would, except you do not have to install anything.',
          'Every tool is free, with no account, no page limit, and no watermark. The <a href="/sign/">Sign tool</a> also supports typing in 20 languages and scripts, including Hebrew, Arabic, Hindi, Bengali, Tamil, and Thai, and can save a draft on your own device so you can pick up a form later even if the tab closes.',
        ],
      },
      {
        heading: 'Who built it, and how it stays trustworthy',
        paragraphs: [
          'PDkef is built and maintained by <strong>Shlomi Shemesh</strong>. The entire codebase is <a href="https://github.com/shlomsh/pdkef" target="_blank" rel="noopener noreferrer">open source on GitHub</a> under the MIT license, so nobody has to take the privacy claims on faith: anyone can read exactly what runs on their device, including the parts that handle your file.',
          'See the <a href="/privacy/">privacy page</a> for the specifics of what PDkef does and does not collect, and <a href="/contact/">contact</a> for how to reach out with a bug, a question, or a feature request.',
        ],
      },
    ],
  },
  {
    slug: 'contact',
    title: 'Contact PDkef',
    description:
      'How to reach PDkef with a bug report, a feature request, or a question, and why that channel is GitHub rather than a support inbox.',
    h1: 'Contact',
    sections: [
      {
        paragraphs: [
          'PDkef is a one-person, open source project, so there is no support ticketing system or call center, just a real way to reach the person who builds it.',
          'Found something broken? <a href="https://github.com/shlomsh/pdkef/issues/new" target="_blank" rel="noopener noreferrer">Report a bug</a>. Have an idea or a question about how a tool works? Start a thread in <a href="https://github.com/shlomsh/pdkef/discussions" target="_blank" rel="noopener noreferrer">Feedback &amp; ideas</a>. Both are the fastest way to get a response, and keep the conversation visible so the same answer can help the next person who runs into it.',
        ],
      },
      {
        heading: 'Who you would be reaching',
        paragraphs: [
          'PDkef is built and maintained by <strong>Shlomi Shemesh</strong>. You can find more of his work, and the full commit history behind this project, on <a href="https://github.com/shlomsh" target="_blank" rel="noopener noreferrer">GitHub</a>.',
          'Because the project is open source, you are also welcome to read the code yourself before asking, or send a pull request if you have already fixed what you found. See the <a href="https://github.com/shlomsh/pdkef" target="_blank" rel="noopener noreferrer">source repository</a>.',
        ],
      },
    ],
  },
  {
    slug: 'privacy',
    title: 'Privacy - PDkef',
    description:
      'What PDkef does and does not collect: your PDF files never leave your device, there is no account or PDF-processing server, and telemetry is anonymous and limited to maintenance signals.',
    h1: 'Privacy',
    sections: [
      {
        paragraphs: [
          'The short version: your files never leave your device. PDkef has no server that receives, stores, or processes the PDFs you work with. Every tool, merge, sign, split, compress, edit pages, convert, redact, unlock, or protect, runs in your browser using JavaScript and WebAssembly, the same way a desktop app would. There is no upload step to skip; there is nothing to upload to.',
        ],
      },
      {
        heading: 'No accounts, no cookies',
        paragraphs: [
          'PDkef does not ask you to sign up, log in, or create an account, and it does not use cookies. Nothing about your visit is tied to an identity.',
        ],
      },
      {
        heading: 'What is measured, and what is not',
        paragraphs: [
          'PDkef uses same-origin Vercel Web Analytics for basic, aggregate page views, the same category of measurement a paper counter at a doorway would give you: how many visits a page got, not who made them.',
          'Separately, PDkef sends anonymous, sanitized maintenance telemetry, things like which tool ran, whether it succeeded, and a coded error category, so bugs can be found and fixed. That allowlist explicitly excludes anything that could identify you or your document: no filenames, no text you typed, no signatures, no document or user IDs, and no raw error payloads. This telemetry exists purely to keep the tools working; it is never used to build a profile of you, and it never blocks a tool from working offline.',
        ],
      },
      {
        heading: 'Drafts and local storage',
        paragraphs: [
          'The Sign and Redact tools can save a draft of your work in progress so you do not lose it if a tab closes. That draft, the source PDF and your edits, is stored in your browser\'s own IndexedDB storage on your device, with an automatic 14-day expiry. It is never uploaded anywhere.',
        ],
      },
      {
        heading: 'A technical backstop, not just a promise',
        paragraphs: [
          "These are not just policy statements: PDkef ships a strict Content-Security-Policy that locks connect-src down to the site's own origin, so the browser itself blocks any script from sending data to a third-party server, even if a future bug tried to add one by accident.",
          'Because PDkef is <a href="https://github.com/shlomsh/pdkef" target="_blank" rel="noopener noreferrer">open source</a>, none of this has to be taken on trust: you can read the exact code that runs on your device, including this policy, for yourself. Questions about any of this are welcome on the <a href="/contact/">contact page</a>.',
        ],
      },
    ],
  },
];
