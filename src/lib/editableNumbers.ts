export function validInteger(value: string, min: number, max = Number.MAX_SAFE_INTEGER): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}
