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
  status: string;
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
  lastActivityAt?: string;
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

// --- Work Queue ---

export interface WorkQueueItem {
  id: string;
  company: string;
  domain: string | null;
  source: string;
  status: string;
  score_final: number | null;
  ownerId: string | null;
  ownerName: string | null;
  signalLevel: "HIGH" | "MEDIUM" | "LOW";
  temperature: "HOT" | "WARM" | "COLD";
  reasons: string[];
  lastSignalAt: string | null;
  lastSignalCategory: string | null;
  lastSignalAgent: string | null;
  lastSignalSourceUrl: string | null;
  lastSignalConfidence: string | null;
  lastActivityAt: string | null;
  lastHumanActivityAt: string | null;
  sla: {
    status: "OK" | "WARNING" | "OVERDUE";
    label: string;
    hoursElapsed: number;
  };
}

export interface WorkQueueResponse {
  success: boolean;
  count: number;
  items: WorkQueueItem[];
}

export async function fetchWorkQueue(params?: {
  ownerId?: string;
  sort?: "temperature" | "sla";
}): Promise<WorkQueueResponse> {
  const qs = new URLSearchParams();
  if (params?.ownerId) qs.set("ownerId", params.ownerId);
  if (params?.sort) qs.set("sort", params.sort);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return adminFetch<WorkQueueResponse>(`/api/admin/leads/work-queue${suffix}`);
}

// --- Owner assignment ---

export interface AssignOwnerResponse {
  success: boolean;
  lead: {
    id: string;
    ownerId: string | null;
    owner: { id: string; name: string; email: string } | null;
  };
}

export async function assignLeadOwner(
  leadId: string,
  ownerId: string | null,
): Promise<AssignOwnerResponse> {
  return adminFetch<AssignOwnerResponse>(
    `/api/admin/leads/${leadId}/owner`,
    {
      method: "PATCH",
      body: JSON.stringify({ ownerId }),
    },
  );
}

// --- Tasks ---

export interface TaskItem {
  id: string;
  title: string;
  notes: string | null;
  dueAt: string | null;
  createdAt: string;
  createdBy: { id: string; name: string; email: string };
  isOverdue: boolean;
}

export interface TasksResponse {
  success: boolean;
  tasks: TaskItem[];
}

export async function fetchOpenTasks(leadId: string): Promise<TasksResponse> {
  return adminFetch<TasksResponse>(`/api/admin/leads/${leadId}/tasks`);
}

export async function completeTask(
  leadId: string,
  taskId: string,
): Promise<CreateActivityResponse> {
  return adminFetch<CreateActivityResponse>(
    `/api/admin/leads/${leadId}/activities`,
    {
      method: "POST",
      body: JSON.stringify({
        type: "SYSTEM",
        title: "Task completed",
        notes: `Completed task ${taskId}`,
      }),
    },
  );
}

// --- Users list (for owner assignment) ---

export interface UserItem {
  id: string;
  name: string;
  email: string;
  role: string;
}

export async function fetchUsers(): Promise<{ items: UserItem[] }> {
  // Reuse admin sources pattern — we'll call a simple endpoint
  // For now, we'll use a direct query approach
  return adminFetch<{ items: UserItem[] }>("/api/admin/users");
}

// --- Status change ---

export interface StatusChangeResponse {
  lead: {
    id: string;
    status: string;
  };
}

export async function changeLeadStatus(
  id: string,
  status: string,
  reason?: string,
): Promise<StatusChangeResponse> {
  return adminFetch<StatusChangeResponse>(`/api/admin/leads/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, reason }),
  });
}

// --- Create activity ---

export interface CreateActivityPayload {
  type: string;
  title: string;
  notes?: string;
  dueAt?: string;
}

export interface CreateActivityResponse {
  activity: {
    id: string;
    type: string;
    title: string;
    notes: string | null;
    createdAt: string;
  };
  statusChanged: boolean;
}

export async function createActivity(
  leadId: string,
  payload: CreateActivityPayload,
): Promise<CreateActivityResponse> {
  return adminFetch<CreateActivityResponse>(
    `/api/admin/leads/${leadId}/activities`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
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
