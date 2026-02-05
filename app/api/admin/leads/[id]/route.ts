import { NextResponse } from "next/server";
import prisma from '@/lib/prisma';
import { LeadStatus } from '@prisma/client';

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Authenticate
  if (!authenticate(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }
  
  try {
    const { id } = await params;
    
    // Parse request body
    const body = await request.json();
    
    // Validate status if provided
    if (body.status !== undefined) {
      const validStatuses = Object.values(LeadStatus);
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
          { status: 400 }
        );
      }
    }
    
    // Validate nextActionAt if provided
    let nextActionAt: Date | null | undefined = undefined;
    if (body.nextActionAt !== undefined) {
      if (body.nextActionAt === null) {
        nextActionAt = null;
      } else if (typeof body.nextActionAt === 'string') {
        try {
          nextActionAt = new Date(body.nextActionAt);
          if (isNaN(nextActionAt.getTime())) {
            return NextResponse.json(
              { error: 'Invalid nextActionAt. Must be a valid ISO 8601 date string' },
              { status: 400 }
            );
          }
        } catch {
          return NextResponse.json(
            { error: 'Invalid nextActionAt. Must be a valid ISO 8601 date string' },
            { status: 400 }
          );
        }
      } else {
        return NextResponse.json(
          { error: 'Invalid nextActionAt. Must be a string or null' },
          { status: 400 }
        );
      }
    }
    
    // Check if lead exists
    const existingLead = await prisma.lead.findUnique({
      where: { id },
    });
    
    if (!existingLead) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404 }
      );
    }
    
    // Build update data
    const updateData: Record<string, unknown> = {};
    
    if (body.status !== undefined) {
      updateData.status = body.status;
    }
    
    if (body.notes !== undefined) {
      updateData.notes = body.notes;
    }
    
    if (body.owner !== undefined) {
      updateData.owner = body.owner;
    }
    
    if (nextActionAt !== undefined) {
      updateData.nextActionAt = nextActionAt;
    }
    
    // Update lead
    const updatedLead = await prisma.lead.update({
      where: { id },
      data: updateData,
      include: {
        source: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        account: {
          select: {
            id: true,
            name: true,
            domain: true,
            website: true,
            country: true,
            industry: true,
          },
        },
      },
    });
    
    // Extract data from JSON fields
    let summary: string | undefined;
    let trigger: string | undefined;
    if (updatedLead.enrichedData && typeof updatedLead.enrichedData === 'object' && updatedLead.enrichedData !== null) {
      const enriched = updatedLead.enrichedData as Record<string, unknown>;
      summary = typeof enriched.summary === 'string' ? enriched.summary : undefined;
      trigger = typeof enriched.trigger === 'string' ? enriched.trigger : undefined;
    }
    
    let probability: number | undefined;
    if (updatedLead.scoreDetails && typeof updatedLead.scoreDetails === 'object' && updatedLead.scoreDetails !== null) {
      const details = updatedLead.scoreDetails as Record<string, unknown>;
      probability = (typeof details.probability_value === 'number' ? details.probability_value : undefined) || 
                    (typeof details.probability === 'number' ? details.probability : undefined);
    }
    
    // Format response
    return NextResponse.json({
      success: true,
      lead: {
        id: updatedLead.id,
        status: updatedLead.status,
        score: updatedLead.score,
        summary,
        trigger,
        probability,
        notes: updatedLead.notes,
        owner: updatedLead.owner,
        nextActionAt: updatedLead.nextActionAt,
        createdAt: updatedLead.createdAt,
        updatedAt: updatedLead.updatedAt,
        source: {
          id: updatedLead.source.id,
          name: updatedLead.source.name,
          type: updatedLead.source.type,
        },
        account: {
          id: updatedLead.account.id,
          name: updatedLead.account.name,
          domain: updatedLead.account.domain,
          website: updatedLead.account.website,
          country: updatedLead.account.country,
          industry: updatedLead.account.industry,
        },
      },
    });
    
  } catch (error) {
    console.error('Update lead error:', error);
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
