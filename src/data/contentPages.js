// Non-tool SEO/content pages: long-tail landing pages and OS how-to guides.
// Kept separate from tools.js (which is islands + the tool grid) since these
// pages carry no Preact island and aren't part of the tool suite itself, but
// they still need one place to drive the sitemap and the guides' own
// cross-links to each other, so slugs can't silently drift out of sync.
import { Monitor, Laptop, Smartphone, TabletSmartphone } from 'lucide-preact';

export const landingPages = [
  { href: '/sign-pdf-no-signup/', sitemapPriority: '0.6', sitemapChangefreq: 'monthly' },
  { href: '/offline-pdf-form-filler/', sitemapPriority: '0.6', sitemapChangefreq: 'monthly' },
  { href: '/open-source-pdf-editor/', sitemapPriority: '0.6', sitemapChangefreq: 'monthly' },
  { href: '/permanently-delete-text-from-pdf/', sitemapPriority: '0.6', sitemapChangefreq: 'monthly' },
];

export const guides = [
  { href: '/how-to-sign-a-pdf-on-windows/', label: 'Windows', icon: Monitor, sitemapPriority: '0.5', sitemapChangefreq: 'monthly' },
  { href: '/how-to-sign-a-pdf-on-mac/', label: 'Mac', icon: Laptop, sitemapPriority: '0.5', sitemapChangefreq: 'monthly' },
  { href: '/how-to-sign-a-pdf-on-iphone/', label: 'iPhone', icon: Smartphone, sitemapPriority: '0.5', sitemapChangefreq: 'monthly' },
  { href: '/how-to-sign-a-pdf-on-android/', label: 'Android', icon: TabletSmartphone, sitemapPriority: '0.5', sitemapChangefreq: 'monthly' },
];

export const contentPages = [...landingPages, ...guides];
