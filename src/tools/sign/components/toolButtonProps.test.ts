import { describe, expect, it } from 'vitest';
import { isShapeTool, toolButtonProps } from './toolButtonProps.ts';

describe('toolButtonProps', () => {
  it('marks a chosen, kept-on tool as locked', () => {
    const props = toolButtonProps(true, true);
    expect(props['data-locked']).toBe(true);
    expect(props.className.split(' ')).toHaveLength(3);
  });

  it('leaves a chosen tool that is not kept on unlocked', () => {
    const props = toolButtonProps(true, false);
    expect(props['data-locked']).toBeUndefined();
    expect(props.className.split(' ')).toHaveLength(2);
  });

  it('never locks a tool that is not chosen', () => {
    const props = toolButtonProps(false, true);
    expect(props['data-locked']).toBeUndefined();
    expect(props.className.split(' ')).toHaveLength(1);
  });
});

describe('isShapeTool', () => {
  it('is true for the tools behind Shapes only', () => {
    expect(isShapeTool('ellipse')).toBe(true);
    expect(isShapeTool('line')).toBe(true);
    expect(isShapeTool('text')).toBe(false);
    expect(isShapeTool(null)).toBe(false);
  });
});
