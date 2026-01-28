/**
 * Normalize company names for deduplication
 * Converts to lowercase, removes extra spaces, and common suffixes
 */
export function normalizeCompanyName(name: string): string {
  if (!name) return '';
  
  return name
    .toLowerCase()
    .trim()
    // Remove common company suffixes
    .replace(/\b(ltd|limited|inc|incorporated|corp|corporation|llc|sa|lda|unipessoal|s\.a\.|lda\.|unip\.)\b\.?/gi, '')
    // Remove special characters except spaces and hyphens
    .replace(/[^\w\s-]/g, '')
    // Normalize multiple spaces to single space
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize email for deduplication
 */
export function normalizeEmail(email: string): string {
  if (!email) return '';
  return email.toLowerCase().trim();
}

/**
 * Normalize phone number (remove non-digits)
 */
export function normalizePhone(phone: string): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}
