# Tailwind Migration Learnings & Future Plan

**Branch:** `tailwind-refactor-wip`

This document serves as a handover for future agents attempting to resume the Tailwind CSS migration for the PDF Editor (`SignTool`). The migration involves significant complexities that go far beyond simple styling changes. **Read this carefully before touching the codebase.**

## What Was Attempted
- The goal was to migrate the PDF Editor's legacy vanilla CSS to Tailwind CSS utility classes.
- A new branch (`tailwind-refactor-wip`) was created containing the partial migration, including changes to `DraggableWrapper.jsx`, `SignToolbar.jsx`, `ElementToolbar.jsx`, and various extracted hooks (`useDraggableElement.js`).
- The environment has been reverted back to production (`main`) to unblock immediate development, but the refactor branch is available for continuation.

## Critical Challenges & Warnings

### 1. The Math Complexities of PDF Elements (High Severity)
The PDF editor relies on precise, high-performance coordinate math to handle dragging, resizing, and responsive scaling over a PDF canvas. **This is not just simple styling.**

During the refactor, attempts were made to simplify or "precalculate" this math by binding pointer move events directly to React state updates (e.g., dispatching `onChange` inside `handleResizeMove` for every pixel moved). 

**THIS IS A FATAL FLAW.** It causes reconciliation overload (React state thrashing), making the editor unusably slow and breaking real-time visual feedback.

**The Golden Rule for PDF Elements:**
- **Real-time DOM Updates:** During a gesture (`pointermove`), you **MUST** use raw DOM mutations (e.g., `elementRef.current.style.transform = ...`) to provide real-time visual feedback. 
- **Deferred State Updates:** You must only dispatch React state updates (`onChange` with the final percentage-based coordinates) on the `pointerup` / gesture end event.
- **Do not** attempt to route continuous drag or resize gestures through the React context. The "older math" that handles this deferred calculation is structurally necessary and must be preserved intact.

### 2. Styling Cascades & Invisible Elements
The legacy CSS (e.g., `.sign-element-actions`, `.sign-tool-btn`) handles complex visual states involving transparency, active modifiers, and layered z-indexes.

During the migration, replacing these with naive Tailwind classes (like `bg-surface text-text`) caused massive UI regressions:
- The floating toolbars became invisible because the buttons were white text on transparent backgrounds, and the new Tailwind container had a white background.
- Relying entirely on utility classes destroyed the structural integrity of the `active` states that were previously handled cleanly via CSS cascades (e.g., `.sign-element.active .sign-element-actions`).

**The Fix / Future Approach:**
- Do not blindly delete legacy CSS classes from `global.css` without exhaustively verifying every conditional state (active, RTL, dark mode, mobile scaling).
- For complex, highly-dynamic components like the `ElementToolbar`, it is often safer to wrap Tailwind utilities using `@apply` inside the existing semantic class names rather than polluting the JSX with dozens of conditional utility strings.

## Next Steps for Future Agents
1. Checkout the `tailwind-refactor-wip` branch.
2. Review the `tech_debt_audit.md` and this document.
3. Revert the `handleResizeMove` and `handlePointerMove` logic in `DraggableWrapper.jsx` to perfectly match the production `main` branch's real-time DOM mutation pattern.
4. Carefully translate the remaining vanilla CSS to Tailwind, ensuring that cascading interactions (like selection states) are thoroughly tested.
