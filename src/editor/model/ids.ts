export function createElementId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `el-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
