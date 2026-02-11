'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import AdminTokenGate from '@/components/admin/AdminTokenGate';
import UserIdentitySelector, { getMyUserId } from '@/components/admin/UserIdentitySelector';
import {
  fetchWorkQueue,
  changeLeadStatus,
  createActivity,
  assignLeadOwner,
  type WorkQueueItem,
} from '@/lib/adminApi';
import { formatDate } from '@/lib/date';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEAD_STATUSES = [
  'NEW',
  'QUALIFIED',
  'CONTACTED',
  'IN_PROGRESS',
  'WON',
  'LOST',
  'DISCARDED',
] as const;

const TERMINAL_STATUSES = new Set(['WON', 'LOST', 'DISCARDED']);

const TEMP_COLORS: Record<string, string> = {
  HOT: 'bg-red-100 text-red-800 border-red-200',
  WARM: 'bg-amber-100 text-amber-800 border-amber-200',
  COLD: 'bg-blue-100 text-blue-800 border-blue-200',
};

const SIGNAL_COLORS: Record<string, string> = {
  HIGH: 'bg-red-50 text-red-700 border-red-200',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200',
  LOW: 'bg-gray-50 text-gray-600 border-gray-200',
};

const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-800',
  QUALIFIED: 'bg-green-100 text-green-800',
  CONTACTED: 'bg-purple-100 text-purple-800',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
  WON: 'bg-emerald-100 text-emerald-800',
  LOST: 'bg-red-100 text-red-800',
  DISCARDED: 'bg-gray-100 text-gray-800',
};

type Temperature = 'HOT' | 'WARM' | 'COLD';

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

function TemperatureBadge({ temperature }: { temperature: Temperature }) {
  const icon = temperature === 'HOT' ? '🔥' : temperature === 'WARM' ? '🌤' : '❄️';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full border ${TEMP_COLORS[temperature] ?? ''}`}
    >
      {icon} {temperature}
    </span>
  );
}

function SignalBadge({ level }: { level: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border ${SIGNAL_COLORS[level] ?? ''}`}
    >
      {level}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700'}`}
    >
      {status}
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

function LastSignalCell({
  category,
  date,
}: {
  category: string | null;
  date: string | null;
}) {
  if (!date) return <span className="text-gray-400">-</span>;
  return (
    <div className="text-sm">
      {category && <span className="font-medium text-gray-800">{category}</span>}
      <div className="text-gray-500 text-xs">{formatDate(date)}</div>
    </div>
  );
}

const CONFIDENCE_COLORS: Record<string, string> = {
  HIGH: 'bg-red-50 text-red-700',
  MEDIUM: 'bg-amber-50 text-amber-700',
  LOW: 'bg-gray-50 text-gray-600',
};

/** Truncate agent name smartly: keep first 20 chars + ellipsis */
function truncateAgent(agent: string | null): string {
  if (!agent) return '-';
  return agent.length > 22 ? agent.slice(0, 20) + '…' : agent;
}

function SignalProofCell({ item }: { item: WorkQueueItem }) {
  const hasProof = item.lastSignalAgent || item.lastSignalCategory || item.lastSignalConfidence;
  if (!hasProof && !item.lastSignalAt) return <span className="text-gray-400">-</span>;

  return (
    <div className="text-xs space-y-0.5">
      {item.lastSignalAgent && (
        <div className="text-gray-700" title={item.lastSignalAgent}>
          🤖 {truncateAgent(item.lastSignalAgent)}
        </div>
      )}
      <div className="flex items-center gap-1 flex-wrap">
        {item.lastSignalCategory && (
          <span className="inline-block px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">
            {item.lastSignalCategory}
          </span>
        )}
        {item.lastSignalConfidence && (
          <span className={`inline-block px-1.5 py-0.5 rounded font-medium ${CONFIDENCE_COLORS[item.lastSignalConfidence] ?? 'bg-gray-50 text-gray-600'}`}>
            {item.lastSignalConfidence}
          </span>
        )}
        {item.lastSignalSourceUrl && (
          <a
            href={item.lastSignalSourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-blue-600 hover:text-blue-800"
            title="Open source"
            onClick={(e) => e.stopPropagation()}
          >
            🔗
          </a>
        )}
      </div>
    </div>
  );
}

// Skeleton rows for loading state
function SkeletonRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i} className="animate-pulse">
          <td className="px-4 py-3"><div className="h-5 w-14 bg-gray-200 rounded" /></td>
          <td className="px-4 py-3"><div className="h-5 w-16 bg-gray-200 rounded" /></td>
          <td className="px-4 py-3">
            <div className="h-4 w-32 bg-gray-200 rounded mb-1" />
            <div className="h-3 w-24 bg-gray-100 rounded" />
          </td>
          <td className="px-4 py-3"><div className="h-5 w-16 bg-gray-200 rounded" /></td>
          <td className="px-4 py-3"><div className="h-4 w-40 bg-gray-200 rounded" /></td>
          <td className="px-4 py-3"><div className="h-4 w-28 bg-gray-200 rounded" /></td>
          <td className="px-4 py-3"><div className="h-4 w-20 bg-gray-200 rounded" /></td>
          <td className="px-4 py-3"><div className="h-5 w-12 bg-gray-200 rounded" /></td>
          <td className="px-4 py-3"><div className="h-5 w-20 bg-gray-200 rounded" /></td>
          <td className="px-4 py-3"><div className="h-5 w-20 bg-gray-200 rounded" /></td>
          <td className="px-4 py-3"><div className="h-5 w-24 bg-gray-200 rounded" /></td>
        </tr>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 ${
            t.type === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          {t.type === 'success' ? '✓' : '✕'} {t.message}
          <button onClick={() => onDismiss(t.id)} className="ml-2 opacity-70 hover:opacity-100">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Note Modal
// ---------------------------------------------------------------------------

function AddNoteModal({
  leadId,
  company,
  onClose,
  onSaved,
}: {
  leadId: string;
  company: string;
  onClose: () => void;
  onSaved: () => void;
}) {
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
      await createActivity(leadId, {
        type: 'NOTE',
        title: title.trim(),
        notes: notes.trim() || undefined,
      });
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
          <div className="px-6 py-4 border-b">
            <h3 className="text-lg font-semibold">Add Note — {company}</h3>
          </div>
          <div className="px-6 py-4 space-y-3">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Follow-up call scheduled"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional details..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="px-6 py-3 border-t flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function WorkQueuePage() {
  const router = useRouter();

  // Data
  const [items, setItems] = useState<WorkQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterTemp, setFilterTemp] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterSource, setFilterSource] = useState<string>('ALL');
  const [signalsOnly, setSignalsOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Quick actions
  const [noteModal, setNoteModal] = useState<{ leadId: string; company: string } | null>(null);
  const [changingStatus, setChangingStatus] = useState<string | null>(null);
  const [myUserId, setMyUserIdState] = useState<string | null>(null);

  // Initialize myUserId from localStorage
  useEffect(() => {
    const stored = getMyUserId();
    if (stored) setMyUserIdState(stored);
  }, []);

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  const addToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Load data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchWorkQueue();
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load work queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Derive unique sources from loaded data
  const availableSources = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      if (item.source) set.add(item.source);
    });
    return Array.from(set).sort();
  }, [items]);

  // Filtered items
  const filtered = useMemo(() => {
    let result = items;

    if (filterTemp !== 'ALL') {
      result = result.filter((i) => i.temperature === filterTemp);
    }
    if (filterStatus !== 'ALL') {
      result = result.filter((i) => i.status === filterStatus);
    }
    if (filterSource !== 'ALL') {
      result = result.filter((i) => i.source === filterSource);
    }
    if (signalsOnly) {
      result = result.filter((i) => i.lastSignalAt !== null);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (i) =>
          i.company.toLowerCase().includes(q) ||
          (i.domain && i.domain.toLowerCase().includes(q)),
      );
    }

    return result;
  }, [items, filterTemp, filterStatus, filterSource, signalsOnly, searchQuery]);

  // Quick action: change status
  const handleStatusChange = async (item: WorkQueueItem, newStatus: string) => {
    if (newStatus === item.status) return;
    setChangingStatus(item.id);
    try {
      await changeLeadStatus(item.id, newStatus);
      // Update local state
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: newStatus } : i)),
      );
      addToast(`${item.company}: status → ${newStatus}`, 'success');
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : 'Failed to change status',
        'error',
      );
    } finally {
      setChangingStatus(null);
    }
  };

  // Quick action: note saved
  const handleNoteSaved = () => {
    const company = noteModal?.company ?? 'Lead';
    setNoteModal(null);
    addToast(`Note added to ${company}`, 'success');
    loadData();
  };

  // Quick action: assign to me
  const handleAssignToMe = async (item: WorkQueueItem) => {
    if (!myUserId) {
      addToast('Select your identity first', 'error');
      return;
    }
    try {
      await assignLeadOwner(item.id, myUserId);
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, ownerId: myUserId, ownerName: 'Me' } : i,
        ),
      );
      addToast(`${item.company} assigned to you`, 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to assign', 'error');
    }
  };

  // Summary counts
  const hotCount = items.filter((i) => i.temperature === 'HOT').length;
  const warmCount = items.filter((i) => i.temperature === 'WARM').length;
  const coldCount = items.filter((i) => i.temperature === 'COLD').length;

  return (
    <AdminTokenGate>
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-[1400px] mx-auto">
          {/* Identity selector */}
          <div className="mb-4">
            <UserIdentitySelector onChange={(id) => setMyUserIdState(id)} />
          </div>

          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold">Work Queue</h1>
              <p className="text-gray-500 mt-1">
                Commercial prioritization — leads ordered by signal strength
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/admin/leads/my-queue')}
                className="px-4 py-2 text-sm border border-purple-300 text-purple-700 rounded-md hover:bg-purple-50"
              >
                My Queue
              </button>
              <button
                onClick={() => router.push('/admin/leads')}
                className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              >
                ← Leads Inbox
              </button>
              <button
                onClick={loadData}
                disabled={loading}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Loading...' : '↻ Refresh'}
              </button>
            </div>
          </div>

          {/* Summary badges */}
          {!loading && !error && (
            <div className="flex gap-4 mb-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-gray-600">Total: {items.length}</span>
              </div>
              <div className="flex items-center gap-1 text-sm">
                <span className="inline-block w-3 h-3 rounded-full bg-red-400" />
                <span>HOT: {hotCount}</span>
              </div>
              <div className="flex items-center gap-1 text-sm">
                <span className="inline-block w-3 h-3 rounded-full bg-amber-400" />
                <span>WARM: {warmCount}</span>
              </div>
              <div className="flex items-center gap-1 text-sm">
                <span className="inline-block w-3 h-3 rounded-full bg-blue-400" />
                <span>COLD: {coldCount}</span>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="bg-white p-4 rounded-lg shadow mb-6 grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
              <input
                type="text"
                placeholder="Company / domain..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Temperature</label>
              <select
                value={filterTemp}
                onChange={(e) => setFilterTemp(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="ALL">All</option>
                <option value="HOT">🔥 HOT</option>
                <option value="WARM">🌤 WARM</option>
                <option value="COLD">❄️ COLD</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="ALL">All</option>
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
              <select
                value={filterSource}
                onChange={(e) => setFilterSource(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="ALL">All</option>
                {availableSources.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 pt-4">
              <input
                id="signals-only"
                type="checkbox"
                checked={signalsOnly}
                onChange={(e) => setSignalsOnly(e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="signals-only" className="text-sm text-gray-700">
                Signals only
              </label>
            </div>

            <div className="pt-4">
              <button
                onClick={() => {
                  setFilterTemp('ALL');
                  setFilterStatus('ALL');
                  setFilterSource('ALL');
                  setSignalsOnly(false);
                  setSearchQuery('');
                }}
                className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 w-full"
              >
                Clear Filters
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          {/* Table */}
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Temp</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Signal</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reasons</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Signal Proof</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Signal</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Score</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SLA</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Owner</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <SkeletonRows count={8} />
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-12 text-center text-gray-500">
                      {items.length === 0
                        ? 'No leads in the work queue. All leads may be in terminal status or none exist.'
                        : 'No leads match the current filters.'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      {/* Temperature */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <TemperatureBadge temperature={item.temperature} />
                      </td>

                      {/* Signal Level */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <SignalBadge level={item.signalLevel} />
                      </td>

                      {/* Company */}
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">{item.company}</div>
                        {item.domain && (
                          <div className="text-xs text-gray-500">{item.domain}</div>
                        )}
                      </td>

                      {/* Source */}
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {item.source}
                      </td>

                      {/* Reasons */}
                      <td className="px-4 py-3 max-w-xs">
                        <ReasonsCell reasons={item.reasons} />
                      </td>

                      {/* Signal Proof */}
                      <td className="px-4 py-3">
                        <SignalProofCell item={item} />
                      </td>

                      {/* Last Signal */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <LastSignalCell
                          category={item.lastSignalCategory}
                          date={item.lastSignalAt}
                        />
                      </td>

                      {/* Score */}
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-800">
                        {item.score_final != null
                          ? Math.round(item.score_final * 10) / 10
                          : '-'}
                      </td>

                      {/* Status (dropdown) */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {TERMINAL_STATUSES.has(item.status) ? (
                          <StatusBadge status={item.status} />
                        ) : (
                          <select
                            value={item.status}
                            onChange={(e) => handleStatusChange(item, e.target.value)}
                            disabled={changingStatus === item.id}
                            className="text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                          >
                            {LEAD_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>

                      {/* SLA */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full border ${
                          item.sla.status === 'OVERDUE' ? 'bg-red-100 text-red-800 border-red-200' :
                          item.sla.status === 'WARNING' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                          'bg-green-100 text-green-800 border-green-200'
                        }`}>
                          {item.sla.status === 'OVERDUE' ? '🔴' : item.sla.status === 'WARNING' ? '🟡' : '🟢'} {item.sla.label}
                        </span>
                      </td>

                      {/* Owner */}
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600">
                        {item.ownerName ?? <span className="text-gray-400">—</span>}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => router.push(`/admin/leads/${item.id}`)}
                            className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 border border-blue-200"
                            title="Open lead detail"
                          >
                            Open
                          </button>
                          <button
                            onClick={() =>
                              setNoteModal({ leadId: item.id, company: item.company })
                            }
                            className="px-2 py-1 text-xs bg-gray-50 text-gray-700 rounded hover:bg-gray-100 border border-gray-200"
                            title="Add a note"
                          >
                            + Note
                          </button>
                          {myUserId && item.ownerId !== myUserId && (
                            <button
                              onClick={() => handleAssignToMe(item)}
                              className="px-2 py-1 text-xs bg-purple-50 text-purple-700 rounded hover:bg-purple-100 border border-purple-200"
                              title="Assign to me"
                            >
                              📌 Me
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer count */}
          {!loading && filtered.length > 0 && (
            <div className="mt-3 text-sm text-gray-500">
              Showing {filtered.length} of {items.length} leads
            </div>
          )}
        </div>
      </div>

      {/* Note Modal */}
      {noteModal && (
        <AddNoteModal
          leadId={noteModal.leadId}
          company={noteModal.company}
          onClose={() => setNoteModal(null)}
          onSaved={handleNoteSaved}
        />
      )}

      {/* Toasts */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </AdminTokenGate>
  );
}
