export function normalizeProbability(raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined || Number.isNaN(raw)) return null;

  // If DB/API returns 0..1 => keep. If returns 0..100 => convert.
  let p = raw > 1 ? raw / 100 : raw;

  // Clamp to [0,1]
  p = Math.max(0, Math.min(1, p));

  return p;
}

export function formatProbability(raw: number | null | undefined): string {
  const p = normalizeProbability(raw);
  if (p === null) return "—";
  return `${Math.round(p * 100)}%`;
}
