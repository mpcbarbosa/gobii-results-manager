import { requireAdminAuth } from "@/lib/adminAuth";
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Authentication middleware
function authenticate(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  const expectedToken = process.env.APP_ADMIN_TOKEN;
  
  if (!expectedToken) {
    console.error('APP_ADMIN_TOKEN not configured');
    return false;
  }
  
  return token === expectedToken;
}

export async function GET(request: NextRequest) {
  
  const auth = requireAdminAuth(request);
if (!auth.ok) {
    return Response.json({ success: false, error: auth.error }, { status: auth.status });
  }
// Authenticate
  if (!authenticate(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }
  
  try {
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    
    const take = Math.min(
      parseInt(searchParams.get('take') || '20', 10),
      100
    );
    const skip = parseInt(searchParams.get('skip') || '0', 10);
    const q = searchParams.get('q') || undefined;
    const showDeleted = searchParams.get('showDeleted') === 'true';
    
    // Build where clause
    const where: Record<string, unknown> = {};
    
    // Hide soft-deleted accounts by default
    if (!showDeleted) {
      where.deletedAt = null;
    }
    
    // Add search filter
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' as const } },
        { domain: { contains: q, mode: 'insensitive' as const } },
      ];
    }
    
    // Get total count
    const count = await prisma.account.count({ where });
    
    // Get accounts
    const accounts = await prisma.account.findMany({
      where,
      select: {
        id: true,
        name: true,
        domain: true,
        updatedAt: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take,
      skip,
    });
    
    return NextResponse.json({
      success: true,
      take,
      skip,
      count,
      items: accounts,
    });
    
  } catch (error) {
    console.error('List accounts error:', error);
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}


