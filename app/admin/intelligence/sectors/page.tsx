'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import AdminTokenGate from '@/components/admin/AdminTokenGate';
import { adminFetch } from '@/lib/adminApi';
import { formatDate } from '@/lib/date';

interface SectorItem {
  id: string;
  sector: string;
  growth: string | null;
  investmentIntensity: string | null;
  maturity: string | null;
  erpProbability: string | null;
  source: string | null;
  detectedAt: string;
  createdAt: string;
}

const ERP_COLORS: Record<string, string> = {
  HIGH: 'bg-red-100 text-red-800',
  MEDIUM: 'bg-amber-100 text-amber-800',
  LOW: 'bg-gray-100 text-gray-700',
};

function ErpBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-gray-400">—</span>;
  const upper = value.toUpperCase();
  const label = upper === 'HIGH' ? 'Alta' : upper === 'MEDIUM' ? 'Média' : upper === 'LOW' ? 'Baixa' : value;
  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full ${ERP_COLORS[upper] ?? 'bg-gray-100 text-gray-700'}`}>
      {label}
    </span>
  );
}

function isUrl(s: string | null): boolean {
  if (!s) return false;
  return s.startsWith('http://') || s.startsWith('https://');
}

export default function SectorIntelligencePage() {
  const router = useRouter();
  const [items, setItems] = useState<SectorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterErp, setFilterErp] = useState<string>('ALL');
  const [highOnly, setHighOnly] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await adminFetch<{ success: boolean; items: SectorItem[] }>('/api/admin/intelligence/sectors');
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sectors');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    let result = items;
    if (highOnly) {
      result = result.filter((i) => i.erpProbability?.toUpperCase() === 'HIGH');
    } else if (filterErp !== 'ALL') {
      result = result.filter((i) => i.erpProbability?.toUpperCase() === filterErp);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((i) =>
        i.sector.toLowerCase().includes(q) ||
        (i.source && i.source.toLowerCase().includes(q)),
      );
    }
    // Sort: HIGH first → most recent → sector asc
    result = [...result].sort((a, b) => {
      const erpOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      const aErp = erpOrder[a.erpProbability?.toUpperCase() ?? ''] ?? 3;
      const bErp = erpOrder[b.erpProbability?.toUpperCase() ?? ''] ?? 3;
      if (aErp !== bErp) return aErp - bErp;
      const aDate = new Date(a.detectedAt).getTime();
      const bDate = new Date(b.detectedAt).getTime();
      if (aDate !== bDate) return bDate - aDate;
      return a.sector.localeCompare(b.sector);
    });
    return result;
  }, [items, filterErp, highOnly, searchQuery]);

  // Top 5 high probability sectors
  const top5 = useMemo(() => {
    return items
      .filter((i) => i.erpProbability?.toUpperCase() === 'HIGH')
      .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())
      .slice(0, 5);
  }, [items]);

  return (
    <AdminTokenGate>
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-[1400px] mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
            <div>
              <h1 className="text-3xl font-bold">📊 Sector Intelligence</h1>
              <p className="text-gray-500 mt-1">Análise macro de setores — probabilidade ERP e investimento</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/admin/leads/work-queue')} className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50">🗂️ Work Queue</button>
              <button onClick={() => router.push('/admin/tasks')} className="px-4 py-2 text-sm border border-green-300 text-green-700 rounded-md hover:bg-green-50">📋 Tasks</button>
              <button onClick={loadData} disabled={loading} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">{loading ? 'Loading...' : '↻ Refresh'}</button>
            </div>
          </div>

          {/* Top 5 */}
          {!loading && top5.length > 0 && (
            <div className="bg-white rounded-lg shadow p-4 mb-6">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">🔥 Top 5 Setores — Alta Probabilidade ERP</h2>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                {top5.map((s) => (
                  <div key={s.id} className="border border-red-200 rounded-lg p-3 bg-red-50/30">
                    <div className="font-semibold text-sm text-gray-900">{s.sector}</div>
                    <div className="text-xs text-gray-600 mt-1">
                      {s.growth && <span>Crescimento: {s.growth}</span>}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{formatDate(s.detectedAt)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="bg-white p-4 rounded-lg shadow mb-6 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Pesquisar</label>
              <input type="text" placeholder="Setor / fonte..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Probabilidade ERP</label>
              <select value={filterErp} onChange={(e) => { setFilterErp(e.target.value); setHighOnly(false); }} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                <option value="ALL">Todos</option>
                <option value="HIGH">Alta</option>
                <option value="MEDIUM">Média</option>
                <option value="LOW">Baixa</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-4">
              <input id="high-only" type="checkbox" checked={highOnly} onChange={(e) => { setHighOnly(e.target.checked); if (e.target.checked) setFilterErp('ALL'); }} className="rounded border-gray-300" />
              <label htmlFor="high-only" className="text-sm text-gray-700">Apenas alta</label>
            </div>
            <div className="pt-4">
              <button onClick={() => { setSearchQuery(''); setFilterErp('ALL'); setHighOnly(false); }} className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 w-full">Limpar</button>
            </div>
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">{error}</div>}

          {/* Table */}
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Setor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Crescimento</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Investimento</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Maturidade</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prob. ERP</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fonte</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Atualizado</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-5 w-20 bg-gray-200 rounded" /></td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                      {items.length === 0 ? 'Sem dados de setores. Aguardar ingestão do SectorInvestmentScanner.' : 'Nenhum setor corresponde aos filtros.'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.sector}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{item.growth ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{item.investmentIntensity ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{item.maturity ?? '—'}</td>
                      <td className="px-4 py-3"><ErpBadge value={item.erpProbability} /></td>
                      <td className="px-4 py-3 text-sm">
                        {item.source && isUrl(item.source) ? (
                          <a href={item.source} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 text-xs">🔗 Ver fonte</a>
                        ) : (
                          <span className="text-gray-600 text-xs">{item.source ?? '—'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{formatDate(item.detectedAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!loading && filtered.length > 0 && (
            <div className="mt-3 text-sm text-gray-500">A mostrar {filtered.length} de {items.length} setores</div>
          )}
        </div>
      </div>
    </AdminTokenGate>
  );
}
