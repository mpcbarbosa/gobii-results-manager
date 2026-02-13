'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import AdminTokenGate from '@/components/admin/AdminTokenGate';
import { adminFetch } from '@/lib/adminApi';
import { formatDate } from '@/lib/date';

interface AuditRun {
  id: string;
  agent: string;
  endpoint: string;
  status: string;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  errorMessage: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

interface RunsResponse {
  success: boolean;
  count: number;
  summary: { success: number; skipped: number; error: number };
  items: AuditRun[];
}

const STATUS_COLORS: Record<string, string> = {
  SUCCESS: 'bg-green-100 text-green-800',
  SKIPPED: 'bg-gray-100 text-gray-700',
  ERROR: 'bg-red-100 text-red-800',
};

export default function AgentFeedPage() {
  const router = useRouter();
  const [data, setData] = useState<RunsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchAgent, setSearchAgent] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterEndpoint, setFilterEndpoint] = useState<string>('ALL');
  const [timeWindow, setTimeWindow] = useState<string>('24h');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.set('window', timeWindow);
      params.set('take', '200');
      const res = await adminFetch<RunsResponse>(`/api/admin/agents/runs?${params.toString()}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [timeWindow]);

  useEffect(() => { loadData(); }, [loadData]);

  const endpoints = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.items.map((i) => i.endpoint))].sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let result = data.items;
    if (filterStatus !== 'ALL') result = result.filter((i) => i.status === filterStatus);
    if (filterEndpoint !== 'ALL') result = result.filter((i) => i.endpoint === filterEndpoint);
    if (searchAgent.trim()) {
      const q = searchAgent.trim().toLowerCase();
      result = result.filter((i) => i.agent.toLowerCase().includes(q));
    }
    return result;
  }, [data, filterStatus, filterEndpoint, searchAgent]);

  return (
    <AdminTokenGate>
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-[1400px] mx-auto">
          <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
            <div>
              <h1 className="text-3xl font-bold">🛰 Agent Feed</h1>
              <p className="text-gray-500 mt-1">Observabilidade de integrações dos agentes Gobii</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/admin/leads/work-queue')} className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50">🗂️ Work Queue</button>
              <button onClick={loadData} disabled={loading} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">{loading ? 'Loading...' : '↻ Refresh'}</button>
            </div>
          </div>

          {/* Summary cards */}
          {data && !loading && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-green-700">{data.summary.success}</div>
                <div className="text-sm text-green-600">✓ Success</div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-gray-700">{data.summary.skipped}</div>
                <div className="text-sm text-gray-600">⊘ Skipped</div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-red-700">{data.summary.error}</div>
                <div className="text-sm text-red-600">✕ Error</div>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="bg-white p-4 rounded-lg shadow mb-6 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Agente</label>
              <input type="text" placeholder="Pesquisar agente..." value={searchAgent} onChange={(e) => setSearchAgent(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                <option value="ALL">Todos</option>
                <option value="SUCCESS">✓ Success</option>
                <option value="SKIPPED">⊘ Skipped</option>
                <option value="ERROR">✕ Error</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Endpoint</label>
              <select value={filterEndpoint} onChange={(e) => setFilterEndpoint(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                <option value="ALL">Todos</option>
                {endpoints.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Janela</label>
              <select value={timeWindow} onChange={(e) => setTimeWindow(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                <option value="24h">Últimas 24h</option>
                <option value="7d">Últimos 7 dias</option>
                <option value="30d">Últimos 30 dias</option>
              </select>
            </div>
            <div className="pt-4">
              <button onClick={() => { setSearchAgent(''); setFilterStatus('ALL'); setFilterEndpoint('ALL'); }} className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 w-full">Limpar</button>
            </div>
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">{error}</div>}

          {/* Table */}
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agente</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Endpoint</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">P/C/U/S</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Erro</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Meta</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-5 w-16 bg-gray-200 rounded" /></td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                      Sem registos de ingestão nesta janela temporal.
                    </td>
                  </tr>
                ) : (
                  filtered.map((run) => (
                    <tr key={run.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(run.createdAt)}</td>
                      <td className="px-4 py-3 text-sm text-gray-800 max-w-[200px] truncate" title={run.agent}>{run.agent}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{run.endpoint}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full ${STATUS_COLORS[run.status] ?? 'bg-gray-100'}`}>
                          {run.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700">
                        {run.processed}/{run.created}/{run.updated}/{run.skipped}
                      </td>
                      <td className="px-4 py-3 text-xs text-red-600 max-w-[150px] truncate" title={run.errorMessage ?? ''}>
                        {run.errorMessage ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {run.meta ? (
                          <details>
                            <summary className="cursor-pointer text-blue-600 hover:text-blue-800">Ver</summary>
                            <pre className="mt-1 text-[10px] bg-gray-50 p-2 rounded max-w-[300px] overflow-auto">{JSON.stringify(run.meta, null, 2)}</pre>
                          </details>
                        ) : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!loading && filtered.length > 0 && (
            <div className="mt-3 text-sm text-gray-500">A mostrar {filtered.length} de {data?.count ?? 0} registos</div>
          )}
        </div>
      </div>
    </AdminTokenGate>
  );
}
