import crypto from 'crypto';
import { normalizeCompanyName, normalizeEmail } from './normalize';

/**
 * Generate a deterministic dedupe key for a lead
 * Based on: source key + company name (normalized) + country + contact email (if exists) + trigger
 */
export function generateDedupeKey(params: {
  sourceKey: string;
  companyName: string;
  country?: string;
  contactEmail?: string;
  trigger: string;
}): string {
  const { sourceKey, companyName, country, contactEmail, trigger } = params;
  
  // Normalize inputs
  const normalizedCompany = normalizeCompanyName(companyName);
  const normalizedEmail = contactEmail ? normalizeEmail(contactEmail) : '';
  const normalizedCountry = (country || '').toLowerCase().trim();
  const normalizedTrigger = trigger.toLowerCase().trim();
  
  // Create deterministic string
  const parts = [
    sourceKey,
    normalizedCompany,
    normalizedCountry,
    normalizedEmail,
    normalizedTrigger,
  ].filter(Boolean); // Remove empty strings
  
  const dedupeString = parts.join('::');
  
  // Generate SHA256 hash
  return crypto
    .createHash('sha256')
    .update(dedupeString)
    .digest('hex');
}
