// The tool-page h1 is one sentence that must stay byte-identical for SEO. Its
// first words are the tool's name, which the hero sets large; the rest is the
// qualifier, set small beneath it. Anything that does not split cleanly
// renders as the plain h1 it always was.
export function splitHeroTitle(title: string, name?: string): { name: string; rest: string } | null {
  if (!name || !title.startsWith(`${name} `)) return null;
  const rest = title.slice(name.length + 1);
  return rest ? { name, rest } : null;
}
