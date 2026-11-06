// A vote's region by name (SEO-58). Vercel reports ISO 3166-2 codes, so `KE` and `31` read "Nakuru". Imported by
// `api/notes.ts` alone: the table stays in the function, and no page or other function carries it.
import iso from 'iso-3166-2';

/** The region's English name, or undefined for a code the table does not know. */
export function regionName(country: string, region: string): string | undefined {
  return iso.subdivision(`${country}-${region}`)?.name || undefined;
}
