/**
 * Normalize probability value to [0, 1] range
 * Handles both decimal (0.85) and percentage (85) formats
 */
export function normalizeProbability(raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  
  // If value > 1, treat as percentage and divide by 100
  let normalized = raw > 1 ? raw / 100 : raw;
  
  // Clamp to [0, 1]
  normalized = Math.max(0, Math.min(1, normalized));
  
  return normalized;
}

/**
 * Format probability for display as percentage
 */
export function formatProbability(raw: number | null | undefined): string {
  const normalized = normalizeProbability(raw);
  
  if (normalized === null) return '—';
  
  return `${Math.round(normalized * 100)}%`;
}
