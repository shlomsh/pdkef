import { getTextFontSupport } from '../editor/text/textFontSupport.js';

/**
 * The editor-side preflight state for an export. This is deliberately smaller
 * than an export error: it only answers whether the current elements contain
 * text that needs repair and which element should be reviewed first. PDF
 * writing remains the authority for all runtime/export failures.
 */
export type SignExportReadiness = {
  blocked: boolean;
  blockingFieldCount: number;
  blockingElementIds: string[];
};

export function getSignExportReadiness(elements: any[] = []): SignExportReadiness {
  const blockingElements = elements.filter((element) =>
    element.type === 'text' && getTextFontSupport(element).status === 'incompatible'
  );

  return {
    blocked: blockingElements.length > 0,
    blockingFieldCount: blockingElements.length,
    // The editor assigns every live element an ID. Filtering nevertheless keeps
    // this UI helper safe for partial fixtures and legacy draft data.
    blockingElementIds: blockingElements.flatMap((element) => typeof element.id === 'string' ? [element.id] : []),
  };
}
