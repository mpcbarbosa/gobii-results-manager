import { NextRequest } from 'next/server';

/**
 * Validates Bearer token from Authorization header
 * @param request Next.js request object
 * @param tokenEnvVar Name of the environment variable containing the expected token
 * @returns true if token is valid, false otherwise
 */
export function requireBearerToken(
  request: NextRequest,
  tokenEnvVar: string
): boolean {
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  const expectedToken = process.env[tokenEnvVar];
  
  if (!expectedToken) {
    console.error(`${tokenEnvVar} not configured`);
    return false;
  }
  
  return token === expectedToken;
}

/**
 * Get unauthorized response
 */
export function unauthorizedResponse() {
  return Response.json(
    { error: 'Unauthorized' },
    { status: 401 }
  );
}
