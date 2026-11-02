import { describe, expect, it } from 'vitest';
import { orphanedSelectorLists } from './check-orphaned-selectors.mjs';

// The real RED-30 hunk (commit 9fe53829): the deleted rule's comma-ended
// predecessor now joins `.dropdown-list`.
const RED_30 = `diff --git a/src/editor-ui/EditorControls.module.css b/src/editor-ui/EditorControls.module.css
index 18510163..da574df7 100644
--- a/src/editor-ui/EditorControls.module.css
+++ b/src/editor-ui/EditorControls.module.css
@@ -57,7 +55,6 @@
 .menu-item:hover { background: var(--color-surface-sunken); }
 .thickness-item { min-height: 0; padding: 0.15rem 0.35rem; }
 .thickness-item.is-selected,
-.blur-strength-item.is-selected { background: var(--color-primary-soft); color: var(--color-primary-text); }
 .dropdown-list { display: flex; flex-direction: column; gap: .5rem; max-height: 180px; overflow-y: auto; padding: 8px 8px 2px 2px; }
 .dropdown-list.clean { padding: 0; gap: 4px; }
 .dropdown-item { position: relative; display: flex; }
`;

const css = (hunk) => `diff --git a/a.css b/a.css
--- a/a.css
+++ b/a.css
@@ -10,6 +10,5 @@
${hunk}
`;

describe('orphanedSelectorLists', () => {
  it('names the comma line left joined to the next rule (RED-30)', () => {
    expect(orphanedSelectorLists(RED_30)).toEqual([
      { file: 'src/editor-ui/EditorControls.module.css', line: 57, selector: '.thickness-item.is-selected,', next: '.dropdown-list { display: flex; flex-direction: column; gap: .5rem; max-height: 180px; overflow-y: auto; padding: 8px 8px 2px 2px; }' },
    ]);
  });

  it('ignores a multi-line selector list left intact', () => {
    expect(orphanedSelectorLists(css(' .a,\n .b,\n .c { color: red; }\n-.old { color: blue; }\n .next { top: 0; }'))).toEqual([]);
  });

  it('ignores a selector list deleted together with its rule', () => {
    expect(orphanedSelectorLists(css(' .keep { top: 0; }\n-.a,\n-.b { color: red; }\n .next { top: 0; }'))).toEqual([]);
  });

  it('ignores removing one selector from a list', () => {
    expect(orphanedSelectorLists(css(' .a,\n-.b,\n .c { color: red; }'))).toEqual([]);
  });

  it('ignores a comma inside a declaration value', () => {
    expect(orphanedSelectorLists(css(' .a {\n   font-family: a, b,\n-  c { }\n   color: red;'))).toEqual([]);
  });

  it('ignores a comma inside a comment', () => {
    expect(orphanedSelectorLists(css(' .a { top: 0; } /* one, two, */\n-.b { color: red; }\n .next { top: 0; }'))).toEqual([]);
  });

  it('ignores an added rule and a rewritten rule', () => {
    expect(orphanedSelectorLists(css(' .a,\n+.b { color: red; }\n .next { top: 0; }'))).toEqual([]);
    expect(orphanedSelectorLists(css(' .a,\n-.b { color: red; }\n+.b { color: blue; }\n .next { top: 0; }'))).toEqual([]);
  });

  it('ignores files that are not css', () => {
    expect(orphanedSelectorLists(RED_30.replaceAll('.css', '.txt'))).toEqual([]);
  });
});
