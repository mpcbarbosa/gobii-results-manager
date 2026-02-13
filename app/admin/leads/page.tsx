'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminTokenGate from '@/components/admin/AdminTokenGate';
import { listLeads, adminFetch, type LeadItem, type LeadFilters, getAdminToken } from '@/lib/adminApi';
import { formatDate } from '@/lib/date';

export default function AdminLeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [sources, setSources] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  
  // Filters
  const [filters, setFilters] = useState<LeadFilters>({
    take: 20,
    skip: 0,
    sort: 'updated',
  });
  
  useEffect(() => {
    loadSources();
    loadLeads();
  }, [filters]);
  
  const loadSources = async () => {
    try {
      const response = await adminFetch<{ success: boolean; items: Array<{ id: string; name: string }> }>('/api/admin/sources');
      setSources(response.items);
    } catch (err) {
      console.error('Failed to load sources:', err);
    }
  };
  
  const loadLeads = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await listLeads(filters);
      setLeads(response.items);
      setCount(response.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leads');
    } finally {
      setLoading(false);
    }
  };
  
  const handleExport = async () => {
    try {
      const token = getAdminToken();
      const params = new URLSearchParams();
      
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, String(value));
        }
      });
      
      const url = `/api/admin/leads/export.csv?${params.toString()}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = 'leads_export.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  };
  
  const handlePrevPage = () => {
    setFilters(f => ({ ...f, skip: Math.max(0, (f.skip || 0) - (f.take || 20)) }));
  };
  
  const handleNextPage = () => {
    setFilters(f => ({ ...f, skip: (f.skip || 0) + (f.take || 20) }));
  };
  
  const currentPage = Math.floor((filters.skip || 0) / (filters.take || 20)) + 1;
  const totalPages = Math.ceil(count / (filters.take || 20));
  
  return (
    <AdminTokenGate>
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
            <h1 className="text-3xl font-bold">Leads Inbox</h1>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => router.push('/admin/leads/work-queue')}
                className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              >
                🗂️ Work Queue
              </button>
              <button
                onClick={() => router.push('/admin/leads/my-queue')}
                className="px-4 py-2 text-sm border border-purple-300 text-purple-700 rounded-md hover:bg-purple-50"
              >
                📌 As minhas
              </button>
              <button
                onClick={() => router.push('/admin/tasks')}
                className="px-4 py-2 text-sm border border-green-300 text-green-700 rounded-md hover:bg-green-50"
              >
                📋 Tasks
              </button>
              <button
                onClick={() => router.push('/admin/intelligence/sectors')}
                className="px-4 py-2 text-sm border border-amber-300 text-amber-700 rounded-md hover:bg-amber-50"
              >
                📊 Intelligence
              </button>
              <button
                onClick={() => router.push('/admin/agents')}
                className="px-4 py-2 text-sm border border-cyan-300 text-cyan-700 rounded-md hover:bg-cyan-50"
              >
                🛰 Agents
              </button>
              <button
                onClick={handleExport}
                className="bg-green-600 text-white px-4 py-2 text-sm rounded-md hover:bg-green-700 transition-colors"
              >
                Export CSV
              </button>
            </div>
          </div>
          
          {/* Filters */}
          <div className="bg-white p-4 rounded-lg shadow mb-6 grid grid-cols-1 md:grid-cols-5 gap-4">
            <input
              type="text"
              placeholder="Search..."
              value={filters.q || ''}
              onChange={(e) => setFilters(f => ({ ...f, q: e.target.value, skip: 0 }))}
              className="px-3 py-2 border border-gray-300 rounded-md"
            />
            
            <select
              value={filters.status || ''}
              onChange={(e) => setFilters(f => ({ ...f, status: e.target.value || undefined, skip: 0 }))}
              className="px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">All Status</option>
              <option value="NEW">NEW</option>
              <option value="REVIEWING">REVIEWING</option>
              <option value="QUALIFIED">QUALIFIED</option>
              <option value="DISQUALIFIED">DISQUALIFIED</option>
              <option value="CONTACTED">CONTACTED</option>
            </select>
            
            <select
              value={filters.source || ''}
              onChange={(e) => setFilters(f => ({ ...f, source: e.target.value || undefined, skip: 0 }))}
              className="px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">All Sources</option>
              {sources.map(source => (
                <option key={source.id} value={source.name}>{source.name}</option>
              ))}
            </select>
            
            <select
              value={filters.sort || 'updated'}
              onChange={(e) => setFilters(f => ({ ...f, sort: e.target.value as 'updated' | 'hot', skip: 0 }))}
              className="px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="updated">Recently Updated</option>
              <option value="hot">Hot (Frequent)</option>
            </select>
            
            <button
              onClick={() => setFilters({ take: 20, skip: 0, sort: 'updated' })}
              className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Clear Filters
            </button>
          </div>
          
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}
          
          {loading ? (
            <div className="text-center py-12">
              <div className="text-gray-600">Loading...</div>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Score</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Summary</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Seen</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {leads.map((lead) => (
                      <tr
                        key={lead.id}
                        onClick={() => router.push(`/admin/leads/${lead.id}`)}
                        className="hover:bg-gray-50 cursor-pointer"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-lg font-semibold">{lead.score_final || '-'}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            lead.notes?.includes('QUALIFIED') ? 'bg-green-100 text-green-800' :
                            lead.notes?.includes('DISQUALIFIED') ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {lead.notes || 'NEW'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">{lead.company?.name ?? "-"}</div>
                          <div className="text-sm text-gray-500">{lead.company?.domain ?? "-"}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900 max-w-md truncate">
                            {lead.summary || lead.trigger || '-'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {lead.seenCount}x
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(lead.updatedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination */}
              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  Page {currentPage} of {totalPages} ({count} total)
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handlePrevPage}
                    disabled={filters.skip === 0}
                    className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={handleNextPage}
                    disabled={(filters.skip || 0) + (filters.take || 20) >= count}
                    className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AdminTokenGate>
  );
}
