'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminTokenGate from '@/components/admin/AdminTokenGate';
import { adminFetch, patchLead, type LeadItem } from '@/lib/adminApi';
import { formatDate, isoToDatetimeLocal, datetimeLocalToIso } from '@/lib/date';

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [lead, setLead] = useState<LeadItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  // Form state
  const [status, setStatus] = useState('');
  const [notes, setNotes] = useState('');
  const [owner, setOwner] = useState('');
  const [nextActionAt, setNextActionAt] = useState('');
  
  const [leadId, setLeadId] = useState<string>('');
  
  useEffect(() => {
    params.then(p => {
      setLeadId(p.id);
    });
  }, [params]);
  
  useEffect(() => {
    if (leadId) {
      loadLead();
    }
  }, [leadId]);
  
  const loadLead = async () => {
    try {
      setLoading(true);
      setError(null);
      // Fetch lead directly by ID
      const response = await adminFetch<{ success: boolean; item: LeadItem }>(`/api/admin/leads/${leadId}`);
      
      if (!response.success || !response.item) {
        setError('Lead not found');
        return;
      }
      
      const foundLead = response.item;
      setLead(foundLead);
      setStatus(foundLead.notes || 'NEW');
      setNotes(foundLead.notes || '');
      setOwner(foundLead.owner || '');
      setNextActionAt(isoToDatetimeLocal(foundLead.nextActionAt));
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('404') || err.message.includes('Not found')) {
          setError('Lead not found');
        } else if (err.message.includes('401') || err.message.includes('403')) {
          setError('Unauthorized');
        } else {
          setError(err.message);
        }
      } else {
        setError('Failed to load lead');
      }
    } finally {
      setLoading(false);
    }
  };
  
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);
      
      await patchLead(leadId, {
        status,
        notes: notes || null,
        owner: owner || null,
        nextActionAt: datetimeLocalToIso(nextActionAt),
      });
      
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      
      // Reload lead
      await loadLead();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
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
  
  return (
    <AdminTokenGate>
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => router.back()}
            className="mb-4 text-blue-600 hover:text-blue-800"
          >
            ← Back to Leads
          </button>
          
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h1 className="text-2xl font-bold mb-4">Lead Detail</h1>
            
            {/* Lead Info */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="text-sm font-medium text-gray-500">Company</label>
                <div className="text-lg font-semibold">{lead.company.name}</div>
                <div className="text-sm text-gray-600">{lead.company.domain || '-'}</div>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-500">Score</label>
                <div className="text-2xl font-bold text-blue-600">{lead.score_final || '-'}</div>
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
                <label className="text-sm font-medium text-gray-500">Probability</label>
                <div className="text-sm">{lead.probability ? (lead.probability * 100).toFixed(0) + '%' : '-'}</div>
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
              
              <div>
                <label className="text-sm font-medium text-gray-500">Updated</label>
                <div className="text-sm">{formatDate(lead.updatedAt)}</div>
              </div>
            </div>
          </div>
          
          {/* Triage Form */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">Triage</h2>
            
            {success && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4">
                Saved successfully!
              </div>
            )}
            
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                {error}
              </div>
            )}
            
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  required
                >
                  <option value="NEW">NEW</option>
                  <option value="REVIEWING">REVIEWING</option>
                  <option value="QUALIFIED">QUALIFIED</option>
                  <option value="DISQUALIFIED">DISQUALIFIED</option>
                  <option value="CONTACTED">CONTACTED</option>
                  <option value="ENGAGED">ENGAGED</option>
                  <option value="NURTURING">NURTURING</option>
                  <option value="READY_HANDOFF">READY_HANDOFF</option>
                  <option value="HANDED_OFF">HANDED_OFF</option>
                  <option value="ARCHIVED">ARCHIVED</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Add notes about this lead..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Owner
                </label>
                <input
                  type="text"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="operator@gobii.com"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Next Action At
                </label>
                <input
                  type="datetime-local"
                  value={nextActionAt}
                  onChange={(e) => setNextActionAt(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              
              <button
                type="submit"
                disabled={saving}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </AdminTokenGate>
  );
}
