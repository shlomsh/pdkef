// astro:content is a build-only virtual module; see documentation.ts's
// collections() for why this stays behind a literal, non-@vite-ignore'd
// dynamic import instead of a top-level one. This is the one typed view of it
// for the i18n modules.
export type ContentEntry = { id: string; data: Record<string, any> };

export async function getEntryData(collection: string): Promise<ContentEntry[]> {
  const { getCollection } = (await import('astro:content')) as unknown as {
    getCollection: (name: string) => Promise<ContentEntry[]>;
  };
  return getCollection(collection);
}
