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
// `blurb` is that one-line description, RelatedGuides' equivalent of
// tools.js's gridDescription. `label` stays the short form OtherGuides.astro
// uses for its OS-switcher pills, where the "Signing on a different device?"
// heading already supplies the context a bare "Windows" needs.
import { Monitor, Laptop, Smartphone, TabletSmartphone, UserX, WifiOff, Code2, Trash2 } from 'lucide-preact';

export const landingPages = [
  {
    href: '/sign-pdf-no-signup/',
    label: 'Signing without an account',
    blurb: 'No account, no email, no trial that runs out.',
    icon: UserX,
    hub: 'sign',
    sitemapPriority: '0.6',
    sitemapChangefreq: 'monthly',
  },
  {
    href: '/offline-pdf-form-filler/',
    label: 'Filling forms offline',
    blurb: 'Install it once and it works with no connection at all.',
    icon: WifiOff,
    hub: 'sign',
    sitemapPriority: '0.6',
    sitemapChangefreq: 'monthly',
  },
  {
    href: '/open-source-pdf-editor/',
    label: 'Open source & how to verify it',
    blurb: 'MIT licensed, plus a one-minute test that proves nothing uploads.',
    icon: Code2,
    hub: 'edit-pdf',
    sitemapPriority: '0.6',
    sitemapChangefreq: 'monthly',
  },
  {
    href: '/permanently-delete-text-from-pdf/',
    label: 'Deleting text for real',
    blurb: "Why a black box doesn't remove anything underneath, and what does.",
    icon: Trash2,
    hub: 'redact',
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

/** Every content page that hangs off a given tool page, in registry order. */
export function contentPagesForTool(slug) {
  return contentPages.filter((page) => page.hub === slug);
}
