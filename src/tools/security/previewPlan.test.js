import { describe, expect, it } from 'vitest';
import { planPreview } from './previewPlan.js';

describe('planPreview', () => {
  it('has no preview before a mode is known', () => {
    expect(planPreview({ mode: null, status: 'idle', noPassword: false })).toBeNull();
  });
  it('draws nothing for a locked file', () => {
    expect(planPreview({ mode: 'unlock', status: 'idle', noPassword: false })).toMatchObject({ tag: 'Locked', source: 'none', locked: true });
    expect(planPreview({ mode: 'unlock', status: 'error', noPassword: false })).toMatchObject({ tag: 'Locked', source: 'none' });
  });
  it('draws the input for an owner-restricted file until it is unlocked', () => {
    expect(planPreview({ mode: 'unlock', status: 'processing', noPassword: true })).toMatchObject({ tag: 'Restricted', source: 'input' });
  });
  it('draws the output once unlocked', () => {
    expect(planPreview({ mode: 'unlock', status: 'done', noPassword: false })).toMatchObject({ tag: 'Unlocked', source: 'output' });
  });
  it('draws the input for Protect, before and after', () => {
    expect(planPreview({ mode: 'protect', status: 'idle', noPassword: false })).toMatchObject({ tag: 'Not protected', source: 'input', protectedDone: false });
    expect(planPreview({ mode: 'protect', status: 'done', noPassword: false })).toMatchObject({ tag: 'Protected', source: 'input', protectedDone: true });
  });
});
