// The text element's resize-time DOM writes (registry/text.ts's
// `resizeBehavior.writeDOM`) need to find and toggle specific DOM nodes by
// class name mid-gesture (see the gesture golden rule in .claude/rules/editor.md:
// direct DOM writes during pointermove, one committed patch on release). Those
// class names come from a CSS Module owned by the tool (Sign's
// `EditorElement.module.css`), which the editor core may not import directly
// (ARCH-19: `editor` may not import a tool). Sign's entry point registers the
// resolved (possibly hashed) class name strings once, before any resize can
// run; `getTextElementClassNames` throws if nothing has registered yet, the
// same ordering contract `registry/renderers.ts`'s `registerRenderer` uses.
export interface TextElementClassNames {
  textDisplay: string;
  textInput: string;
  textMeasure: string;
  textComb: string;
  textCombCell: string;
  textCombGuide: string;
  textDisplayComb: string;
}

let classNames: TextElementClassNames | null = null;

export function registerTextElementClassNames(names: TextElementClassNames): void {
  classNames = names;
}

export function getTextElementClassNames(): TextElementClassNames {
  if (!classNames) {
    throw new Error(
      'Text element class names have not been registered. A tool must call '
      + 'registerTextElementClassNames(...) from its entry point before resizing a text element.',
    );
  }
  return classNames;
}
