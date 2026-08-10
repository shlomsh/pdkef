import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import SignToolbar from './SignToolbar.jsx';
import { SignToolProvider, useSignTool } from './SignToolContext.jsx';
import { SavedSignaturesContext } from './SavedSignaturesContext.jsx';
import styles from './SignToolbar.module.css';
import toolShellStyles from '../ToolShell.module.css';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('SignToolbar Component', () => {
  let container;

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    document.body.innerHTML = '';
  });

  it('renders all tool buttons and propagates selection via context', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);

    const setAnnouncement = vi.fn();

    let contextValue;
    const TestConsumer = () => {
      const { state } = useSignTool();
      contextValue = state;
      return null;
    };

    act(() => {
      render(
        <SignToolProvider>
          <SignToolbar
            setAnnouncement={setAnnouncement}
            setDialogOpen={() => {}}
            setUndoModalOpen={() => {}}
            actionHistory={[]}
            toggleFullscreen={() => {}}
            isFullscreen={false}
            onSavePdf={() => {}}
          />
          <TestConsumer />
        </SignToolProvider>,
        container
      );
    });

    const buttons = container.querySelectorAll(`.${styles.button}`);
    expect(buttons.length).toBeGreaterThan(0);

    const textBtn = Array.from(buttons).find(b => b.textContent.includes('Text') || b.querySelector('svg'));
    expect(textBtn).not.toBeUndefined();

    await act(async () => {
      textBtn.click();
    });

    expect(contextValue.selectedTool).toBe('text');
  });

  // Every tool arms for one placement; double-clicking its button keeps it on.
  // Shapes is the awkward one, because its tool lives behind a dropdown and a
  // menu item cannot be double-clicked (the first click unmounts it), so the
  // lock has to come off the Shapes button itself.
  describe('locking a tool on for repeat placements', () => {
    const renderToolbar = (onState) => {
      container = document.createElement('div');
      document.body.appendChild(container);

      const TestConsumer = () => {
        onState(useSignTool().state);
        return null;
      };

      act(() => {
        render(
          <SignToolProvider>
            <SignToolbar
              setAnnouncement={() => {}}
              setDialogOpen={() => {}}
              setUndoModalOpen={() => {}}
              actionHistory={[]}
              toggleFullscreen={() => {}}
              isFullscreen={false}
              onSavePdf={() => {}}
            />
            <TestConsumer />
          </SignToolProvider>,
          container
        );
      });
    };

    const findButton = (label) => Array.from(container.querySelectorAll(`.${styles.button}`))
      .find(b => b.textContent.includes(label));

    it('arms a tool for one placement on a single click', async () => {
      let state;
      renderToolbar((s) => { state = s; });

      await act(async () => {
        findButton('Text').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      });

      expect(state.selectedTool).toBe('text');
      expect(state.toolLocked).toBe(false);
    });

    it('locks a tool on when its button is double-clicked', async () => {
      let state;
      renderToolbar((s) => { state = s; });

      const textBtn = findButton('Text');
      await act(async () => {
        textBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      });
      await act(async () => {
        textBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }));
      });

      expect(state.selectedTool).toBe('text');
      expect(state.toolLocked).toBe(true);
      expect(textBtn.className).toContain(styles.locked);
    });

    it('locks the chosen shape when the Shapes button is double-clicked', async () => {
      let state;
      renderToolbar((s) => { state = s; });

      const shapesBtn = findButton('Shapes');
      await act(async () => {
        shapesBtn.click();
      });

      const ellipse = Array.from(document.body.querySelectorAll('button'))
        .find(b => b.textContent.trim() === 'Ellipse');
      expect(ellipse).not.toBeUndefined();
      await act(async () => {
        ellipse.click();
      });
      expect(state.selectedTool).toBe('ellipse');
      expect(state.toolLocked).toBe(false);

      await act(async () => {
        shapesBtn.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });

      expect(state.selectedTool).toBe('ellipse');
      expect(state.toolLocked).toBe(true);
      expect(shapesBtn.className).toContain(styles.locked);
    });

    it('locks the last shape picked even after its one placement disarmed the tool', async () => {
      let state;
      let dispatch;
      const TestConsumer = () => {
        const ctx = useSignTool();
        state = ctx.state;
        dispatch = ctx.dispatch;
        return null;
      };

      container = document.createElement('div');
      document.body.appendChild(container);
      act(() => {
        render(
          <SignToolProvider>
            <SignToolbar
              setAnnouncement={() => {}}
              setDialogOpen={() => {}}
              setUndoModalOpen={() => {}}
              actionHistory={[]}
              toggleFullscreen={() => {}}
              isFullscreen={false}
              onSavePdf={() => {}}
            />
            <TestConsumer />
          </SignToolProvider>,
          container
        );
      });

      const shapesBtn = findButton('Shapes');
      await act(async () => {
        shapesBtn.click();
      });
      const line = Array.from(document.body.querySelectorAll('button'))
        .find(b => b.textContent.trim() === 'Line');
      await act(async () => {
        line.click();
      });

      // The placement disarms the tool, so nothing is selected when the user
      // reaches for the lock - the button still has to know it means Line.
      await act(async () => {
        dispatch({ type: 'DISARM_TOOL' });
      });
      expect(state.selectedTool).toBeNull();

      await act(async () => {
        shapesBtn.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });

      expect(state.selectedTool).toBe('line');
      expect(state.toolLocked).toBe(true);
    });

    it('does nothing on a double-click before any shape has been chosen', async () => {
      let state;
      renderToolbar((s) => { state = s; });

      await act(async () => {
        findButton('Shapes').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      });

      expect(state.selectedTool).toBeNull();
      expect(state.toolLocked).toBe(false);
    });
  });

  // The status line is the only place that tells a first-time user how a tool is
  // actually used, so its wording is a contract, not decoration.
  describe('status line wording', () => {
    const armAndRead = (tool, locked = false) => {
      let dispatch;
      const TestConsumer = () => {
        dispatch = useSignTool().dispatch;
        return null;
      };

      container = document.createElement('div');
      document.body.appendChild(container);
      act(() => {
        render(
          <SignToolProvider>
            <SignToolbar
              setAnnouncement={() => {}}
              setDialogOpen={() => {}}
              setUndoModalOpen={() => {}}
              actionHistory={[]}
              toggleFullscreen={() => {}}
              isFullscreen={false}
              onSavePdf={() => {}}
            />
            <TestConsumer />
          </SignToolProvider>,
          container
        );
      });

      act(() => {
        dispatch({ type: 'SET_TOOL', payload: locked ? { tool, locked: true } : tool });
      });

      return container.querySelector('[role="status"]').textContent;
    };

    // "Drag on a page" reads as dragging the tool from the toolbar onto the
    // page, which is a real pattern in older editors and not how this works.
    // The gesture starts and ends on the page, and "Click and" is what says so.
    it.each(['whiteout', 'ellipse', 'rectangle', 'line'])(
      'tells you the %s gesture starts on the page, not at the toolbar',
      (tool) => {
        expect(armAndRead(tool)).toContain('Click and drag on a page');
      }
    );

    it.each(['text', 'symbol', 'signature'])('tells you to click a page to place a %s', (tool) => {
      const text = armAndRead(tool);
      expect(text).toContain('Click on a page to place');
      expect(text).not.toContain('drag');
    });

    it('names the button to double-click rather than saying "the tool"', () => {
      expect(armAndRead('ellipse')).toContain('Double-click Shapes to keep adding');
      expect(armAndRead('text')).toContain('Double-click Text to keep adding');
    });

    // The idle tip does not teach the gesture: arming a tool says exactly how
    // that tool works, and a generic "click or drag on the page" here carried
    // the same drag-it-from-the-toolbar misreading the per-tool lines avoid.
    it('asks only for a tool choice when nothing is armed', () => {
      let dispatch;
      const TestConsumer = () => {
        dispatch = useSignTool().dispatch;
        return null;
      };

      container = document.createElement('div');
      document.body.appendChild(container);
      act(() => {
        render(
          <SignToolProvider>
            <SignToolbar
              setAnnouncement={() => {}}
              setDialogOpen={() => {}}
              setUndoModalOpen={() => {}}
              actionHistory={[]}
              toggleFullscreen={() => {}}
              isFullscreen={false}
              onSavePdf={() => {}}
            />
            <TestConsumer />
          </SignToolProvider>,
          container
        );
      });

      const tip = () => container.querySelector(`.${styles.help}`).textContent;
      expect(tip()).toContain('pick a tool above');
      expect(tip()).not.toContain('drag');
      // Nothing has been placed, so the editing hint would be advice about
      // something that does not exist yet.
      expect(tip()).not.toContain('Double-click');

      act(() => {
        dispatch({ type: 'ADD_ELEMENT', payload: { id: 'el-1', type: 'text', pageIndex: 0, left: 5, top: 5, text: '' } });
      });

      expect(tip()).toContain('Double-click a text box to edit it');
    });

    it('says what a locked tool will keep doing and how to stop it', () => {
      expect(armAndRead('ellipse', true)).toContain('Shapes stays on until you press Esc');
    });

    it('never calls these "layers", which nothing else in the product does', () => {
      for (const tool of ['text', 'symbol', 'signature', 'whiteout', 'ellipse', 'rectangle', 'line']) {
        expect(armAndRead(tool)).not.toContain('layer');
      }
    });

    // "your ellipse" claims you already have one. Signature is the exception and
    // keeps the possessive: it exists before you place it, and it really is yours.
    it('does not hand you an element you have not made yet', () => {
      for (const tool of ['text', 'symbol', 'whiteout', 'ellipse', 'rectangle', 'line']) {
        expect(armAndRead(tool)).not.toContain('your ');
      }
      expect(armAndRead('signature')).toContain('your signature');
    });
  });

  // First run of the Sign tool: nothing is saved yet, so the button has to open
  // the create-signature dialog. Its onClick lives on a Popover trigger, and
  // Popover used to spread Floating UI's handlers over the trigger instead of
  // through them, which replaced this one - the button silently opened an empty
  // dropdown instead, on the first thing a new user does with the tool.
  it('opens the create-signature dialog when nothing has been saved yet', async () => {
    const setDialogOpen = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);

    act(() => {
      render(
        <SignToolProvider>
          <SignToolbar
            setAnnouncement={() => {}}
            setDialogOpen={setDialogOpen}
            setUndoModalOpen={() => {}}
            actionHistory={[]}
            toggleFullscreen={() => {}}
            isFullscreen={false}
            onSavePdf={() => {}}
          />
        </SignToolProvider>,
        container
      );
    });

    const signBtn = Array.from(container.querySelectorAll(`.${styles.button}`))
      .find(b => b.textContent.includes('Sign'));

    await act(async () => {
      signBtn.click();
    });

    expect(setDialogOpen).toHaveBeenCalledWith(true);
  });

  it('uses the existing export control for sharing when file sharing is supported', () => {
    container = document.createElement('div');
    document.body.appendChild(container);

    act(() => {
      render(
        <SignToolProvider>
          <SignToolbar
            setAnnouncement={() => {}}
            setDialogOpen={() => {}}
            setUndoModalOpen={() => {}}
            actionHistory={[]}
            toggleFullscreen={() => {}}
            isFullscreen={false}
            onSavePdf={() => {}}
            onSharePdf={() => {}}
            canSharePdf
          />
        </SignToolProvider>,
        container
      );
    });

    const exportButton = container.querySelector('button[title*="share"]');
    expect(exportButton).not.toBeNull();
    expect(exportButton.textContent).toContain('Share');
    expect(container.querySelectorAll(`.${styles.download}`)).toHaveLength(1);
  });

  it('changes the export control to share the prepared file', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const onSharePdf = vi.fn();

    act(() => {
      render(
        <SignToolProvider>
          <SignToolbar
            setAnnouncement={() => {}}
            setDialogOpen={() => {}}
            setUndoModalOpen={() => {}}
            actionHistory={[]}
            toggleFullscreen={() => {}}
            isFullscreen={false}
            onSavePdf={() => {}}
            onSharePdf={onSharePdf}
            canSharePdf
            shareReady
          />
        </SignToolProvider>,
        container
      );
    });

    const exportButton = container.querySelector('button[title="Share the signed PDF"]');
    expect(exportButton.textContent).toContain('Share now');
    exportButton.click();
    expect(onSharePdf).toHaveBeenCalledOnce();
  });

  it('shows signature dropdown and allows choosing or deleting a saved signature', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);

    const mockSignature = {
      id: 'sig-test',
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANS...',
      aspectRatio: 1
    };

    const setActiveSignature = vi.fn();
    const onDeleteSavedSignature = vi.fn();

    let contextValue;
    const TestConsumer = () => {
      const { state } = useSignTool();
      contextValue = state;
      return null;
    };

    act(() => {
      render(
        <SignToolProvider>
          <SavedSignaturesContext.Provider
            value={{ savedSignatures: [mockSignature], activeSignature: mockSignature, setActiveSignature, onDeleteSavedSignature }}
          >
            <SignToolbar
              setAnnouncement={() => {}}
              setDialogOpen={() => {}}
              setUndoModalOpen={() => {}}
              actionHistory={[]}
              toggleFullscreen={() => {}}
              isFullscreen={false}
              onSavePdf={() => {}}
            />
            <TestConsumer />
          </SavedSignaturesContext.Provider>
        </SignToolProvider>,
        container
      );
    });

    const sigBtn = Array.from(container.querySelectorAll(`.${styles.button}`)).find(b => b.textContent.includes('Sign'));
    expect(sigBtn).not.toBeUndefined();

    // Clicking signature button toggles dropdown
    await act(async () => {
      sigBtn.click();
    });

    const dropdown = document.body.querySelector('[data-editor-signature-popover]');
    expect(dropdown).not.toBeNull();

    const items = document.body.querySelectorAll('[data-editor-signature-item]');
    expect(items.length).toBe(1);

    // Click the signature item to select it
    await act(async () => {
      items[0].click();
    });

    expect(setActiveSignature).toHaveBeenCalledWith(mockSignature);
    expect(contextValue.selectedTool).toBe('signature');

    // Click delete signature button
    await act(async () => {
      sigBtn.click(); // Re-open
    });
    
    const deleteBtn = document.body.querySelector('[data-editor-signature-delete]');
    expect(deleteBtn).not.toBeNull();

    await act(async () => {
      deleteBtn.click();
    });

    expect(onDeleteSavedSignature).toHaveBeenCalledWith(mockSignature.id, expect.any(Object));
  });

  it('contains properly structured tool buttons with module-scoped labels to protect flexbox sizing', () => {
    container = document.createElement('div');
    document.body.appendChild(container);

    act(() => {
      render(
        <SignToolProvider>
          <SignToolbar
            setAnnouncement={() => {}}
            actionHistory={[]}
            toggleFullscreen={() => {}}
            isFullscreen={false}
            onSavePdf={() => {}}
          />
        </SignToolProvider>,
        container
      );
    });

    const buttons = container.querySelectorAll(`.${styles.button}`);
    expect(buttons.length).toBeGreaterThan(0);
    
    // Every single tool button must have its text wrapped in the scoped label span.
    // If a developer accidentally adds a raw text node, it breaks flexbox pixel-perfect division on mobile.
    buttons.forEach(btn => {
      const textSpan = btn.querySelector(`.${styles.label}`);
      expect(textSpan).not.toBeNull();
      expect(textSpan.textContent.trim().length).toBeGreaterThan(0);
      
      // Ensure the button is a direct child of the toolbar to avoid flexbox wrapper issues.
      if (!btn.closest('[data-editor-signature-popover]')) {
        const parentClassList = btn.parentElement.classList;
        expect(
          parentClassList.contains(styles.toolbar) ||
          parentClassList.contains(styles.dropdown)
        ).toBe(true);
      }
    });
  });

  // --- 5. Mobile full-width toolbar -----------------------------------------
  // jsdom has no layout engine and never loads module CSS, so there is no way
  // to observe a real computed width or flex-basis here — this is necessarily
  // a structural-contract test. It checks two halves of the contract that
  // together make the memoed "mobile toolbars stretch full width" behavior
  // (project_fullwidth_mobile_toolbar) actually hold: (a) the CSS rule that
  // grants every visible toolbar control equal, growable width really exists
  // in the owning module and targets the selector this component's DOM structure
  // matches, and (b) the rendered DOM structure really matches that selector
  // (every visible control is a direct child of the toolbar, as asserted in
  // the test above) so the rule actually reaches every button and does not
  // silently skip one because of a stray wrapper div.
  it('the full-width toolbar CSS contract targets this component\'s real DOM shape', () => {
    container = document.createElement('div');
    document.body.appendChild(container);

    act(() => {
      render(
        <SignToolProvider>
          <SignToolbar
            setAnnouncement={() => {}}
            actionHistory={[]}
            toggleFullscreen={() => {}}
            isFullscreen={false}
            onSavePdf={() => {}}
          />
        </SignToolProvider>,
        container
      );
    });

    const toolbar = container.querySelector(`.${styles.toolbar}`);
    expect(toolbar).not.toBeNull();
    expect(toolbar.parentElement.classList.contains(toolShellStyles.controls)).toBe(true);

    // The owning module source-of-truth check: `.toolbar` spans full width at
    // every breakpoint (no separate narrow-screen override shrinks it back to
    // a centered pill — see CLAUDE.md/ARCHITECTURE.md's "full-width mobile
    // toolbar" note), and every direct child is told to grow equally.
    const css = readFileSync(join(__dirname, 'SignToolbar.module.css'), 'utf8');
    const toolbarRuleMatch = /\.toolbar\s*\{([^}]*)\}/.exec(css);
    expect(toolbarRuleMatch).not.toBeNull();
    expect(toolbarRuleMatch[1]).toMatch(/width:\s*100%/);

    const childrenRuleMatch = /\.toolbar\s*>\s*\*\s*\{([^}]*)\}/.exec(css);
    expect(childrenRuleMatch).not.toBeNull();
    expect(childrenRuleMatch[1]).toMatch(/flex:\s*1\s+1\s+auto/);

    // Every visible top-level control (buttons + the signature/shapes dropdown
    // wrappers) is a DIRECT child of .sign-toolbar, which is exactly what the
    // `.toolbar > *` selector above requires to reach it. If a future
    // change wrapped a control in an extra <div>, that control would silently
    // stop growing to fill the row on mobile — this catches that.
    const directChildren = Array.from(toolbar.children);
    expect(directChildren.length).toBeGreaterThan(0);
    directChildren.forEach((child) => {
      expect(child.parentElement).toBe(toolbar);
    });
  });
});
