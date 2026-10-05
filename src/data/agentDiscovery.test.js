import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { tools } from './tools.js';

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const skillPath = 'public/.well-known/agent-skills/pdf-tools/SKILL.md';
const skill = read(skillPath);

// The agent-skills index (Cloudflare discovery RFC v0.2.0) carries a sha256
// of the SKILL.md bytes that clients verify, so an edit to the skill without a
// new digest makes every client reject it. The message prints the new value.
describe('agent discovery files', () => {
  const index = JSON.parse(read('public/.well-known/agent-skills/index.json'));
  const entry = index.skills[0];

  it('index digest matches SKILL.md', () => {
    const digest = 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(skillPath)).digest('hex');
    expect(entry.digest, `SKILL.md changed; set digest to ${digest}`).toBe(digest);
    expect(entry.type).toBe('skill-md');
    expect(entry.url).toBe('/.well-known/agent-skills/pdf-tools/SKILL.md');
    expect(entry.description.length).toBeLessThanOrEqual(1024);
  });

  it('SKILL.md frontmatter agrees with the index entry', () => {
    expect(skill).toMatch(new RegExp(`^---\\nname: ${entry.name}\\ndescription: ${entry.description.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n---`));
  });

  it('SKILL.md names every real tool page and WebMCP slug', () => {
    for (const t of tools) {
      expect(skill).toContain(`https://pdkef.com${t.href}`);
      expect(skill).toContain(`\`${t.slug}\``);
    }
  });

  it('ard.json entries point at the skill and claim nothing we lack', () => {
    const ard = JSON.parse(read('public/.well-known/ard.json'));
    for (const e of ard.entries) {
      expect(e.identifier).toMatch(/^urn:air:pdkef\.com:[a-z0-9-]+:[a-z0-9-]+$/);
      expect(e.type).toBe('application/ai-skill+md');
      expect(Number(Boolean(e.url)) + Number(Boolean(e.data))).toBe(1);
      expect(e.representativeQueries.length).toBeGreaterThanOrEqual(2);
      expect(e.representativeQueries.length).toBeLessThanOrEqual(5);
    }
    expect(ard.entries[0].url).toBe('https://pdkef.com' + entry.url);
  });

  it('writes no em dashes', () => {
    for (const p of [skillPath, 'public/agents.md', 'public/.well-known/ard.json']) expect(read(p)).not.toContain('—');
  });
});
