// Admin API client helpers

const TOKEN_KEY = 'gobii_admin_token';

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setAdminToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
}

export async function adminFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAdminToken();
  
  const response = await fetch(url, {
    ...options,
    credentials: 'include',  // Send cookies
    cache: 'no-store',       // Avoid auth cache issues
    headers: {
      ...options.headers,
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    // Handle 401/403 - redirect to login
    if (response.status === 401 || response.status === 403) {
      if (typeof window !== 'undefined') {
        window.location.href = '/admin/login';
      }
      throw new Error('Unauthorized');
    }
    
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  
  return response.json();
}

// Types
export interface LeadItem {
  id: string;
  createdAt: string;
  updatedAt: string;
  summary?: string;
  trigger?: string;
  probability?: number;
  score_trigger?: number;
  score_probability?: number;
  score_final?: number;
  source: string;
  accountId: string;
  notes?: string;
  owner?: string;
  nextActionAt?: string;
  seenCount: number;
  lastSeenAt?: string;
  company: {
    name: string;
    domain?: string;
    website?: string;
  };
  contact?: {
    name?: string;
    email?: string;
  } | null;
  account: {
    id: string;
    name: string;
    domain?: string;
  };
}

export interface AdminLeadListResponse {
  success: boolean;
  take: number;
  skip: number;
  count: number;
  items: LeadItem[];
}

export interface LeadFilters {
  take?: number;
  skip?: number;
  accountId?: string;
  status?: string;
  source?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  showDeleted?: boolean;
  sort?: 'updated' | 'hot';
}

export async function listLeads(filters: LeadFilters = {}): Promise<AdminLeadListResponse> {
  const params = new URLSearchParams();
  
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  });
  
  return adminFetch<AdminLeadListResponse>(`/api/admin/leads?${params.toString()}`);
}

export interface PatchLeadBody {
  status?: string;
  notes?: string | null;
  owner?: string | null;
  nextActionAt?: string | null;
}

export interface PatchLeadResponse {
  success: boolean;
  lead: LeadItem;
}

export async function patchLead(id: string, body: PatchLeadBody): Promise<PatchLeadResponse> {
  return adminFetch<PatchLeadResponse>(`/api/admin/leads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function buildExportUrl(filters: LeadFilters = {}): string {
  const params = new URLSearchParams();
  
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  });
  
  const baseUrl = `/api/admin/leads/export.csv?${params.toString()}`;
  
  // Token is added in fetch headers by the component
  return baseUrl;
}
