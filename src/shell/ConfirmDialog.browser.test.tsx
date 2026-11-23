import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'preact';
import { useState } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { drainPromises } from '../test/support/drainPromises.ts';
import ConfirmDialog from './ConfirmDialog.tsx';

let host: HTMLElement | null = null;
let reopen: () => void = () => undefined;
let cancels = 0;

function Asking() {
  const [open, setOpen] = useState(true);
  reopen = () => setOpen(true);
  return (
    <ConfirmDialog
      open={open}
      titleId="asking-title"
      title="Replace the file?"
      confirmLabel="Replace file"
      onCancel={() => { cancels += 1; setOpen(false); }}
      onConfirm={() => setOpen(false)}
    >
      Your work stays in your recent files.
    </ConfirmDialog>
  );
}

afterEach(() => {
  if (host) render(null, host);
  host?.remove();
  host = null;
  cancels = 0;
});

async function showAsking() {
  host = document.createElement('div');
  document.body.append(host);
  await act(() => render(<Asking />, host!));
  const dialog = host.querySelector<HTMLDialogElement>('dialog')!;
  const cancel = [...dialog.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Cancel')!;
  return { dialog, cancel };
}

describe('ConfirmDialog', () => {
  it('Cancel closes the question once', async () => {
    const { dialog, cancel } = await showAsking();
    const closed = new Promise((resolve) => dialog.addEventListener('close', resolve, { once: true }));
    await act(() => cancel.click());
    await act(async () => { await closed; await drainPromises(); });
    expect(dialog.open).toBe(false);
    expect(cancels).toBe(1);
  });

  it('a dialog the browser closes on its own cancels the question', async () => {
    const { dialog } = await showAsking();
    const closed = new Promise((resolve) => dialog.addEventListener('close', resolve, { once: true }));
    dialog.close();
    await act(async () => { await closed; await drainPromises(); });
    expect(cancels).toBe(1);
  });

  it('a question asked again right after Cancel stays open when the first close lands', async () => {
    const { dialog, cancel } = await showAsking();
    const closed = new Promise((resolve) => dialog.addEventListener('close', resolve, { once: true }));
    await act(() => cancel.click());
    await act(() => reopen());
    expect(dialog.open).toBe(true);
    await act(async () => { await closed; await drainPromises(); });
    expect(dialog.open).toBe(true);
    expect(cancels).toBe(1);
  });
});
