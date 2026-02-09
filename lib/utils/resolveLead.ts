import prisma from '@/lib/prisma';

/**
 * Resolve a lead by company domain or name
 * 
 * Resolution order:
 * 1. By domain (normalized, lowercase)
 * 2. By name (case-insensitive via account)
 * 
 * @param company - Company information with optional domain and name
 * @returns Lead if found, null otherwise
 */
export async function resolveLead(company: {
  domain?: string;
  name?: string;
}) {
  // Try to resolve by domain first (most reliable)
  if (company.domain) {
    const normalizedDomain = company.domain.toLowerCase().trim();
    
    const lead = await prisma.lead.findFirst({
      where: {
        account: {
          domain: normalizedDomain,
        },
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'desc', // Get most recent lead if multiple exist
      },
    });
    
    if (lead) {
      return lead;
    }
  }
  
  // Fallback to name resolution (case-insensitive)
  if (company.name) {
    const normalizedName = company.name.toLowerCase().trim();
    
    const lead = await prisma.lead.findFirst({
      where: {
        account: {
          nameNormalized: normalizedName,
        },
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'desc', // Get most recent lead if multiple exist
      },
    });
    
    if (lead) {
      return lead;
    }
  }
  
  return null;
}
