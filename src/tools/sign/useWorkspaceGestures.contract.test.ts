import { describe, expect, it } from 'vitest';
import type { WorkspaceGestureOptions } from './useWorkspaceGestures.ts';

const baseOptions = (): WorkspaceGestureOptions => ({
  selectedTool: 'text',
  dispatch: () => {},
  activeSignature: null,
  setTempPlacement: () => {},
  setDialogOpen: () => {},
  placeSignatureAt: () => {},
  logAction: () => {},
  setAnnouncement: () => {},
});

describe('workspace gesture contracts', () => {
  it('accepts only element tools supported by the Sign workspace', () => {
    const options = baseOptions();
    expect(options.selectedTool).toBe('text');

    const invalidOptions: WorkspaceGestureOptions = {
      ...options,
      // @ts-expect-error destructive Redact-only tools cannot be armed in Sign
      selectedTool: 'blackout',
    };
    expect(invalidOptions.selectedTool).toBe('blackout');
  });

  it('requires complete editor elements at the gesture dispatch seam', () => {
    const { dispatch } = baseOptions();
    // @ts-expect-error placement cannot dispatch an element without page identity
    dispatch({ type: 'ADD_ELEMENT', payload: { id: 'text-1', type: 'text', text: '', left: 0, top: 0 } });
    expect(dispatch).toBeTypeOf('function');
  });
});
