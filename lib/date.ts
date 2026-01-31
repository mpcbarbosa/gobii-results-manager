/**
 * Convert ISO string to datetime-local format (YYYY-MM-DDTHH:mm)
 */
export function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  
  try {
    const date = new Date(iso);
    // Format: YYYY-MM-DDTHH:mm
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch {
    return '';
  }
}

/**
 * Convert datetime-local format to ISO string
 */
export function datetimeLocalToIso(local: string | null | undefined): string | null {
  if (!local) return null;
  
  try {
    const date = new Date(local);
    return date.toISOString();
  } catch {
    return null;
  }
}

/**
 * Format date for display
 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  
  try {
    const date = new Date(iso);
    return date.toLocaleString('pt-PT', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '-';
  }
}
