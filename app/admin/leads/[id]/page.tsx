'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminTokenGate from '@/components/admin/AdminTokenGate';
import { adminFetch, type LeadItem } from '@/lib/adminApi';
import { formatDate } from '@/lib/date';
import { formatProbability } from '@/lib/format';

// Activity types
const ACTIVITY_TYPES = ['NOTE', 'CALL', 'EMAIL', 'MEETING', 'TASK'] as const;

// Lead statuses
const LEAD_STATUSES = [
  'NEW',
  'QUALIFIED',
  'CONTACTED',
  'IN_PROGRESS',
  'WON',
  'LOST',
  'DISCARDED',
] as const;

// Terminal statuses that cannot be changed
const TERMINAL_STATUSES = ['WON', 'LOST', 'DISCARDED'];

type Activity = {
  id: string;
  type: string;
  title: string;
  notes: string | null;
  createdAt: string;
  dueAt: string | null;
  completedAt: string | null;
  createdBy: {
    id: string;
    name: string;
    email: string;
  };
};

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [lead, setLead] = useState<LeadItem | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  // Activity form state
  const [activityType, setActivityType] = useState<string>('NOTE');
  const [activityTitle, setActivityTitle] = useState('');
  const [activityNotes, setActivityNotes] = useState('');
  const [activityDueAt, setActivityDueAt] = useState('');
  
  // Status form state
  const [selectedStatus, setSelectedStatus] = useState('');
  const [statusReason, setStatusReason] = useState('');
  
  const [leadId, setLeadId] = useState<string>('');
  
  useEffect(() => {
    params.then(p => {
      setLeadId(p.id);
    });
  }, [params]);
  
  useEffect(() => {
    if (leadId) {
      loadLead();
      loadActivities();
    }
  }, [leadId]);
  
  const loadLead = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await adminFetch<{ success: boolean; item?: LeadItem }>(`/api/admin/leads/${leadId}`);
      
      if (!response || !response.success || !response.item) {
        setError('Lead not found or unauthorized');
        setLoading(false);
        return;
      }
      
      const foundLead = response.item;
      
      if (!foundLead.id || !foundLead.account) {
        setError('Invalid lead data');
        setLoading(false);
        return;
      }
      
      setLead(foundLead);
      setSelectedStatus(foundLead.status || 'NEW');
    } catch (err) {
      console.error('Load lead error:', err);
      if (err instanceof Error) {
        if (err.message.includes('404') || err.message.includes('Not found')) {
          setError('Lead not found');
        } else if (err.message.includes('401') || err.message.includes('403') || err.message.includes('Unauthorized')) {
          setError('Unauthorized - please login again');
        } else {
          setError(`Error: ${err.message}`);
        }
      } else {
        setError('Unexpected error loading lead');
      }
    } finally {
      setLoading(false);
    }
  };
  
  const loadActivities = async () => {
    try {
      const response = await adminFetch<{ activities: Activity[] }>(`/api/admin/leads/${leadId}/activities`);
      if (response && response.activities) {
        setActivities(response.activities);
      }
    } catch (err) {
      console.error('Load activities error:', err);
    }
  };
  
  const handleCreateActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!activityTitle.trim()) {
      setError('Activity title is required');
      return;
    }
    
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);
      
      await adminFetch(`/api/admin/leads/${leadId}/activities`, {
        method: 'POST',
        body: JSON.stringify({
          type: activityType,
          title: activityTitle,
          notes: activityNotes || null,
          dueAt: activityDueAt || null,
        }),
      });
      
      // Reset form
      setActivityTitle('');
      setActivityNotes('');
      setActivityDueAt('');
      setActivityType('NOTE');
      
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      
      // Reload activities and lead (status might have changed)
      await loadActivities();
      await loadLead();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create activity');
    } finally {
      setSaving(false);
    }
  };
  
  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedStatus) {
      setError('Status is required');
      return;
    }
    
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);
      
      await adminFetch(`/api/admin/leads/${leadId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: selectedStatus,
          reason: statusReason || null,
        }),
      });
      
      setStatusReason('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      
      // Reload lead
      await loadLead();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setSaving(false);
    }
  };
  
  if (loading) {
    return (
      <AdminTokenGate>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-gray-600">Loading...</div>
        </div>
      </AdminTokenGate>
    );
  }
  
  if (error && !lead) {
    return (
      <AdminTokenGate>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-red-600">{error}</div>
        </div>
      </AdminTokenGate>
    );
  }
  
  if (!lead) return null;
  
  const isTerminalStatus = TERMINAL_STATUSES.includes(lead.status as typeof TERMINAL_STATUSES[number]);
  
  return (
    <AdminTokenGate>
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <button
            onClick={() => router.back()}
            className="mb-4 text-blue-600 hover:text-blue-800"
          >
            ← Back to Leads
          </button>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Lead Info */}
            <div className="lg:col-span-2 space-y-6">
              {/* Lead Info Card */}
              <div className="bg-white rounded-lg shadow p-6">
                <h1 className="text-2xl font-bold mb-4">Lead Detail</h1>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Company</label>
                    <div className="text-lg font-semibold">{lead.account?.name ?? '-'}</div>
                    <div className="text-sm text-gray-600">{lead.account?.domain ?? '-'}</div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Status</label>
                    <div className="text-lg font-semibold">
                      <span className={`inline-block px-3 py-1 rounded-full text-sm ${
                        lead.status === 'NEW' ? 'bg-gray-100 text-gray-800' :
                        lead.status === 'QUALIFIED' ? 'bg-blue-100 text-blue-800' :
                        lead.status === 'CONTACTED' ? 'bg-yellow-100 text-yellow-800' :
                        lead.status === 'IN_PROGRESS' ? 'bg-purple-100 text-purple-800' :
                        lead.status === 'WON' ? 'bg-green-100 text-green-800' :
                        lead.status === 'LOST' ? 'bg-red-100 text-red-800' :
                        lead.status === 'DISCARDED' ? 'bg-gray-100 text-gray-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {lead.status}
                      </span>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Score</label>
                    <div className="text-2xl font-bold text-blue-600">{lead.score_final || '-'}</div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Probability</label>
                    <div className="text-sm">{formatProbability(lead.probability)}</div>
                  </div>
                  
                  <div className="col-span-2">
                    <label className="text-sm font-medium text-gray-500">Summary</label>
                    <div className="text-sm">{lead.summary || '-'}</div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Trigger</label>
                    <div className="text-sm">{lead.trigger || '-'}</div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Seen Count</label>
                    <div className="text-sm font-semibold">{lead.seenCount}x</div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Last Seen</label>
                    <div className="text-sm">{formatDate(lead.lastSeenAt)}</div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-500">Created</label>
                    <div className="text-sm">{formatDate(lead.createdAt)}</div>
                  </div>
                </div>
              </div>
              
              {/* Activity Timeline */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold mb-4">Activity Timeline</h2>
                
                {activities.length === 0 ? (
                  <p className="text-gray-500 text-sm">No activities yet. Create one below to get started.</p>
                ) : (
                  <div className="space-y-4">
                    {activities.map((activity) => (
                      <div key={activity.id} className="border-l-4 border-blue-500 pl-4 py-2">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="inline-block px-2 py-1 text-xs font-semibold rounded bg-blue-100 text-blue-800">
                                {activity.type}
                              </span>
                              <span className="font-semibold">{activity.title}</span>
                            </div>
                            {activity.notes && (
                              <p className="text-sm text-gray-600 mt-1">{activity.notes}</p>
                            )}
                            <div className="text-xs text-gray-500 mt-1">
                              {activity.createdBy.name} • {formatDate(activity.createdAt)}
                              {activity.dueAt && ` • Due: ${formatDate(activity.dueAt)}`}
                              {activity.completedAt && ` • Completed: ${formatDate(activity.completedAt)}`}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            {/* Right Column - Actions */}
            <div className="space-y-6">
              {/* Status Update */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-bold mb-4">Update Status</h2>
                
                {success && (
                  <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-sm mb-4">
                    Saved successfully!
                  </div>
                )}
                
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm mb-4">
                    {error}
                  </div>
                )}
                
                {isTerminalStatus ? (
                  <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-3 py-2 rounded text-sm">
                    This lead is in a terminal status ({lead.status}) and cannot be changed.
                  </div>
                ) : (
                  <form onSubmit={handleUpdateStatus} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Status
                      </label>
                      <select
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                        required
                      >
                        {LEAD_STATUSES.map(status => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Reason (optional)
                      </label>
                      <textarea
                        value={statusReason}
                        onChange={(e) => setStatusReason(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                        placeholder="Why are you changing the status?"
                      />
                    </div>
                    
                    <button
                      type="submit"
                      disabled={saving}
                      className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      {saving ? 'Updating...' : 'Update Status'}
                    </button>
                  </form>
                )}
              </div>
              
              {/* Create Activity */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-bold mb-4">Create Activity</h2>
                
                <form onSubmit={handleCreateActivity} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Type
                    </label>
                    <select
                      value={activityType}
                      onChange={(e) => setActivityType(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      required
                    >
                      {ACTIVITY_TYPES.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Title *
                    </label>
                    <input
                      type="text"
                      value={activityTitle}
                      onChange={(e) => setActivityTitle(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      placeholder="e.g., Called prospect"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Notes
                    </label>
                    <textarea
                      value={activityNotes}
                      onChange={(e) => setActivityNotes(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      placeholder="Add details about this activity..."
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Due Date (optional)
                    </label>
                    <input
                      type="datetime-local"
                      value={activityDueAt}
                      onChange={(e) => setActivityDueAt(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    />
                  </div>
                  
                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {saving ? 'Creating...' : 'Create Activity'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminTokenGate>
  );
}
