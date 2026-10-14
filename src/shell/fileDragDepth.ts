// Pure helpers for telling file drags from other drags and counting nested
// dragenter/dragleave pairs (every child element fires its own pair).

export type DragDepthEvent = 'enter' | 'leave' | 'drop' | 'reset';

export function isFileDrag(dataTransfer: DataTransfer | null): boolean {
  const types = dataTransfer?.types as
    | ArrayLike<string>
    | { contains?: (s: string) => boolean }
    | undefined;
  if (!types) return false;
  if (Array.isArray(types)) return types.includes('Files');
  const list = types as { contains?: (s: string) => boolean };
  if (typeof list.contains === 'function') return list.contains('Files');
  return Array.prototype.includes.call(types, 'Files');
}

export function nextDragDepth(depth: number, kind: DragDepthEvent): number {
  if (kind === 'enter') return depth + 1;
  if (kind === 'leave') return Math.max(0, depth - 1);
  return 0;
}

export function isDragging(depth: number): boolean {
  return depth > 0;
}
