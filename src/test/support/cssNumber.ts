export function cssNumber(value: number): string {
  return String(Number(value.toPrecision(6)));
}
