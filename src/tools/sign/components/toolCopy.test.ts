import { describe, it, expect } from 'vitest';
import { buildToolCopy } from './toolCopy.ts';
import { englishSignMessages } from '#editor/registry/signMessages.ts';

const TOOLS = ['text', 'date', 'symbol', 'signature', 'whiteout', 'ellipse', 'rectangle', 'line', 'highlight'] as const;

describe('buildToolCopy', () => {
  const copy = buildToolCopy(englishSignMessages);

  it('has non-empty copy for every Sign tool', () => {
    for (const tool of TOOLS) {
      expect(copy[tool], tool).toBeDefined();
      expect(copy[tool].action.length, tool).toBeGreaterThan(0);
      expect(copy[tool].actionTouch.length, tool).toBeGreaterThan(0);
    }
    expect(Object.keys(copy).sort()).toEqual([...TOOLS].sort());
  });

  it('wires the highlight tool to the highlight messages', () => {
    expect(copy.highlight.action).toBe(englishSignMessages.highlightAction);
    expect(copy.highlight.actionTouch).toBe(englishSignMessages.highlightActionTouch);
    expect(copy.highlight.button).toBe(englishSignMessages.highlightLabel);
  });
});
