import { useCallback, useState } from 'preact/hooks';
import { outputNameParts, type OutputNameParts } from '#lib/output/outputNameParts.ts';
import type { IdentityRename } from './ToolShell.tsx';

/**
 * A single-file tool's output name: `<prefix><source's name>` until the person types their own in the
 * identity row (`identity.rename`). Emptying it, or typing the source's own name, goes back to the
 * automatic one; opening a different file does too (a typed name belongs to the File it was typed for).
 * `parts.fileName` is what every export saves as.
 */
export function useOutputNameOverride(file: File | null, { prefix, dedupePrefix = false }: { prefix: string; dedupePrefix?: boolean }) {
  const [typed, setTyped] = useState<{ file: File | null; name: string } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const custom = typed && typed.file === file ? typed.name : null;
  const sourceName = file?.name ?? '';

  const automatic = outputNameParts(sourceName, { prefix, dedupePrefix });
  const parts: OutputNameParts = outputNameParts(sourceName, { prefix, dedupePrefix, custom });
  const rename = useCallback((next: string) => {
    setTyped(next.length > 0 && next !== automatic.base ? { file, name: next } : null);
  }, [file, automatic.base]);

  const identityRename: IdentityRename = { prefix: parts.prefix, name: parts.base, onRename: rename, onEditingChange: setRenaming };
  return { parts, rename, renaming, setRenaming, identityRename, customised: custom !== null };
}
