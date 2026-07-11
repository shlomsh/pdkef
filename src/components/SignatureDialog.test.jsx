import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import SignatureDialog from './SignatureDialog.jsx';

describe('SignatureDialog Component', () => {
  let container;

  beforeEach(() => {
    // Stub HTMLDialogElement methods since JSDOM might not support them fully in all configurations
    HTMLDialogElement.prototype.showModal = vi.fn(function() { this.open = true; });
    HTMLDialogElement.prototype.close = vi.fn(function() { this.open = false; });

    // Mock HTMLCanvasElement getContext since JSDOM doesn't support canvas out-of-the-box
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      scale: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      rect: vi.fn(),
      fillText: vi.fn(),
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray(4 * 600 * 180) // empty image data
      })),
      putImageData: vi.fn(),
      drawImage: vi.fn(),
      measureText: vi.fn(() => ({ width: 100 })),
      canvas: { width: 100, height: 100 }
    }));

    // Mock toDataURL to prevent JSDOM unimplemented error
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
  });

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    vi.restoreAllMocks();
  });

  it('renders tabs and modal when open', () => {
    container = document.createElement('div');
    document.body.appendChild(container);

    act(() => {
      render(
        <SignatureDialog
          isOpen={true}
          onClose={() => {}}
          onSaveSignature={() => {}}
        />,
        container
      );
    });

    const dialog = container.querySelector('dialog');
    expect(dialog).not.toBeNull();

    const tabBtns = container.querySelectorAll('[data-editor-dialog-tab]');
    expect(tabBtns.length).toBe(3);
    expect(tabBtns[0].textContent).toBe('Draw');
    expect(tabBtns[1].textContent).toBe('Type');
    expect(tabBtns[2].textContent).toBe('Upload');
  });

  it('allows switching to Type mode and typing a signature', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);

    const onSave = vi.fn();

    act(() => {
      render(
        <SignatureDialog
          isOpen={true}
          onClose={() => {}}
          onSaveSignature={onSave}
        />,
        container
      );
    });

    const tabBtns = container.querySelectorAll('[data-editor-dialog-tab]');
    
    // Switch to Type mode
    await act(async () => {
      tabBtns[1].click(); // Type tab
    });

    const typeInput = container.querySelector('[data-editor-signature-input]');
    expect(typeInput).not.toBeNull();

    const saveBtn = container.querySelector('button[data-editor-signature-save]');
    expect(saveBtn.disabled).toBe(true);

    // Type a name
    await act(async () => {
      typeInput.value = 'John Hancock';
      typeInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(saveBtn.disabled).toBe(false);

    await act(async () => {
      saveBtn.click();
    });

    // onSave should have been called
    expect(onSave).toHaveBeenCalled();
  });

  it('triggers onClose when close button is clicked', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);

    const onClose = vi.fn();

    act(() => {
      render(
        <SignatureDialog
          isOpen={true}
          onClose={onClose}
          onSaveSignature={() => {}}
        />,
        container
      );
    });

    const closeBtn = container.querySelector('[data-editor-dialog-close]');
    expect(closeBtn).not.toBeNull();

    await act(async () => {
      closeBtn.click();
    });

    expect(onClose).toHaveBeenCalled();
  });
});
