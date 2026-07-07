import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import SignToolbar from './SignToolbar.jsx';
import { SignToolProvider, useSignTool } from './SignToolContext.jsx';

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
          />
          <TestConsumer />
        </SignToolProvider>,
        container
      );
    });

    const buttons = container.querySelectorAll('.sign-tool-btn');
    expect(buttons.length).toBeGreaterThan(0);

    const textBtn = Array.from(buttons).find(b => b.textContent.includes('Text') || b.querySelector('svg'));
    expect(textBtn).not.toBeUndefined();

    await act(async () => {
      textBtn.click();
    });

    expect(contextValue.selectedTool).toBe('text');
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
          <SignToolbar
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
          />
          <TestConsumer />
        </SignToolProvider>,
        container
      );
    });

    const sigBtn = Array.from(container.querySelectorAll('.sign-tool-btn')).find(b => b.textContent.includes('Sign'));
    expect(sigBtn).not.toBeUndefined();

    // Clicking signature button toggles dropdown
    await act(async () => {
      sigBtn.click();
    });

    const dropdown = document.body.querySelector('.sign-popover');
    expect(dropdown).not.toBeNull();

    const items = document.body.querySelectorAll('.sign-dropdown-item');
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
    
    const deleteBtn = document.body.querySelector('.sign-dropdown-item-delete');
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
        <SignToolProvider>
          <SignToolbar
            setAnnouncement={() => {}}
            savedSignatures={[]}
            actionHistory={[]}
            toggleFullscreen={() => {}}
            isFullscreen={false}
            setConfirmResetOpen={() => {}}
            onSavePdf={() => {}}
          />
        </SignToolProvider>,
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
      if (!btn.closest('.sign-popover')) {
        const parentClassList = btn.parentElement.classList;
        expect(
          parentClassList.contains('sign-toolbar') || 
          parentClassList.contains('sign-tool-dropdown-container')
        ).toBe(true);
      }
    });
  });
});
