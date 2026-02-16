import crypto from 'crypto';

/**
 * Generate a deterministic dedupe key for a lead.
 * Based on: companyKey (domain or normalized name) + country.
 * 
 * trigger and sourceKey are NOT part of the hash — this ensures
 * 1 lead per company per country regardless of trigger or source.
 */
export function generateDedupeKey(input: {
  companyKey: string;
  country?: string | null;
}): string {
  const companyKey = (input.companyKey ?? '').toLowerCase().trim();
  const country = (input.country ?? '').toLowerCase().trim();
  const payload = `${companyKey}|${country}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}
