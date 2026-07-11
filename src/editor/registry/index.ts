import type { ElementType } from '../../lib/editorModel.ts';
import { ellipseDefinition } from './ellipse.ts';
import { lineDefinition } from './line.ts';
import { rectangleDefinition } from './rectangle.ts';
import { signatureDefinition } from './signature.ts';
import { symbolDefinition } from './symbol.ts';
import { textDefinition } from './text.ts';
import type { ElementDefinition } from './types.ts';
import { whiteoutDefinition } from './whiteout.ts';

export type { BoxResizeInput, BoxResizePatch, ElementDefinition, ResizeHandle } from './types.ts';

const definitions: Record<ElementType, ElementDefinition> = {
  text: textDefinition, rectangle: rectangleDefinition, ellipse: ellipseDefinition,
  line: lineDefinition, symbol: symbolDefinition, signature: signatureDefinition, whiteout: whiteoutDefinition,
};

export function getElementDefinition(type: ElementType): ElementDefinition {
  return definitions[type];
}
