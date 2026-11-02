import { useCallback, useEffect, useState } from 'preact/hooks';
import { outputNameParts, type OutputNameParts } from '#lib/output/outputNameParts.ts';

/**
 * A single-file tool's output name: `<prefix><source's name>` until the person types their own in the
 * identity row (`identity.rename`). Emptying it, or typing the source's own name, goes back to the
 * automatic one; opening a different file does too. `parts.fileName` is what every export saves as.
 */
export function useOutputNameOverride(file: File | null, { prefix, dedupePrefix = false }: { prefix: string; dedupePrefix?: boolean }) {
  const [custom, setCustom] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const sourceName = file?.name ?? '';
  useEffect(() => { setCustom(null); }, [sourceName]);

  const automatic = outputNameParts(sourceName, { prefix, dedupePrefix });
  const parts: OutputNameParts = outputNameParts(sourceName, { prefix, dedupePrefix, custom });
  const rename = useCallback((next: string) => {
    setCustom(next.length > 0 && next !== automatic.base ? next : null);
  }, [automatic.base]);

  return { parts, rename, renaming, setRenaming, customised: custom !== null };
}
