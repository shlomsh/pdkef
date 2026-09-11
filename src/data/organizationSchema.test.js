import { describe, it, expect } from 'vitest';
import { organization, website, SUPPORT_CONTACT_URL, SITE_URL } from './organizationSchema.js';
import { staticPages } from './staticPages.js';

describe('Organization JSON-LD', () => {
  it('is a schema.org Organization named PDkef at the canonical site URL', () => {
    expect(organization['@context']).toBe('https://schema.org');
    expect(organization['@type']).toBe('Organization');
    expect(organization.name).toBe('PDkef');
    expect(organization.url).toBe(SITE_URL);
    expect(organization.logo).toMatch(/^https:\/\/pdkef\.com\/icons\/icon-512\.png$/);
  });

  it('carries a ContactPoint with a contactType and a url', () => {
    // What an agent-readiness check looks for: a way to verify the site is
    // a real, reachable thing. contactType + url is the honest subset -
    // there is no support inbox or phone, so neither is claimed.
    const cp = organization.contactPoint;
    expect(cp['@type']).toBe('ContactPoint');
    expect(cp.contactType).toBe('customer support');
    expect(cp.url).toBe(SUPPORT_CONTACT_URL);
    expect(cp).not.toHaveProperty('email');
    expect(cp).not.toHaveProperty('telephone');
  });

  it('points the ContactPoint at the same channel /contact/ leads with', () => {
    // The schema must never promise a channel the human-facing page does
    // not name. /contact/ is the source of truth for how to reach PDkef.
    const contact = staticPages.find((p) => p.slug === 'contact');
    expect(contact).toBeDefined();
    const prose = contact.sections.flatMap((s) => s.paragraphs).join('\n');
    expect(prose).toContain(`href="${SUPPORT_CONTACT_URL}"`);
  });

  it('does not claim a postal address it cannot back', () => {
    // Deliberate: no PostalAddress until there is a real, publishable one.
    expect(organization).not.toHaveProperty('address');
  });

  it('links the founder and the open-source repo via sameAs', () => {
    expect(organization.founder['@type']).toBe('Person');
    expect(organization.sameAs).toContain('https://github.com/shlomsh/pdkef');
  });
});

describe('WebSite JSON-LD', () => {
  it('names the same site and publisher as the Organization', () => {
    expect(website['@type']).toBe('WebSite');
    expect(website.name).toBe(organization.name);
    expect(website.url).toBe(organization.url);
    expect(website.publisher.name).toBe(organization.name);
  });
});
