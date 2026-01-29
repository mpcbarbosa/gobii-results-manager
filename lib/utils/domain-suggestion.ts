import prisma from '@/lib/prisma';

export type Confidence = 'high' | 'medium' | 'low' | null;
export type Source = 'website' | 'email' | null;
export type Mode = 'missing' | 'all' | 'invalid' | 'missing_or_invalid';

export interface DomainSuggestion {
  accountId: string;
  name: string | null;
  currentDomain: string | null;
  suggestedDomain: string | null;
  confidence: Confidence;
  source: Source;
  evidence: {
    website: string | null;
    emailsUsed: string[];
  };
}

const PERSONAL_EMAIL_PROVIDERS = [
  'gmail.com',
  'outlook.com',
  'hotmail.com',
  'yahoo.com',
  'icloud.com',
  'proton.me',
  'protonmail.com',
  'live.com',
];

/**
 * Check if a domain is invalid
 */
export function isInvalidDomain(domain: string | null): boolean {
  if (!domain) return false; // null is not invalid, it's missing
  
  // Contains whitespace
  if (/\s/.test(domain)) return true;
  
  // Does not contain a dot
  if (!domain.includes('.')) return true;
  
  // Starts with "http" or contains "/" (looks like URL)
  if (domain.startsWith('http') || domain.includes('/')) return true;
  
  // Contains "@" (looks like email)
  if (domain.includes('@')) return true;
  
  // Length < 3
  if (domain.length < 3) return true;
  
  // Contains characters outside [a-z0-9.-]
  if (!/^[a-z0-9.-]+$/i.test(domain)) return true;
  
  return false;
}

/**
 * Extract and normalize domain from a URL
 */
function extractDomainFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    let hostname = urlObj.hostname.toLowerCase().trim();
    
    // Strip leading www.
    if (hostname.startsWith('www.')) {
      hostname = hostname.substring(4);
    }
    
    // Reject if contains spaces or no dot
    if (hostname.includes(' ') || !hostname.includes('.')) {
      return null;
    }
    
    return hostname;
  } catch {
    return null;
  }
}

/**
 * Extract domain from email address
 */
function extractDomainFromEmail(email: string): string | null {
  const parts = email.toLowerCase().trim().split('@');
  if (parts.length !== 2) return null;
  
  const domain = parts[1];
  
  // Ignore personal email providers
  if (PERSONAL_EMAIL_PROVIDERS.includes(domain)) {
    return null;
  }
  
  return domain;
}

/**
 * Check if domain matches company name heuristically
 */
function domainMatchesCompanyName(domain: string, companyName: string | null): boolean {
  if (!companyName) return false;
  
  // Extract main part of domain (before first dot)
  const domainMain = domain.split('.')[0].toLowerCase();
  
  // Normalize company name: lowercase, remove common suffixes, special chars
  const normalized = companyName
    .toLowerCase()
    .replace(/\b(lda|ltd|limited|inc|corp|corporation|sa|llc|gmbh)\b/gi, '')
    .replace(/[^a-z0-9]/g, '');
  
  // Check if domain main part is in company name or vice versa
  return normalized.includes(domainMain) || domainMain.includes(normalized);
}

/**
 * Generate domain suggestion for an account
 */
export async function generateDomainSuggestion(accountId: string): Promise<DomainSuggestion> {
  // Fetch account with contacts
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      name: true,
      domain: true,
      website: true,
      contacts: {
        where: { deletedAt: null },
        select: { email: true },
      },
    },
  });
  
  if (!account) {
    throw new Error(`Account ${accountId} not found`);
  }
  
  const result: DomainSuggestion = {
    accountId: account.id,
    name: account.name,
    currentDomain: account.domain,
    suggestedDomain: null,
    confidence: null,
    source: null,
    evidence: {
      website: account.website,
      emailsUsed: [],
    },
  };
  
  // Heuristic A: Extract from website
  if (account.website) {
    const domainFromWebsite = extractDomainFromUrl(account.website);
    if (domainFromWebsite) {
      result.suggestedDomain = domainFromWebsite;
      result.confidence = 'high';
      result.source = 'website';
      return result;
    }
  }
  
  // Heuristic B: Extract from contact emails
  const emailDomains: Record<string, string[]> = {};
  
  for (const contact of account.contacts) {
    if (!contact.email) continue;
    
    const domain = extractDomainFromEmail(contact.email);
    if (!domain) continue;
    
    if (!emailDomains[domain]) {
      emailDomains[domain] = [];
    }
    emailDomains[domain].push(contact.email);
  }
  
  // Find most frequent corporate email domain
  let maxCount = 0;
  let mostFrequentDomain: string | null = null;
  let emailsForDomain: string[] = [];
  
  for (const [domain, emails] of Object.entries(emailDomains)) {
    if (emails.length > maxCount) {
      maxCount = emails.length;
      mostFrequentDomain = domain;
      emailsForDomain = emails;
    }
  }
  
  if (mostFrequentDomain) {
    result.suggestedDomain = mostFrequentDomain;
    result.source = 'email';
    result.evidence.emailsUsed = emailsForDomain;
    
    // Determine confidence
    if (maxCount >= 2 || domainMatchesCompanyName(mostFrequentDomain, account.name)) {
      result.confidence = 'high';
    } else {
      result.confidence = 'medium';
    }
  }
  
  return result;
}

/**
 * Filter suggestions by confidence level
 */
export function meetsConfidenceThreshold(
  confidence: Confidence,
  minConfidence: 'low' | 'medium' | 'high'
): boolean {
  if (!confidence) return false;
  
  const levels = { low: 1, medium: 2, high: 3 };
  return levels[confidence] >= levels[minConfidence];
}
