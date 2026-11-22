import { render, type VNode } from 'preact';
import { act } from 'preact/test-utils';
import { useState } from 'preact/hooks';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { drainPromises } from '../../../test/support/drainPromises.ts';
import SignatureDialog from './SignatureDialog.tsx';

const decode = async (dataUrl: string) => {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let inked = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 8) inked++;
  return { width: image.naturalWidth, height: image.naturalHeight, inked };
};

const closed = (dialog: HTMLDialogElement) => new Promise<void>((done) => dialog.addEventListener('close', () => done(), { once: true }));

describe('SignatureDialog Component', () => {
  let container: HTMLElement | null = null;

  afterEach(() => {
    if (container) {
      act(() => render(null, container!));
      container.remove();
      container = null;
    }
    vi.restoreAllMocks();
  });

  const typeAndSave = async (name: string) => {
    const tabBtns = container!.querySelectorAll<HTMLButtonElement>('[data-editor-dialog-tab]');
    await act(async () => { tabBtns[1].click(); });
    const typeInput = container!.querySelector<HTMLInputElement>('[data-editor-signature-input]')!;
    await act(async () => {
      typeInput.value = name;
      typeInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    container!.querySelector<HTMLButtonElement>('button[data-editor-signature-save]')!.click();
  };

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
        container!
      );
    });

    const dialog = container.querySelector<HTMLDialogElement>('dialog');
    expect(dialog).not.toBeNull();
    expect(dialog!.open).toBe(true);
    expect(dialog!.matches(':modal')).toBe(true);

    const tabBtns = container.querySelectorAll('[data-editor-dialog-tab]');
    expect(tabBtns.length).toBe(3);
    expect(tabBtns[0].textContent).toBe('Draw');
    expect(tabBtns[1].textContent).toBe('Type');
    expect(tabBtns[2].textContent).toBe('Upload');
  });

  it('allows switching to Type mode and typing a signature', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);

    const calls: [string, number][] = [];
    let onSaveDone = () => {};
    const saved = new Promise<void>((done) => { onSaveDone = done; });
    const onSave = (dataUrl: string, aspectRatio: number) => { calls.push([dataUrl, aspectRatio]); onSaveDone(); };

    act(() => {
      render(
        <SignatureDialog
          isOpen={true}
          onClose={() => {}}
          onSaveSignature={onSave}
        />,
        container!
      );
    });

    const tabBtns = container.querySelectorAll('[data-editor-dialog-tab]');
    
    // Switch to Type mode
    await act(async () => {
      (tabBtns[1] as HTMLButtonElement).click(); // Type tab
    });

    const typeInput = container.querySelector<HTMLInputElement>('[data-editor-signature-input]')!;
    expect(typeInput).not.toBeNull();

    const saveBtn = container.querySelector<HTMLButtonElement>('button[data-editor-signature-save]')!;
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
    await saved;

    // onSave should have been called
    expect(calls.length).toBe(1);
    const [dataUrl, aspectRatio] = calls[0];
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    const image = await decode(dataUrl);
    expect(image.inked).toBeGreaterThan(0);
    expect(aspectRatio).toBe(image.height / image.width);
  });

  it('SIGN-08: awaits the resolved font and sizes the canvas from measured text instead of a fixed 600x180 box', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);

    const fontSet = vi.spyOn(CanvasRenderingContext2D.prototype, 'font', 'set');
    const fillText = vi.spyOn(CanvasRenderingContext2D.prototype, 'fillText');
    const fontsLoad = vi.spyOn(document.fonts, 'load');

    const saved: { dataUrl: string; aspectRatio: number }[] = [];
    let arrived = () => {};
    const onSave = (dataUrl: string, aspectRatio: number) => { saved.push({ dataUrl, aspectRatio }); arrived(); };
    const nextSave = () => new Promise<void>((done) => { arrived = done; });
    act(() => {
      render(<SignatureDialog isOpen={true} onClose={() => {}} onSaveSignature={onSave} />, container!);
    });

    const shortName = 'Al';
    const longName = 'A Very Long Typed Signature Name';
    const firstSave = nextSave();
    await typeAndSave(shortName);
    await firstSave;
    fillText.mockClear();
    fontsLoad.mockClear();
    fontSet.mockClear();
    const secondSave = nextSave();
    await typeAndSave(longName);
    await secondSave;

    // The font is awaited before anything is drawn, not requested and drawn
    // in the same tick regardless of whether it had actually loaded.
    expect(fontsLoad).toHaveBeenCalled();
    expect(fontsLoad.mock.calls[0][1]).toBe(longName);
    expect(fontsLoad.mock.calls[0][0]).toMatch(/px .*cursive/);
    expect(fontSet.mock.calls.some(([f]) => f.includes('px') && f.includes('cursive'))).toBe(true);

    // A fixed 600x180 canvas could clip a long name; the actual draw must be
    // sized from the measured text instead of hardcoded to 600.
    const drawIndex = fillText.mock.calls.findLastIndex(([text]) => text === longName);
    expect(drawIndex).toBeGreaterThanOrEqual(0);
    const [, x] = fillText.mock.calls[drawIndex];
    const ctx = fillText.mock.contexts[drawIndex] as CanvasRenderingContext2D;
    const canvasWidth = ctx.canvas.width;
    expect(canvasWidth).toBeGreaterThan(Math.ceil(ctx.measureText(longName).width));
    expect(x).toBeCloseTo(canvasWidth / 2);

    const short = await decode(saved[0].dataUrl);
    const long = await decode(saved[1].dataUrl);
    expect(short.inked).toBeGreaterThan(0);
    expect(long.inked).toBeGreaterThan(0);
    expect(long.width).toBeGreaterThan(short.width);
    expect(saved[1].aspectRatio).toBe(long.height / long.width);
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
        container!
      );
    });

    const closeBtn = container.querySelector<HTMLButtonElement>('[data-editor-dialog-close]');
    expect(closeBtn).not.toBeNull();

    await act(async () => {
      closeBtn!.click();
    });

    expect(onClose).toHaveBeenCalled();
  });

  describe('native dismissal (Escape, light dismiss)', () => {
    let Parent: () => VNode;
    const mountWithState = (onClose: () => void) => {
      container = document.createElement('div');
      document.body.appendChild(container);
      Parent = function Parent() {
        const [open, setOpen] = useState(true);
        return (
          <SignatureDialog
            isOpen={open}
            onClose={() => { onClose(); setOpen(false); }}
            onSaveSignature={() => {}}
          />
        );
      };
      act(() => render(<Parent />, container!));
      return container.querySelector<HTMLDialogElement>('dialog')!;
    };

    it('tells Sign when the dialog closes on its own, and stays closed on the next render', async () => {
      const onClose = vi.fn();
      const dialog = mountWithState(onClose);
      expect(dialog.open).toBe(true);

      // What closedby="any" does on Escape or a tap outside: the browser closes it and fires close.
      const closeEvent = closed(dialog);
      dialog.close();
      await closeEvent;
      await act(async () => { await drainPromises(); });
      expect(dialog.open).toBe(false);
      expect(onClose).toHaveBeenCalledTimes(1);
      // A later parent render must not reopen it.
      act(() => render(<Parent />, container!));
      expect(dialog.open).toBe(false);
    });

    it('does not call onClose twice when the close came from Cancel', async () => {
      const onClose = vi.fn();
      const dialog = mountWithState(onClose);
      const cancel = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Cancel');
      const closeEvent = closed(dialog);
      act(() => cancel!.click());
      await closeEvent;
      await act(async () => { await drainPromises(); });
      expect(dialog.open).toBe(false);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
