/**
 * WebMCP: lets an in-browser agent (`navigator.modelContext`) discover the
 * tools and open the right one for a person. The tools only list and navigate:
 * the PDF itself is chosen on the person's device inside the tool page, so no
 * file byte, and no file name, ever passes through an agent. That is the
 * product's privacy contract, and the reason there is no "merge these bytes"
 * tool here.
 *
 * The tool list is rendered at build time into a JSON data block
 * (`BaseLayout.astro`), so this module imports no icons and no copy.
 */

export interface WebMcpEntry {
  slug: string;
  name: string;
  description: string;
  url: string;
}

interface ToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

interface ModelContextTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean };
  execute: (args: Record<string, unknown>) => ToolResult | Promise<ToolResult>;
}

export interface ModelContextLike {
  registerTool?: (tool: ModelContextTool) => unknown;
  provideContext?: (context: { tools: ModelContextTool[] }) => unknown;
}

const text = (value: string, isError = false): ToolResult => ({
  content: [{ type: 'text', text: value }],
  ...(isError ? { isError: true } : {}),
});

export function parseEntries(raw: string | null | undefined): WebMcpEntry[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((e): e is WebMcpEntry => !!e && typeof e.slug === 'string' && typeof e.url === 'string')
      : [];
  } catch {
    // expected: a missing or malformed data block means no tools to offer
    return [];
  }
}

export function buildTools(
  entries: WebMcpEntry[],
  navigate: (url: string) => void,
): ModelContextTool[] {
  const bySlug = new Map(entries.map((e) => [e.slug, e]));
  const slugs = entries.map((e) => e.slug);
  return [
    {
      name: 'list_pdf_tools',
      description:
        'List the PDF and image tools PDkef offers (sign and fill, merge, split, edit pages, compress, redact, convert, unlock). Everything runs on the person\'s device and files are never uploaded.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: () =>
        text(entries.map((e) => `${e.slug}: ${e.name} - ${e.description} (${e.url})`).join('\n')),
    },
    {
      name: 'open_pdf_tool',
      description:
        'Open one PDkef tool for the person. The page asks them to choose or drop their own file, so the document stays on their device and never passes through you.',
      inputSchema: {
        type: 'object',
        properties: { tool: { type: 'string', enum: slugs, description: 'Tool slug from list_pdf_tools.' } },
        required: ['tool'],
      },
      execute: (args) => {
        const entry = bySlug.get(String(args.tool));
        if (!entry) return text(`Unknown tool. Choose one of: ${slugs.join(', ')}.`, true);
        // Navigate after the result is handed back; the page is replaced.
        setTimeout(() => navigate(entry.url), 50);
        return text(`Opening ${entry.name}. The person picks their file there; it is not uploaded.`);
      },
    },
  ];
}

export function registerWebMcp(
  modelContext: ModelContextLike | undefined,
  entries: WebMcpEntry[],
  navigate: (url: string) => void,
): boolean {
  if (!modelContext || entries.length === 0) return false;
  const tools = buildTools(entries, navigate);
  try {
    if (modelContext.registerTool) tools.forEach((t) => modelContext.registerTool!(t));
    else if (modelContext.provideContext) modelContext.provideContext({ tools });
    else return false;
    return true;
  } catch {
    // expected: an agent host that rejects a registration must not break the page
    return false;
  }
}

export function startWebMcp(): void {
  const nav = navigator as Navigator & { modelContext?: ModelContextLike };
  registerWebMcp(
    nav.modelContext,
    // The block holds root-relative paths so a preview or LAN build opens
    // itself, not production.
    parseEntries(document.getElementById('pdkef-webmcp-tools')?.textContent).map((e) => ({
      ...e,
      url: new URL(e.url, location.origin).href,
    })),
    (url) => location.assign(url),
  );
}
