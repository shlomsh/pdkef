// The home page's copy, pulled out of index.astro so it has exactly one
// source: index.astro (via HomePageLayout.astro) renders it as HTML (and
// feeds title/description/faq to SeoSchema's FAQPage JSON-LD), index.md.ts
// renders the same object as the page's Markdown twin. Splitting it here is
// what keeps those renderers from drifting the way tools.js already keeps a
// tool's HTML, JSON-LD and Markdown in sync from one object.
//
// LOC-09: this object grew from four fields (title/description/h1/faq) to the
// full set of home-page copy surfaces, so it can also serve as the English
// "source" a localized edition (src/content/localized-home/<locale>.yaml) is
// reviewed against and hashed for staleness - the same role src/data/tools.js
// plays for TOOL_SOURCE_FIELDS in src/i18n/localizedTools.ts. See
// src/i18n/localizedHome.ts's HOME_SOURCE_FIELDS, which must name exactly the
// fields below (minus the purely visual/structural ones - none today).
//
// This does NOT mean every card in index.astro/HomePageLayout.astro renders
// through this object yet - only the fields a localized edition needs to
// override do (h1/subhead/faq plus the five story cards below). The trust
// chips are deliberately excluded: they already have reviewed catalogue keys
// (starOnGithub/mitLicensed/worksOffline in DocumentationShellMessages) and
// read through that instead - docs/home-page-localization-plan.md, section 5.3.
//
// h1 is split into a plain prefix and an `h1Accent` suffix rather than one
// string with inline markup: the design wraps the last phrase in a colored
// <span> (HomePageLayout.astro), and `h1Accent` must be an exact trailing
// substring of `h1` so the rendered text is still, byte for byte, `h1` -
// the object stays the single source of truth for what the <h1> says, while
// the split stays available to Astro's plain-text expression rendering
// (never raw HTML) so a translated h1 cannot smuggle markup through this
// field the way `inline()`-validated fields intentionally can.
export const homeContent = {
  title: 'Free PDF Tools - Private, Local, No Sign-Up | PDkef',
  description:
    'A free, open-source suite of PDF tools that run entirely in your browser. Merge, sign, split, redact, compress, and convert PDFs with nothing uploaded, no account, and no watermark. Your files never leave your device.',
  h1: 'Free PDF tools that run on your device',
  h1Accent: 'on your device',
  subhead: 'Merge, sign, split, redact and compress PDFs. No signup, no install, nothing leaves your device.',
  // The home page's own FAQ kicker, deliberately not DocumentationShellMessages'
  // shared `faqTag`. The shell's English value is "Got questions?", which every
  // tool and guide page says; home has always said this instead, and reading it
  // from the shared catalogue quietly rewrote the English home page's copy.
  // A locale translates this field like any other home string.
  faqKicker: 'A few useful answers',
  faq: [
    { question: 'Are the tools really free?', answer: 'Yes. Every tool is free, with no paywalls, usage limits, or watermarks.' },
    { question: 'Do I need to sign up or create an account?', answer: 'No account, email, or trial period. Just open a tool and get started.' },
    { question: 'Are my files uploaded to a server?', answer: 'No. Your PDFs stay on your device. Every tool runs locally in your desktop or mobile browser.' },
    { question: 'Is PDkef open source?', answer: 'Yes. The code is MIT licensed and open for anyone to inspect, use, or improve.' },
  ],
  founderStory: {
    kicker: 'Why I made this',
    heading: 'Simple PDF tools, made to share',
    paragraph1:
      'My partner needed to merge course slides before an exam and sign a summer-camp form from WhatsApp. The tools we found had page limits, subscriptions, or asked us to upload personal documents.',
    paragraph2: 'So I built PDkef. I wanted everyday PDF tools to be free and available to everyone, on any device. Then I wanted to share them.',
    paragraph3: 'Everything runs in your browser. That keeps your files private and the tools inexpensive enough to stay free.',
    pills: [
      { title: 'Free Forever', subtitle: 'No limits, no catch' },
      { title: 'Private', subtitle: 'Files never leave your device' },
      { title: 'Open Source', subtitle: 'Audit the code yourself' },
    ],
  },
  draftPersistence: {
    kicker: 'Privacy & Convenience',
    heading: 'Close the tab. Keep your progress.',
    paragraph:
      'Your PDF and edits are saved in this browser as you work. Come back after closing a tab or restarting your computer and continue from your saved draft.',
    pill: 'Autosaved to device',
    availability:
      'Available in <strong>Sign &amp; Fill</strong> and <strong>Redact &amp; Blur</strong>. Drafts stay on this device; clearing browser data removes them.',
  },
  offlineInstall: {
    heading: 'Your PDF tools, even offline',
    lead: 'Install PDkef for a place on your home screen. Once a tool is ready for offline use, you can work without an internet connection.',
    tabs: [
      {
        label: 'Chrome & Edge',
        steps: [
          'Navigate to the site in Chrome or Edge.',
          'Click the <strong>Install</strong> icon (the screen with a down arrow) at the right of the address bar.',
          'Alternatively, click the browser menu (three dots), select <strong>Save and share</strong>, and click <strong>Install PDkef</strong>.',
        ],
      },
      {
        label: 'Safari (iOS)',
        steps: [
          'Open the site in <strong>Safari</strong> on your iPhone or iPad.',
          'Tap the <strong>Share</strong> button (square with an up arrow) in the toolbar.',
          'Scroll down the options list and select <strong>Add to Home Screen</strong>.',
        ],
      },
      {
        label: 'Safari (macOS)',
        steps: [
          'Open the site in <strong>Safari</strong> on your Mac.',
          'Click the <strong>Share</strong> button in the top-right Safari toolbar.',
          'Select <strong>Add to Dock...</strong> from the dropdown menu and click <strong>Add</strong>.',
        ],
      },
    ],
  },
  privacyOpenSource: {
    kicker: 'Transparent & Secure',
    heading: 'Private by design. Open to inspect.',
    privacyHeading: 'Privacy',
    privacyBody: 'Merge, sign, redact, and more in your browser. Your PDFs stay on your device, with no uploads or processing server.',
    openSourceHeading: 'Open source',
    openSourceBody:
      'PDkef is MIT licensed. <a href="https://github.com/shlomsh/pdkef" target="_blank" rel="noopener noreferrer">Read the code on GitHub</a>, or explore the <a href="/licenses/">open source licenses</a> behind the tools.',
    openSourcePill: 'MIT Licensed',
  },
  closing: {
    heading: 'Give it a try.',
    backLink: 'Back to your workspace ↑',
  },
};
