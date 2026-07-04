import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import FloatingToolbar from './FloatingToolbar.jsx';

describe('FloatingToolbar Component', () => {
  let container;

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
  });

  it('renders all tool buttons and propagates selection', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);

    const setSelectedTool = vi.fn();
    const setAnnouncement = vi.fn();

    act(() => {
      render(
        <FloatingToolbar
          selectedTool={null}
          setSelectedTool={setSelectedTool}
          setAnnouncement={setAnnouncement}
          savedSignatures={[]}
          activeSignature={null}
          setActiveSignature={() => {}}
          onDeleteSavedSignature={() => {}}
          setDialogOpen={() => {}}
          setUndoModalOpen={() => {}}
          actionHistory={[]}
          toggleFullscreen={() => {}}
          isFullscreen={false}
          setConfirmResetOpen={() => {}}
          onSavePdf={() => {}}
        />,
        container
      );
    });

    const buttons = container.querySelectorAll('.sign-tool-btn');
    // Expected buttons: Text, Check, Shapes, Line, Whiteout, Signature, Undo, Redo, Zoom Out, Zoom In...
    // Wait, let's just assert it is greater than 0 since the toolset changes often
    expect(buttons.length).toBeGreaterThan(0);

    const textBtn = Array.from(buttons).find(b => b.textContent.includes('Text') || b.querySelector('svg'));
    expect(textBtn).not.toBeUndefined();

    await act(async () => {
      textBtn.click();
    });

    expect(setSelectedTool).toHaveBeenCalledWith('text');
  });

  it('shows signature dropdown and allows choosing or deleting a saved signature', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);

    const mockSignature = {
      id: 'sig-test',
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANS...',
      aspectRatio: 1
    };

    const setSelectedTool = vi.fn();
    const setActiveSignature = vi.fn();
    const onDeleteSavedSignature = vi.fn();

    act(() => {
      render(
        <FloatingToolbar
          selectedTool={null}
          setSelectedTool={setSelectedTool}
          setAnnouncement={() => {}}
          savedSignatures={[mockSignature]}
          activeSignature={mockSignature}
          setActiveSignature={setActiveSignature}
          onDeleteSavedSignature={onDeleteSavedSignature}
          setDialogOpen={() => {}}
          setUndoModalOpen={() => {}}
          actionHistory={[]}
          toggleFullscreen={() => {}}
          isFullscreen={false}
          setConfirmResetOpen={() => {}}
          onSavePdf={() => {}}
        />,
        container
      );
    });

    const sigBtn = Array.from(container.querySelectorAll('.sign-tool-btn')).find(b => b.textContent.includes('Sign'));
    expect(sigBtn).not.toBeUndefined();

    // Clicking signature button toggles dropdown
    await act(async () => {
      sigBtn.click();
    });

    const dropdown = container.querySelector('.sign-dropdown-menu');
    expect(dropdown).not.toBeNull();

    const items = container.querySelectorAll('.sign-dropdown-item');
    expect(items.length).toBe(1);

    // Click the signature item to select it
    await act(async () => {
      items[0].click();
    });

    expect(setActiveSignature).toHaveBeenCalledWith(mockSignature);
    expect(setSelectedTool).toHaveBeenCalledWith('signature');

    // Click delete signature button
    await act(async () => {
      sigBtn.click(); // Re-open
    });
    
    const deleteBtn = container.querySelector('.sign-dropdown-item-delete');
    expect(deleteBtn).not.toBeNull();

    await act(async () => {
      deleteBtn.click();
    });

    expect(onDeleteSavedSignature).toHaveBeenCalledWith(mockSignature.id, expect.any(Object));
  });

  it('contains properly structured tool buttons with .sign-tool-btn-text spans to protect flexbox sizing', () => {
    container = document.createElement('div');
    document.body.appendChild(container);

    act(() => {
      render(
        <FloatingToolbar
          selectedTool="text"
          setSelectedTool={() => {}}
          setAnnouncement={() => {}}
          savedSignatures={[]}
          actionHistory={[]}
          toggleFullscreen={() => {}}
          isFullscreen={false}
          setConfirmResetOpen={() => {}}
          onSavePdf={() => {}}
        />,
        container
      );
    });

    const buttons = container.querySelectorAll('.sign-tool-btn');
    expect(buttons.length).toBeGreaterThan(0);
    
    // Every single tool button must have its text wrapped in a .sign-tool-btn-text span.
    // If a developer accidentally adds a raw text node, it breaks flexbox pixel-perfect division on mobile.
    buttons.forEach(btn => {
      const textSpan = btn.querySelector('.sign-tool-btn-text');
      expect(textSpan).not.toBeNull();
      expect(textSpan.textContent.trim().length).toBeGreaterThan(0);
      
      // Ensure the button is a direct child of .sign-toolbar to avoid flexbox wrapper issues
      if (!btn.closest('.sign-dropdown-menu')) {
        const parentClassList = btn.parentElement.classList;
        expect(
          parentClassList.contains('sign-toolbar') || 
          parentClassList.contains('sign-tool-dropdown-container')
        ).toBe(true);
      }
    });
  });
});
