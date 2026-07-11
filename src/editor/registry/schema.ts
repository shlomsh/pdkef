export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function hasNumber(value: Record<string, unknown>, key: string) {
  return typeof value[key] === 'number' && Number.isFinite(value[key]);
}

export function hasString(value: Record<string, unknown>, key: string) {
  return typeof value[key] === 'string';
}

export function hasBoxGeometry(value: Record<string, unknown>) {
  return hasNumber(value, 'left') && hasNumber(value, 'top')
    && hasNumber(value, 'width') && hasNumber(value, 'height');
}
