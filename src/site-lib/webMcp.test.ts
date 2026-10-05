import { describe, expect, it, vi } from 'vitest';
import { buildTools, parseEntries, registerWebMcp, type WebMcpEntry } from './webMcp.ts';

const entries: WebMcpEntry[] = [
  { slug: 'sign', name: 'Sign & Fill PDF', description: 'Sign a PDF.', url: 'https://pdkef.com/sign/' },
  { slug: 'merge', name: 'Merge PDF', description: 'Combine PDFs.', url: 'https://pdkef.com/merge/' },
];

describe('webMcp', () => {
  it('parses the data block and survives garbage', () => {
    expect(parseEntries(JSON.stringify(entries))).toEqual(entries);
    expect(parseEntries('not json')).toEqual([]);
    expect(parseEntries(null)).toEqual([]);
  });

  it('lists every tool with its url', async () => {
    const list = buildTools(entries, vi.fn())[0];
    const out = await list.execute({});
    expect(out.content[0].text).toContain('merge: Merge PDF');
    expect(out.content[0].text).toContain('https://pdkef.com/sign/');
  });

  it('opens a known tool by navigating after the result returns', async () => {
    vi.useFakeTimers();
    const navigate = vi.fn();
    const open = buildTools(entries, navigate)[1];
    const out = await open.execute({ tool: 'merge' });
    expect(out.isError).toBeUndefined();
    expect(navigate).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(navigate).toHaveBeenCalledWith('https://pdkef.com/merge/');
    vi.useRealTimers();
  });

  it('rejects an unknown tool without navigating', async () => {
    const navigate = vi.fn();
    const out = await buildTools(entries, navigate)[1].execute({ tool: 'upload' });
    expect(out.isError).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('takes no file input anywhere', () => {
    for (const t of buildTools(entries, vi.fn())) {
      expect(JSON.stringify(t.inputSchema)).not.toMatch(/file|bytes|base64|data/i);
    }
  });

  it('registers one by one, falls back to provideContext, and no-ops without the API', () => {
    const registerTool = vi.fn();
    expect(registerWebMcp({ registerTool }, entries, vi.fn())).toBe(true);
    expect(registerTool).toHaveBeenCalledTimes(2);
    const provideContext = vi.fn();
    expect(registerWebMcp({ provideContext }, entries, vi.fn())).toBe(true);
    expect(provideContext.mock.calls[0][0].tools).toHaveLength(2);
    expect(registerWebMcp(undefined, entries, vi.fn())).toBe(false);
    expect(registerWebMcp({}, entries, vi.fn())).toBe(false);
  });
});
