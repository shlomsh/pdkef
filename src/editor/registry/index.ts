import type { ElementType } from '../../lib/editorModel.ts';
import { ellipseDefinition } from './ellipse.ts';
import { blackoutDefinition } from './blackout.ts';
import { blurDefinition } from './blur.ts';
import { lineDefinition } from './line.ts';
import { rectangleDefinition } from './rectangle.ts';
import { signatureDefinition } from './signature.ts';
import { symbolDefinition } from './symbol.ts';
import { textDefinition } from './text.ts';
import type { ElementDefinition, ElementForType } from './types.ts';
import { whiteoutDefinition } from './whiteout.ts';

export type { BoxResizeInput, BoxResizePatch, CenteredResizeInput, CenteredResizePatch, ElementDefinition, ElementForType, LineResizeInput, LineResizePatch, MinimumWidth, ResizeHandle, SerializeContext, TextPositionInput, TextPositionPatch, TextResizeInput, TextResizePatch } from './types.ts';

const definitions: { [K in ElementType]: ElementDefinition<ElementForType<K>> } = {
  text: textDefinition, rectangle: rectangleDefinition, ellipse: ellipseDefinition,
  line: lineDefinition, symbol: symbolDefinition, signature: signatureDefinition, whiteout: whiteoutDefinition,
  blackout: blackoutDefinition, blur: blurDefinition,
};

export function getElementDefinition<K extends ElementType>(type: K): ElementDefinition<ElementForType<K>> {
  return definitions[type];
}
