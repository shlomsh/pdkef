import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import { SignToolProvider, useSignTool } from '../components/SignToolContext.tsx';
import { useSignaturePlacement } from './useSignaturePlacement.ts';

const DATA_URL = 'data:image/png;base64,AAAA';

let host: HTMLDivElement;
let placement: ReturnType<typeof useSignaturePlacement>;
let tool: ReturnType<typeof useSignTool>;

function Harness() {
  tool = useSignTool();
  placement = useSignaturePlacement({
    dispatch: tool.dispatch,
    elements: tool.state.elements,
    style: {},
    pageWrapperRefs: { current: [] },
    logAction: vi.fn(),
    setAnnouncement: vi.fn(),
    saveNewSignature: (dataUrl, aspectRatio) => ({ signature: { id: 's1', dataUrl, aspectRatio }, persisted: true }),
    setActiveSignature: vi.fn(),
    messages: englishSignMessages,
  });
  return null;
}

function mountArmed(locked: boolean) {
  host = document.createElement('div');
  document.body.append(host);
  act(() => { render(<SignToolProvider><Harness /></SignToolProvider>, host); });
  act(() => { tool.dispatch({ type: 'SET_TOOL', payload: { tool: 'signature', locked } }); });
}

describe('useSignaturePlacement.handleAddSignatureElement', () => {
  afterEach(() => { act(() => { render(null, host); }); host.remove(); });

  it('keeps a locked signature tool armed after the dialog places a signature', () => {
    mountArmed(true);
    act(() => { placement.handleAddSignatureElement(DATA_URL, 2); });
    expect(tool.state.selectedTool).toBe('signature');
    expect(tool.state.toolLocked).toBe(true);
    expect(tool.state.elements).toHaveLength(1);
  });

  it('disarms an unlocked signature tool after the dialog places a signature', () => {
    mountArmed(false);
    act(() => { placement.handleAddSignatureElement(DATA_URL, 2); });
    expect(tool.state.selectedTool).toBeNull();
    expect(tool.state.toolLocked).toBe(false);
  });
});
