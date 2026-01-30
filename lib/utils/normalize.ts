/**
 * Remove diacritics from string (áàãâ -> a, ç -> c, etc.)
 */
function removeDiacritics(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normalize company names for deduplication
 * Converts to lowercase, removes diacritics, extra spaces, and common suffixes
 */
export function normalizeCompanyName(name: string): string {
  if (!name) return '';
  
  return removeDiacritics(name)
    .toLowerCase()
    .trim()
    // Remove common company suffixes (Portuguese and English)
    .replace(/\b(ltd|limited|inc|incorporated|corp|corporation|llc|sa|lda|unipessoal|unip|s\.a\.|lda\.|unip\.|limitada)\b\.?/gi, '')
    // Remove punctuation and special characters
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
