import { requireAdminAuth } from "@/lib/adminAuth";
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
  // Authenticate (supports Bearer token and session cookie)
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return Response.json({ success: false, error: auth.error }, { status: auth.status });
  }
  
  try {
    // Get distinct sources
    const sources = await prisma.source.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        type: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
    
    return Response.json({
      success: true,
      items: sources,
    });
    
  } catch (error) {
    console.error('List sources error:', error);
    
    return Response.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
