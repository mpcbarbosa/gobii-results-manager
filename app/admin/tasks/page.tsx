'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import AdminTokenGate from '@/components/admin/AdminTokenGate';
import UserIdentitySelector, { getMyUserId } from '@/components/admin/UserIdentitySelector';
import {
  fetchTasksInbox,
  completeTask,
  rescheduleTask,
  assignLeadOwner,
  type TasksInboxItem,
} from '@/lib/adminApi';
import { formatDate } from '@/lib/date';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BUCKET_COLORS: Record<string, string> = {
  OVERDUE: 'bg-red-100 text-red-800 border-red-200',
  TODAY: 'bg-amber-100 text-amber-800 border-amber-200',
  WEEK: 'bg-blue-100 text-blue-800 border-blue-200',
  LATER: 'bg-gray-100 text-gray-700 border-gray-200',
  NONE: 'bg-gray-50 text-gray-500 border-gray-200',
};

const BUCKET_LABELS: Record<string, string> = {
  OVERDUE: '🔴 Overdue',
  TODAY: '🟡 Today',
  WEEK: '📅 This week',
  LATER: '📆 Later',
  NONE: '— No due',
};

const TEMP_COLORS: Record<string, string> = {
  HOT: 'bg-red-100 text-red-800',
  WARM: 'bg-amber-100 text-amber-800',
  COLD: 'bg-blue-100 text-blue-800',
};

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Reschedule Modal
// ---------------------------------------------------------------------------

function RescheduleModal({ taskId, taskTitle, currentDueAt, onClose, onSaved }: {
  taskId: string;
  taskTitle: string;
  currentDueAt: string | null;
  onClose: () => void;
  onSaved: (newDueAt: string | null) => void;
}) {
  const [dueAt, setDueAt] = useState(() => {
    if (!currentDueAt) return '';
    const d = new Date(currentDueAt);
    return d.toISOString().slice(0, 16);
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const newDueAt = dueAt ? new Date(dueAt).toISOString() : null;
      await rescheduleTask(taskId, newDueAt);
      onSaved(newDueAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reschedule');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4">
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 border-b">
            <h3 className="text-lg font-semibold">Reschedule Task</h3>
            <p className="text-sm text-gray-500 mt-1">{taskTitle}</p>
          </div>
          <div className="px-6 py-4 space-y-3">
            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New due date</label>
              <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => { const d = new Date(Date.now() + 3 * 3600000); setDueAt(d.toISOString().slice(0, 16)); }} className="px-2 py-1 text-xs border rounded hover:bg-gray-50">+3h</button>
              <button type="button" onClick={() => { const d = new Date(Date.now() + 24 * 3600000); setDueAt(d.toISOString().slice(0, 16)); }} className="px-2 py-1 text-xs border rounded hover:bg-gray-50">+24h</button>
              <button type="button" onClick={() => { const d = new Date(Date.now() + 48 * 3600000); setDueAt(d.toISOString().slice(0, 16)); }} className="px-2 py-1 text-xs border rounded hover:bg-gray-50">+48h</button>
            </div>
          </div>
          <div className="px-6 py-3 border-t flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50" disabled={saving}>Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : 'Reschedule'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function TasksInboxPage() {
  const router = useRouter();
  const [items, setItems] = useState<TasksInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBucket, setFilterBucket] = useState<string>('ALL');
  const [filterOwner, setFilterOwner] = useState<string>('ALL');
  const [autoOnly, setAutoOnly] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('ALL');

  // Selection for bulk
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Modals
  const [rescheduleModal, setRescheduleModal] = useState<{ taskId: string; title: string; dueAt: string | null; leadId: string } | null>(null);

  // Identity
  const [myUserId, setMyUserIdState] = useState<string | null>(null);
  useEffect(() => { const s = getMyUserId(); if (s) setMyUserIdState(s); }, []);

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);
  const addToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);
  const dismissToast = useCallback((id: number) => { setToasts((prev) => prev.filter((t) => t.id !== id)); }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchTasksInbox();
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Derived filter options
  const availableOwners = useMemo(() => {
    const set = new Map<string, string>();
    items.forEach((i) => { if (i.lead.ownerId && i.lead.ownerName) set.set(i.lead.ownerId, i.lead.ownerName); });
    return Array.from(set.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => { if (i.task.metaCategory) set.add(i.task.metaCategory); });
    return Array.from(set).sort();
  }, [items]);

  // Filtered
  const filtered = useMemo(() => {
    let result = items;
    if (filterBucket !== 'ALL') result = result.filter((i) => i.dueBucket === filterBucket);
    if (filterOwner !== 'ALL') result = result.filter((i) => i.lead.ownerId === filterOwner);
    if (autoOnly) result = result.filter((i) => i.task.autoGenerated);
    if (filterCategory !== 'ALL') result = result.filter((i) => i.task.metaCategory === filterCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((i) =>
        i.lead.company.toLowerCase().includes(q) ||
        (i.lead.domain && i.lead.domain.toLowerCase().includes(q)) ||
        i.task.title.toLowerCase().includes(q),
      );
    }
    return result;
  }, [items, filterBucket, filterOwner, autoOnly, filterCategory, searchQuery]);

  // Actions
  const handleComplete = async (item: TasksInboxItem) => {
    try {
      await completeTask(item.lead.id, item.task.id);
      setItems((prev) => prev.filter((i) => i.task.id !== item.task.id));
      setSelected((prev) => { const n = new Set(prev); n.delete(item.task.id); return n; });
      addToast(`Completed: ${item.task.title}`, 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  };

  const handleBulkComplete = async () => {
    const toComplete = filtered.filter((i) => selected.has(i.task.id));
    for (const item of toComplete) {
      await handleComplete(item);
    }
    setSelected(new Set());
  };

  const handleRescheduleSaved = (newDueAt: string | null) => {
    if (rescheduleModal) {
      setItems((prev) =>
        prev.map((i) =>
          i.task.id === rescheduleModal.taskId
            ? { ...i, task: { ...i.task, dueAt: newDueAt }, isOverdue: newDueAt ? new Date(newDueAt) < new Date() : false }
            : i,
        ),
      );
      addToast(`Rescheduled: ${rescheduleModal.title}`, 'success');
      setRescheduleModal(null);
    }
  };

  const handleAssignToMe = async (item: TasksInboxItem) => {
    if (!myUserId) { addToast('Select your identity first', 'error'); return; }
    try {
      await assignLeadOwner(item.lead.id, myUserId);
      setItems((prev) => prev.map((i) => i.lead.id === item.lead.id ? { ...i, lead: { ...i.lead, ownerId: myUserId, ownerName: 'Me' } } : i));
      addToast(`${item.lead.company} assigned to you`, 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed', 'error');
    }
  };

  const toggleSelect = (taskId: string) => {
    setSelected((prev) => { const n = new Set(prev); if (n.has(taskId)) n.delete(taskId); else n.add(taskId); return n; });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((i) => i.task.id)));
  };

  // Summary
  const overdueCount = items.filter((i) => i.dueBucket === 'OVERDUE').length;
  const todayCount = items.filter((i) => i.dueBucket === 'TODAY').length;

  return (
    <AdminTokenGate>
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-[1400px] mx-auto">
          <div className="mb-4"><UserIdentitySelector onChange={(id) => setMyUserIdState(id)} /></div>

          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold">Tasks Inbox</h1>
              <p className="text-gray-500 mt-1">All open tasks across leads — execute, reschedule, or reassign</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/admin/leads/work-queue')} className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50">Work Queue</button>
              <button onClick={loadData} disabled={loading} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">{loading ? 'Loading...' : '↻ Refresh'}</button>
            </div>
          </div>

          {/* Summary */}
          {!loading && !error && (
            <div className="flex gap-4 mb-4 text-sm">
              <span className="font-medium text-gray-600">Total: {items.length}</span>
              {overdueCount > 0 && <span className="text-red-600 font-semibold">🔴 Overdue: {overdueCount}</span>}
              {todayCount > 0 && <span className="text-amber-600 font-semibold">🟡 Today: {todayCount}</span>}
            </div>
          )}

          {/* Filters */}
          <div className="bg-white p-4 rounded-lg shadow mb-6 grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
              <input type="text" placeholder="Company / task..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Due</label>
              <select value={filterBucket} onChange={(e) => setFilterBucket(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                <option value="ALL">All</option>
                <option value="OVERDUE">🔴 Overdue</option>
                <option value="TODAY">🟡 Today</option>
                <option value="WEEK">📅 This week</option>
                <option value="LATER">📆 Later</option>
                <option value="NONE">No due date</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Owner</label>
              <select value={filterOwner} onChange={(e) => setFilterOwner(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                <option value="ALL">All</option>
                {availableOwners.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
              <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                <option value="ALL">All</option>
                {availableCategories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 pt-4">
              <input id="auto-only" type="checkbox" checked={autoOnly} onChange={(e) => setAutoOnly(e.target.checked)} className="rounded border-gray-300" />
              <label htmlFor="auto-only" className="text-sm text-gray-700">🧠 Auto only</label>
            </div>
            <div className="pt-4">
              <button onClick={() => { setSearchQuery(''); setFilterBucket('ALL'); setFilterOwner('ALL'); setFilterCategory('ALL'); setAutoOnly(false); }} className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 w-full">Clear</button>
            </div>
          </div>

          {/* Bulk actions */}
          {selected.size > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 mb-4 flex items-center gap-3">
              <span className="text-sm font-medium text-blue-800">{selected.size} selected</span>
              <button onClick={handleBulkComplete} className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700">✓ Complete all</button>
              <button onClick={() => setSelected(new Set())} className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">Deselect</button>
            </div>
          )}

          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">{error}</div>}

          {/* Table */}
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left"><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} className="rounded border-gray-300" /></th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Task</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cat</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Owner</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Temp</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Score</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 9 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-5 w-16 bg-gray-200 rounded" /></td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                      {items.length === 0 ? 'No open tasks found.' : 'No tasks match the current filters.'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => (
                    <tr key={item.task.id} className={`hover:bg-gray-50 ${item.isOverdue ? 'bg-red-50/30' : ''}`}>
                      <td className="px-3 py-3"><input type="checkbox" checked={selected.has(item.task.id)} onChange={() => toggleSelect(item.task.id)} className="rounded border-gray-300" /></td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full border ${BUCKET_COLORS[item.dueBucket]}`}>
                          {BUCKET_LABELS[item.dueBucket]}
                        </span>
                        {item.task.dueAt && <div className="text-[10px] text-gray-500 mt-0.5">{formatDate(item.task.dueAt)}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">{item.lead.company}</div>
                        {item.lead.domain && <div className="text-xs text-gray-500">{item.lead.domain}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {item.task.autoGenerated && <span className="text-amber-600">🧠</span>}
                          <span className="text-sm text-gray-800">{item.task.title}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {item.task.metaCategory ? (
                          <span className="inline-block px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-700 font-medium">{item.task.metaCategory}</span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600">{item.lead.ownerName ?? <span className="text-gray-400">—</span>}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full ${TEMP_COLORS[item.lead.temperature]}`}>
                          {item.lead.temperature}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-800">
                        {item.lead.score_final != null ? Math.round(item.lead.score_final * 10) / 10 : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1 flex-wrap">
                          <button onClick={() => window.open(`/admin/leads/${item.lead.id}`, '_blank')} className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 border border-blue-200">Open</button>
                          <button onClick={() => handleComplete(item)} className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100 border border-green-200">✓ Done</button>
                          <button onClick={() => setRescheduleModal({ taskId: item.task.id, title: item.task.title, dueAt: item.task.dueAt, leadId: item.lead.id })} className="px-2 py-1 text-xs bg-amber-50 text-amber-700 rounded hover:bg-amber-100 border border-amber-200">📅</button>
                          {myUserId && item.lead.ownerId !== myUserId && (
                            <button onClick={() => handleAssignToMe(item)} className="px-2 py-1 text-xs bg-purple-50 text-purple-700 rounded hover:bg-purple-100 border border-purple-200">📌</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!loading && filtered.length > 0 && (
            <div className="mt-3 text-sm text-gray-500">Showing {filtered.length} of {items.length} tasks</div>
          )}
        </div>
      </div>

      {rescheduleModal && (
        <RescheduleModal
          taskId={rescheduleModal.taskId}
          taskTitle={rescheduleModal.title}
          currentDueAt={rescheduleModal.dueAt}
          onClose={() => setRescheduleModal(null)}
          onSaved={handleRescheduleSaved}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </AdminTokenGate>
  );
}
