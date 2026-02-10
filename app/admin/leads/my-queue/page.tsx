'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import AdminTokenGate from '@/components/admin/AdminTokenGate';
import {
  fetchWorkQueue,
  changeLeadStatus,
  createActivity,
  type WorkQueueItem,
} from '@/lib/adminApi';
import { formatDate } from '@/lib/date';

// ---------------------------------------------------------------------------
// Constants & Helpers (shared with work-queue)
// ---------------------------------------------------------------------------

const LEAD_STATUSES = [
  'NEW', 'QUALIFIED', 'CONTACTED', 'IN_PROGRESS',
  'WON', 'LOST', 'DISCARDED',
] as const;

const TERMINAL_STATUSES = new Set(['WON', 'LOST', 'DISCARDED']);

const TEMP_COLORS: Record<string, string> = {
  HOT: 'bg-red-100 text-red-800 border-red-200',
  WARM: 'bg-amber-100 text-amber-800 border-amber-200',
  COLD: 'bg-blue-100 text-blue-800 border-blue-200',
};

const SLA_COLORS: Record<string, string> = {
  OK: 'bg-green-100 text-green-800 border-green-200',
  WARNING: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  OVERDUE: 'bg-red-100 text-red-800 border-red-200',
};

const SLA_ICONS: Record<string, string> = { OK: '🟢', WARNING: '🟡', OVERDUE: '🔴' };

type Temperature = 'HOT' | 'WARM' | 'COLD';

function TemperatureBadge({ temperature }: { temperature: Temperature }) {
  const icon = temperature === 'HOT' ? '🔥' : temperature === 'WARM' ? '🌤' : '❄️';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full border ${TEMP_COLORS[temperature] ?? ''}`}>
      {icon} {temperature}
    </span>
  );
}

function SLABadge({ sla }: { sla: WorkQueueItem['sla'] }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full border ${SLA_COLORS[sla.status] ?? ''}`}>
      {SLA_ICONS[sla.status]} {sla.label}
    </span>
  );
}

function ReasonsCell({ reasons }: { reasons: string[] }) {
  if (!reasons || reasons.length === 0) return <span className="text-gray-400">-</span>;
  const visible = reasons.slice(0, 2).join('; ');
  const extra = reasons.length > 2 ? ` (+${reasons.length - 2})` : '';
  return (
    <span className="text-sm text-gray-700" title={reasons.join('\n')}>
      {visible}
      {extra && <span className="text-gray-400">{extra}</span>}
    </span>
  );
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i} className="animate-pulse">
          {Array.from({ length: 9 }).map((_, j) => (
            <td key={j} className="px-4 py-3"><div className="h-5 w-16 bg-gray-200 rounded" /></td>
          ))}
        </tr>
      ))}
    </>
  );
}

interface Toast { id: number; message: string; type: 'success' | 'error'; }

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 ${t.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {t.type === 'success' ? '✓' : '✕'} {t.message}
          <button onClick={() => onDismiss(t.id)} className="ml-2 opacity-70 hover:opacity-100">×</button>
        </div>
      ))}
    </div>
  );
}

function AddNoteModal({ leadId, company, onClose, onSaved }: { leadId: string; company: string; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createActivity(leadId, { type: 'NOTE', title: title.trim(), notes: notes.trim() || undefined });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create note');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 border-b"><h3 className="text-lg font-semibold">Add Note — {company}</h3></div>
          <div className="px-6 py-4 space-y-3">
            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title <span className="text-red-500">*</span></label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Follow-up call scheduled" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" required autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional details..." rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="px-6 py-3 border-t flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50" disabled={saving}>Cancel</button>
            <button type="submit" disabled={saving || !title.trim()} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save Note'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function MyQueuePage() {
  const router = useRouter();
  const [items, setItems] = useState<WorkQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTemp, setFilterTemp] = useState<string>('ALL');
  const [signalsOnly, setSignalsOnly] = useState(false);
  const [noteModal, setNoteModal] = useState<{ leadId: string; company: string } | null>(null);
  const [changingStatus, setChangingStatus] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  const addToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // For my-queue, we use a fixed ownerId. Since we don't have real user sessions,
  // we'll load all leads and let the user see their assigned ones.
  // In production, ownerId would come from the session.
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // Sort by SLA for my-queue (OVERDUE first)
      const res = await fetchWorkQueue({ sort: 'sla' });
      // Filter to only leads with an owner (my-queue shows assigned leads)
      setItems(res.items.filter((i) => i.ownerId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load my queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    let result = items;
    if (filterTemp !== 'ALL') result = result.filter((i) => i.temperature === filterTemp);
    if (signalsOnly) result = result.filter((i) => i.lastSignalAt !== null);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((i) => i.company.toLowerCase().includes(q) || (i.domain && i.domain.toLowerCase().includes(q)));
    }
    return result;
  }, [items, filterTemp, signalsOnly, searchQuery]);

  const handleStatusChange = async (item: WorkQueueItem, newStatus: string) => {
    if (newStatus === item.status) return;
    setChangingStatus(item.id);
    try {
      await changeLeadStatus(item.id, newStatus);
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: newStatus } : i)));
      addToast(`${item.company}: status → ${newStatus}`, 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to change status', 'error');
    } finally {
      setChangingStatus(null);
    }
  };

  const handleNoteSaved = () => {
    const company = noteModal?.company ?? 'Lead';
    setNoteModal(null);
    addToast(`Note added to ${company}`, 'success');
    loadData();
  };

  const overdueCount = items.filter((i) => i.sla.status === 'OVERDUE').length;
  const warningCount = items.filter((i) => i.sla.status === 'WARNING').length;

  return (
    <AdminTokenGate>
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-[1400px] mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold">My Work Queue</h1>
              <p className="text-gray-500 mt-1">Your assigned leads — sorted by SLA urgency</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/admin/leads/work-queue')} className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50">← All Leads Queue</button>
              <button onClick={loadData} disabled={loading} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">{loading ? 'Loading...' : '↻ Refresh'}</button>
            </div>
          </div>

          {/* SLA Summary */}
          {!loading && !error && (
            <div className="flex gap-4 mb-4">
              <span className="text-sm font-medium text-gray-600">Total: {items.length}</span>
              {overdueCount > 0 && <span className="text-sm text-red-600 font-semibold">🔴 Overdue: {overdueCount}</span>}
              {warningCount > 0 && <span className="text-sm text-yellow-600 font-semibold">🟡 Warning: {warningCount}</span>}
            </div>
          )}

          {/* Filters */}
          <div className="bg-white p-4 rounded-lg shadow mb-6 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
              <input type="text" placeholder="Company / domain..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Temperature</label>
              <select value={filterTemp} onChange={(e) => setFilterTemp(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                <option value="ALL">All</option>
                <option value="HOT">🔥 HOT</option>
                <option value="WARM">🌤 WARM</option>
                <option value="COLD">❄️ COLD</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-4">
              <input id="signals-only-my" type="checkbox" checked={signalsOnly} onChange={(e) => setSignalsOnly(e.target.checked)} className="rounded border-gray-300" />
              <label htmlFor="signals-only-my" className="text-sm text-gray-700">Signals only</label>
            </div>
            <div className="pt-4">
              <button onClick={() => { setFilterTemp('ALL'); setSignalsOnly(false); setSearchQuery(''); }} className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 w-full">Clear</button>
            </div>
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">{error}</div>}

          {/* Table */}
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SLA</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Temp</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reasons</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Score</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Owner</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Human</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <SkeletonRows count={6} />
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                      {items.length === 0 ? 'No leads assigned to you yet.' : 'No leads match the current filters.'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => (
                    <tr key={item.id} className={`hover:bg-gray-50 ${item.sla.status === 'OVERDUE' ? 'bg-red-50/30' : ''}`}>
                      <td className="px-4 py-3 whitespace-nowrap"><SLABadge sla={item.sla} /></td>
                      <td className="px-4 py-3 whitespace-nowrap"><TemperatureBadge temperature={item.temperature} /></td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">{item.company}</div>
                        {item.domain && <div className="text-xs text-gray-500">{item.domain}</div>}
                      </td>
                      <td className="px-4 py-3 max-w-xs"><ReasonsCell reasons={item.reasons} /></td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-800">
                        {item.score_final != null ? Math.round(item.score_final * 10) / 10 : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {TERMINAL_STATUSES.has(item.status) ? (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700">{item.status}</span>
                        ) : (
                          <select value={item.status} onChange={(e) => handleStatusChange(item, e.target.value)} disabled={changingStatus === item.id} className="text-xs border border-gray-300 rounded px-2 py-1 bg-white disabled:opacity-50">
                            {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600">{item.ownerName ?? '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">{formatDate(item.lastHumanActivityAt)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <button onClick={() => router.push(`/admin/leads/${item.id}`)} className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 border border-blue-200">Open</button>
                          <button onClick={() => setNoteModal({ leadId: item.id, company: item.company })} className="px-2 py-1 text-xs bg-gray-50 text-gray-700 rounded hover:bg-gray-100 border border-gray-200">+ Note</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!loading && filtered.length > 0 && (
            <div className="mt-3 text-sm text-gray-500">Showing {filtered.length} of {items.length} leads</div>
          )}
        </div>
      </div>

      {noteModal && <AddNoteModal leadId={noteModal.leadId} company={noteModal.company} onClose={() => setNoteModal(null)} onSaved={handleNoteSaved} />}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </AdminTokenGate>
  );
}
