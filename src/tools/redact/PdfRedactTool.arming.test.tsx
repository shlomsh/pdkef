import { act } from 'preact/test-utils';
import { describe, expect, it, vi } from 'vitest';
import PdfRedactTool from './PdfRedactTool.tsx';
import { CHECKING } from './lib/check/checkCopy.ts';
// @ts-expect-error -- this browser-first project intentionally omits Node ambient types; Vitest provides the runtime.
import fs from 'node:fs';
import * as gestureController from '#lib/gestures/controller.ts';
import { waitUntil } from '../../test/harness/waitUntil.ts';
import { installToolHarness } from '../../test/harness/toolHarness.ts';
import { useRedactSuite, required, query } from '../../test/support/redactTool.tsx';

declare const __dirname: string;

// pdf.js and the canvas are faked by the shared suite (src/test/support/redactTool.tsx); only the ring
// sampler is steered per test, through `pageSampler`.
vi.mock('#editor-ui/whiteout/pageSampling.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#editor-ui/whiteout/pageSampling.ts')>();
  const { pageSampler } = await import('../../test/support/redactTool.tsx');
  return {
    ...actual,
    sampleRingColor: (canvas: HTMLCanvasElement | null | undefined, box: { left: number; top: number; width: number; height: number }) => {
      pageSampler.calls.push({ canvas, box });
      return pageSampler.impl(canvas, box);
    },
  };
});

describe('PdfRedactTool UI flow', () => {
  const { s, loadFileAndGetDrawArea, armTool, drawBox, loadFileWithoutArming, findToolButton, openSecondFile } = useRedactSuite({ Tool: PdfRedactTool, checking: CHECKING, gestureController, installToolHarness, waitUntil });

  // The mobile scroll fix itself (see the touchAction comment in
  // PdfRedactTool.tsx's page-wrapper style, and CLAUDE.md's "Sign editor
  // positioning" notes for the sibling Sign-tool pattern this mirrors). Before
  // E9 a style was armed from the moment a file loaded, so this inline style
  // was unconditionally 'none' and a phone could never scroll a redact page at
  // all. This is a real inline style attribute, not a computed cascade value,
  // so unlike most CSS in this codebase it's fully assertable under jsdom.
  describe('touch-action follows tool arming (mobile scroll fix)', () => {
    it('is auto (page scrolls) when a file first loads, before any tool is armed', async () => {
      const drawArea = await loadFileWithoutArming();
      expect(drawArea.style.touchAction).toBe('auto');
    });

    it('is none while Blackout is armed, so a drag draws instead of scrolling', async () => {
      const drawArea = await loadFileAndGetDrawArea(); // arms Blackout
      expect(drawArea.style.touchAction).toBe('none');
    });

    it('is none while Whiteout is armed', async () => {
      const drawArea = await loadFileAndGetDrawArea(); // arms Blackout first
      await armTool('Whiteout'); // switches the armed tool
      expect(drawArea.style.touchAction).toBe('none');
    });

    it('is none while Blur is armed', async () => {
      const drawArea = await loadFileAndGetDrawArea();
      await armTool('Blur');
      expect(drawArea.style.touchAction).toBe('none');
    });

    it('returns to auto once a drawn box commits and the one-shot tool disarms itself', async () => {
      const drawArea = await loadFileAndGetDrawArea(); // arms Blackout, unlocked
      expect(drawArea.style.touchAction).toBe('none');

      await drawBox(drawArea, 50, 200, 200, 500);

      expect(drawArea.style.touchAction).toBe('auto');
    });

    it('stays auto while Delete is armed, since Delete places by tap and never owns the drag gesture', async () => {
      const fixturePath = `${__dirname}/../../lib/__fixtures__/num-1.pdf`;
      const fixtureBytes = fs.readFileSync(fixturePath);
      const drawArea = await loadFileAndGetDrawArea(
        new File([fixtureBytes], 'num-1.pdf', { type: 'application/pdf' })
      );

      await armTool('Delete');

      expect(drawArea.style.touchAction).toBe('auto');
    });

    // QUAL-44: this used to be a Playwright case. touch-action alone is not
    // enough on iOS, the page's own touchmove has to be cancelled too, and that
    // only happens if the page wrapper really forwards a touchstart to the
    // drawing hook (the hook's own unit calls the handler directly).
    it('cancels the touchmove of a touch-drawn box, so the page does not scroll under the finger', async () => {
      const drawArea = await loadFileAndGetDrawArea(); // arms Blackout
      const touch = (x: number, y: number) => ({ identifier: 1, target: drawArea, clientX: x, clientY: y });

      await act(async () => {
        drawArea.dispatchEvent(new TouchEvent('touchstart', {
          bubbles: true, cancelable: true, touches: [touch(50, 200)] as never, changedTouches: [touch(50, 200)] as never,
        }));
      });
      const move = new TouchEvent('touchmove', {
        bubbles: true, cancelable: true, touches: [touch(200, 500)] as never, changedTouches: [touch(200, 500)] as never,
      });
      await act(async () => { window.dispatchEvent(move); });
      await act(async () => { window.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [] })); });

      expect(move.defaultPrevented).toBe(true);
    });
  });

  describe('one-shot tool arming', () => {
    it('does not draw a second box after the first commits without re-arming', async () => {
      const drawArea = await loadFileAndGetDrawArea(); // arms Blackout, unlocked

      await drawBox(drawArea, 50, 200, 200, 500);
      expect(s.container.querySelectorAll('[data-redact-box-id]')).toHaveLength(1);

      // Same gesture, nothing re-armed in between: handlePointerDown bails out
      // immediately because activeStyle is back to null.
      await drawBox(drawArea, 60, 220, 220, 520);
      expect(s.container.querySelectorAll('[data-redact-box-id]')).toHaveLength(1);
    });

    it('draws a second box once the tool is re-armed', async () => {
      const drawArea = await loadFileAndGetDrawArea();

      await drawBox(drawArea, 50, 200, 200, 500);
      expect(s.container.querySelectorAll('[data-redact-box-id]')).toHaveLength(1);

      await armTool('Blackout');
      await drawBox(drawArea, 60, 220, 220, 520);
      expect(s.container.querySelectorAll('[data-redact-box-id]')).toHaveLength(2);
    });

    // A drag that never actually moved the pointer draws nothing (width/height
    // <= 1), and must not have spent the one placement - otherwise a mistimed
    // tap would silently disarm the tool and the next real drag would do
    // nothing at all. See the "commit" comment in PdfRedactTool.tsx.
    it('a drag that draws nothing does not spend the arming', async () => {
      const drawArea = await loadFileAndGetDrawArea();

      await drawBox(drawArea, 50, 200, 50, 200); // zero-delta drag, no box
      expect(s.container.querySelectorAll('[data-redact-box-id]')).toHaveLength(0);
      expect(drawArea.style.touchAction).toBe('none'); // still armed

      await drawBox(drawArea, 50, 200, 200, 500); // now actually draw
      expect(s.container.querySelectorAll('[data-redact-box-id]')).toHaveLength(1);
    });
  });

  describe('locking a tool on with a double click', () => {
    it('keeps the tool armed across two drawn boxes and marks the button locked', async () => {
      const drawArea = await loadFileWithoutArming();

      await armTool('Blackout', { lock: true });
      const blackoutBtn = findToolButton('Blackout');
      expect(blackoutBtn.hasAttribute('data-locked')).toBe(true);

      await drawBox(drawArea, 50, 200, 200, 500);
      expect(s.container.querySelectorAll('[data-redact-box-id]')).toHaveLength(1);
      // The lock survived the commit - still locked, no re-arm needed for the
      // second box.
      expect(blackoutBtn.hasAttribute('data-locked')).toBe(true);

      await drawBox(drawArea, 60, 220, 220, 520);
      expect(s.container.querySelectorAll('[data-redact-box-id]')).toHaveLength(2);
    });
  });

  describe('status line "Keep <tool> on" / "Turn <tool> off" chip', () => {
    // Scoped to the toolbar's own help/status line, not just any [role="status"]
    // - the sr-only announcement region at the top of PdfRedactTool.tsx has the
    // same role for its own, unrelated reason (live-announcing text changes).
    const statusChip = () => query<HTMLButtonElement>(s.container, '[data-tool-status] [role="status"] button');

    it('names the armed tool rather than the action, and locks it on when clicked', async () => {
      await loadFileAndGetDrawArea(); // arms Blackout, unlocked
      expect(statusChip().textContent).toContain('Keep Blackout on');
      expect(statusChip().getAttribute('aria-checked')).toBe('false');

      await act(async () => {
        statusChip().click();
      });

      expect(statusChip().getAttribute('aria-checked')).toBe('true');
      expect(findToolButton('Blackout').hasAttribute('data-locked')).toBe(true);
    });

    // Redact is why the chip cannot use a bare verb: this tool takes a run out
    // of the file, so the old "Keep adding" label described the opposite of
    // what pressing it would do.
    it('does not describe the Delete tool as adding anything', async () => {
      await loadFileWithoutArming();
      await armTool('Delete');
      expect(statusChip().textContent).toContain('Keep Delete on');
      expect(statusChip().textContent).not.toContain('adding');
    });

    it('returns a locked tool to one at a time, and stays on screen to be undone', async () => {
      await loadFileWithoutArming();
      await armTool('Blackout', { lock: true });
      expect(statusChip().getAttribute('aria-checked')).toBe('true');

      await act(async () => {
        statusChip().click();
      });

      // Still armed, still here. Switching off is the inverse of switching on,
      // not a way out of the tool - so the switch cannot delete itself from
      // under the pointer, and a mis-tap is one tap from being undone.
      expect(statusChip()).not.toBeNull();
      expect(statusChip().getAttribute('aria-checked')).toBe('false');
      expect(findToolButton('Blackout').hasAttribute('data-locked')).toBe(false);
      expect(findToolButton('Blackout').getAttribute('aria-pressed')).toBe('true');
    });

    // Leaving the tool entirely is a statement about the tool, so it is made at
    // the tool - or with Escape. That path is what restores page scrolling.
    it('leaves stopping entirely to Escape and the tool button', async () => {
      const drawArea = await loadFileWithoutArming();
      await armTool('Blackout', { lock: true });
      expect(drawArea.style.touchAction).toBe('none');

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });

      expect(s.container.querySelector('[data-tool-status] [role="status"]')).toBeNull();
      expect(drawArea.style.touchAction).toBe('auto');
    });
  });

  // These buttons used to carry a native `title` for the action plus a
  // separate ArmHint bubble for the double-click shortcut, which could both be
  // showing on hover at once, on two different delays. One bubble now covers
  // both, reached the accessible way (aria-describedby) rather than `title`.
  // ArmHint portals its bubble to `document.body` (see ArmHint.tsx - `.toolbar`'s
  // container-type clips anything overflowing it), so these look it up through
  // `document`, not `s.container`. Opened by focus rather than hover: Floating
  // UI's useFocus opens with no artificial delay, where useHover's 500ms would
  // need fake timers here for no real gain, and focus is also the path a
  // keyboard user actually takes.
  describe('tool button hint bubble', () => {
    it('has no native title, and its hint carries both the action and the shortcut', async () => {
      await loadFileWithoutArming();
      const deleteBtn = findToolButton('Delete');
      expect(deleteBtn.hasAttribute('title')).toBe(false);

      await act(async () => {
        deleteBtn.focus();
      });

      const describedBy = required(deleteBtn.getAttribute('aria-describedby'), 'aria-describedby');
      expect(describedBy).toBeTruthy();
      const hint = required(document.getElementById(describedBy), 'tool hint');
      expect(hint.textContent).toContain('Click text or an image to delete it, or drag across several');
      expect(hint.textContent).toContain('Double-click to keep Delete on');
    });

    it('drops the hint and its aria-describedby once the tool is locked', async () => {
      await loadFileWithoutArming();
      await armTool('Delete', { lock: true });

      const deleteBtn = findToolButton('Delete');
      await act(async () => {
        deleteBtn.focus();
      });

      expect(deleteBtn.hasAttribute('aria-describedby')).toBe(false);
      expect(document.querySelector('[role="tooltip"]')).toBeNull();
    });
  });

  describe('opening another file (SNG-08)', () => {
    it('leaves no tool armed, even one that was locked', async () => {
      const drawArea = await loadFileWithoutArming();
      await armTool('Blackout', { lock: true });
      expect(drawArea.style.touchAction).toBe('none');
      expect(findToolButton('Blackout').hasAttribute('data-locked')).toBe(true);

      await openSecondFile('second.pdf');

      const next = query<HTMLElement>(s.container, '.redact-draw-area');
      expect(next.style.touchAction).toBe('auto');
      expect(findToolButton('Blackout').hasAttribute('data-locked')).toBe(false);
      expect(findToolButton('Blackout').getAttribute('aria-pressed')).toBe('false');
    });
  });

  describe('Escape disarms the tool', () => {
    it('disarms a one-shot armed tool and restores scrolling', async () => {
      const drawArea = await loadFileAndGetDrawArea(); // arms Blackout
      expect(drawArea.style.touchAction).toBe('none');

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });

      expect(s.container.querySelector('[data-tool-status] [role="status"]')).toBeNull();
      expect(drawArea.style.touchAction).toBe('auto');
    });

    it('disarms a locked tool too', async () => {
      const drawArea = await loadFileWithoutArming();
      await armTool('Blackout', { lock: true });
      expect(drawArea.style.touchAction).toBe('none');

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });

      expect(s.container.querySelector('[data-tool-status] [role="status"]')).toBeNull();
      expect(drawArea.style.touchAction).toBe('auto');
    });
  });
});
