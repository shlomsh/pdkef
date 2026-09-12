// Non-tool SEO/content pages: long-tail landing pages and OS how-to guides.
// Kept separate from tools.js (which is islands + the tool grid) since these
// pages carry no Preact island and aren't part of the tool suite itself, but
// they still need one place to drive the sitemap, the guides' own cross-links
// to each other, and the hub links back from tool pages, so slugs can't
// silently drift out of sync.
//
// `hub` is the tool page this content page hangs off. It is what makes the
// cluster reachable at all: without it every one of these pages was an orphan,
// linked only from inside the cluster and from sitemap.xml, so a visitor had
// no path to them and a crawler had no internal signal that they mattered.
// RelatedGuides.astro reads it to render the inbound links, exactly the way
// ToolCrossLinks.astro fixed the same problem between tool pages - card grid
// with an icon, title and one-line description, not a bare pill list, since
// this sits directly above ToolCrossLinks' own card grid on the same page.
//
// `alsoHub` (optional array) adds secondary inbound links beyond the primary
// `hub`, for SEO-06: /redact/ and /compress/ are the only two pages with real
// accumulated authority (Search Console), and four of these pages had no path
// from either one - reachable only from /sign/ or /edit-pdf/, which barely
// rank. Rather than moving the primary hub (which would pull a card off the
// tool page it's most relevant to), a page can additionally render on another
// tool's RelatedGuides grid. Route link equity from where it has accumulated,
// not by restructuring where a page conceptually belongs.
//
// `blurb` is that one-line description, RelatedGuides' equivalent of
// tools.js's gridDescription. `label` stays the short form OtherGuides.astro
// uses for its OS-switcher pills, where the "Signing on a different device?"
// heading already supplies the context a bare "Windows" needs.
import {
  Monitor,
  Laptop,
  Smartphone,
  TabletSmartphone,
  UserX,
  Download,
  Code2,
  Trash2,
  WifiOff,
  Layers,
  ScanText,
  IdCard,
} from 'lucide-preact';

export const landingPages = [
  {
    href: '/sign-pdf-no-signup/',
    label: 'Signing without an account',
    blurb: 'No account, no email, no trial that runs out.',
    icon: UserX,
    hub: 'sign',
    alsoHub: ['compress'],
    sitemapPriority: '0.6',
    sitemapChangefreq: 'monthly',
  },
  {
    href: '/install-pdf-app/',
    label: 'Installing it as an app',
    blurb: 'Install it once and every tool here works with no connection at all.',
    icon: Download,
    hub: 'sign',
    alsoHub: ['compress'],
    sitemapPriority: '0.6',
    sitemapChangefreq: 'monthly',
  },
  {
    href: '/offline-pdf-form-filler/',
    label: 'Filling a form offline',
    blurb: 'No upload, and it works on scans and flat PDFs with no real fields at all.',
    icon: WifiOff,
    hub: 'sign',
    alsoHub: ['redact'],
    sitemapPriority: '0.6',
    sitemapChangefreq: 'monthly',
  },
  {
    href: '/open-source-pdf-editor/',
    label: 'Open source & how to verify it',
    blurb: 'MIT licensed, plus a one-minute test that proves nothing uploads.',
    icon: Code2,
    hub: 'edit-pdf',
    alsoHub: ['redact'],
    sitemapPriority: '0.6',
    sitemapChangefreq: 'monthly',
  },
  {
    href: '/blur-vs-blackout-vs-delete-pdf/',
    label: 'Blur, blackout, or delete?',
    blurb: 'A visual guide to each option, with automatic flattening explained.',
    icon: Layers,
    hub: 'redact',
    sitemapPriority: '0.6',
    sitemapChangefreq: 'monthly',
  },
  {
    href: '/permanently-delete-text-from-pdf/',
    label: 'Delete text and images from a PDF',
    blurb: 'Remove selectable elements, keep the remaining text, and know the limits.',
    icon: Trash2,
    hub: 'redact',
    sitemapPriority: '0.6',
    sitemapChangefreq: 'monthly',
  },
  {
    href: '/pdf-wont-compress-to-100kb/',
    label: "Why 100KB won't fit",
    blurb: 'Real measured examples: how many pages actually fit before text blurs.',
    icon: ScanText,
    hub: 'compress',
    sitemapPriority: '0.6',
    sitemapChangefreq: 'monthly',
  },
  {
    href: '/photo-and-signature-size-for-forms/',
    label: 'Photo and signature size limits',
    blurb: 'What decides whether a portal photo fits, and what this tool does not do.',
    icon: IdCard,
    hub: 'compress-image',
    alsoHub: ['compress'],
    sitemapPriority: '0.6',
    sitemapChangefreq: 'monthly',
  },
];

export const guides = [
  {
    href: '/how-to-sign-a-pdf-on-windows/',
    label: 'Windows',
    blurb: 'Sign a PDF without printing and scanning it.',
    icon: Monitor,
    hub: 'sign',
    sitemapPriority: '0.5',
    sitemapChangefreq: 'monthly',
  },
  {
    href: '/how-to-sign-a-pdf-on-mac/',
    label: 'Mac',
    blurb: 'What Preview covers, and where it stops.',
    icon: Laptop,
    hub: 'sign',
    sitemapPriority: '0.5',
    sitemapChangefreq: 'monthly',
  },
  {
    href: '/how-to-sign-a-pdf-on-iphone/',
    label: 'iPhone',
    blurb: 'What Markup covers, and where it stops.',
    icon: Smartphone,
    hub: 'sign',
    sitemapPriority: '0.5',
    sitemapChangefreq: 'monthly',
  },
  {
    href: '/how-to-sign-a-pdf-on-android/',
    label: 'Android',
    blurb: 'Sign a PDF on Android with no app to install.',
    icon: TabletSmartphone,
    hub: 'sign',
    sitemapPriority: '0.5',
    sitemapChangefreq: 'monthly',
  },
];

export const contentPages = [...landingPages, ...guides];

/**
 * Every content page that hangs off a given tool page: primary `hub` matches
 * first, then `alsoHub` ones, each in registry order. The two-tier sort is the
 * whole behavioural difference between the fields, and it is load-bearing -
 * a flat filter returns registry order, which put the two secondary cards
 * ABOVE `/redact/`'s own two topical guides, so the first thing a redact
 * visitor saw under "Documentation" was a form-filling guide.
 */
export function contentPagesForTool(slug) {
  return [
    ...contentPages.filter((page) => page.hub === slug),
    ...contentPages.filter((page) => page.alsoHub?.includes(slug)),
  ];
}
