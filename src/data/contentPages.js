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
// ToolCrossLinks.astro fixed the same problem between tool pages.
import { Monitor, Laptop, Smartphone, TabletSmartphone, UserX, WifiOff, Code2, Trash2 } from 'lucide-preact';

export const landingPages = [
  {
    href: '/sign-pdf-no-signup/',
    label: 'Signing without an account',
    icon: UserX,
    hub: 'sign',
    sitemapPriority: '0.6',
    sitemapChangefreq: 'monthly',
  },
  {
    href: '/offline-pdf-form-filler/',
    label: 'Filling forms offline',
    icon: WifiOff,
    hub: 'sign',
    sitemapPriority: '0.6',
    sitemapChangefreq: 'monthly',
  },
  {
    href: '/open-source-pdf-editor/',
    label: 'Open source & how to verify it',
    icon: Code2,
    hub: 'edit-pdf',
    sitemapPriority: '0.6',
    sitemapChangefreq: 'monthly',
  },
  {
    href: '/permanently-delete-text-from-pdf/',
    label: 'Deleting text for real',
    icon: Trash2,
    hub: 'redact',
    sitemapPriority: '0.6',
    sitemapChangefreq: 'monthly',
  },
];

export const guides = [
  { href: '/how-to-sign-a-pdf-on-windows/', label: 'Windows', icon: Monitor, hub: 'sign', sitemapPriority: '0.5', sitemapChangefreq: 'monthly' },
  { href: '/how-to-sign-a-pdf-on-mac/', label: 'Mac', icon: Laptop, hub: 'sign', sitemapPriority: '0.5', sitemapChangefreq: 'monthly' },
  { href: '/how-to-sign-a-pdf-on-iphone/', label: 'iPhone', icon: Smartphone, hub: 'sign', sitemapPriority: '0.5', sitemapChangefreq: 'monthly' },
  { href: '/how-to-sign-a-pdf-on-android/', label: 'Android', icon: TabletSmartphone, hub: 'sign', sitemapPriority: '0.5', sitemapChangefreq: 'monthly' },
];

export const contentPages = [...landingPages, ...guides];

/** Every content page that hangs off a given tool page, in registry order. */
export function contentPagesForTool(slug) {
  return contentPages.filter((page) => page.hub === slug);
}
