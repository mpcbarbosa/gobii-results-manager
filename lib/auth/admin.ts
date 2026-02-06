import { NextRequest } from 'next/server';

/**
 * Authenticate admin request
 * Accepts either Bearer token or session cookie
 */
export function authenticateAdmin(request: NextRequest): boolean {
  // Try Bearer token first
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    const expectedToken = process.env.APP_ADMIN_TOKEN;
    
    if (expectedToken && token === expectedToken) {
      return true;
    }
  }
  
  // Try session cookie
  const sessionCookie = request.cookies.get('gobii_admin_session');
  if (sessionCookie && sessionCookie.value === '1') {
    return true;
  }
  
  return false;
}
