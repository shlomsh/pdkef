// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import SignatureDialog from './SignatureDialog.tsx';

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

  it('SIGN-08: awaits the resolved font and sizes the canvas from measured text instead of a fixed 600x180 box', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);

    // A richer getContext mock than the default one in beforeEach: tracks
    // the font string ctx.font is set to and the canvas dimensions in force
    // at fillText time, so the test can tell dynamic sizing apart from the
    // old fixed 600x180 canvas.
    const fontAssignments: string[] = [];
    const fillTextCalls: { text: string; x: number; y: number; canvasWidth: number; canvasHeight: number }[] = [];
    HTMLCanvasElement.prototype.getContext = vi.fn(function (this: HTMLCanvasElement) {
      const canvasEl = this;
      return {
        scale: vi.fn(),
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        rect: vi.fn(),
        set font(value: string) { fontAssignments.push(value); },
        get font() { return fontAssignments.at(-1) ?? ''; },
        textAlign: '',
        textBaseline: '',
        fillStyle: '',
        fillText: vi.fn((text: string, x: number, y: number) => {
          fillTextCalls.push({ text, x, y, canvasWidth: canvasEl.width, canvasHeight: canvasEl.height });
        }),
        // A longer string measures wider - the same relationship a real
        // canvas context has - so a long typed name produces a wider canvas
        // than a short one instead of both clipping into the same fixed box.
        measureText: vi.fn((text: string) => ({ width: text.length * 20 })),
        getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4 * 4000 * 200) })),
        putImageData: vi.fn(),
        drawImage: vi.fn(),
        canvas: canvasEl,
      };
    }) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');

    const fontsLoad = vi.fn(() => Promise.resolve([]));
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load: fontsLoad } });

    const onSave = vi.fn();
    act(() => {
      render(<SignatureDialog isOpen={true} onClose={() => {}} onSaveSignature={onSave} />, container);
    });

    const tabBtns = container.querySelectorAll('[data-editor-dialog-tab]');
    await act(async () => { tabBtns[1].click(); });

    const typeInput = container.querySelector('[data-editor-signature-input]');
    const longName = 'A Very Long Typed Signature Name';
    await act(async () => {
      typeInput.value = longName;
      typeInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const saveBtn = container.querySelector('button[data-editor-signature-save]');
    await act(async () => {
      saveBtn.click();
      // Flush the microtasks handleSaveSignature awaits (document.fonts.load).
      await Promise.resolve();
      await Promise.resolve();
    });

    // The font is awaited before anything is drawn, not requested and drawn
    // in the same tick regardless of whether it had actually loaded.
    expect(fontsLoad).toHaveBeenCalled();
    expect(fontsLoad.mock.calls[0][1]).toBe(longName);
    expect(fontAssignments.some((f) => f.includes('px') && f.includes('cursive'))).toBe(true);

    // A fixed 600x180 canvas could clip a long name; the actual draw must be
    // sized from the measured text instead of hardcoded to 600.
    const draw = fillTextCalls.at(-1);
    expect(draw).toBeDefined();
    expect(draw!.canvasWidth).toBeGreaterThan(longName.length * 20);
    expect(draw!.x).toBeCloseTo(draw!.canvasWidth / 2);

    delete (document as any).fonts;
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
