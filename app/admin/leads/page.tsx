"use client";



function _getMyOwner(): string {
  if (typeof window === "undefined") return "";
  const k = "gobii_owner";
  const existing = window.localStorage.getItem(k);
  if (existing && existing.trim() !== "") return existing;
  const v = window.prompt("Define o teu owner (ex: email ou nome curto) para atribuição de leads:", "") || "";
  const vv = v.trim();
  if (vv) window.localStorage.setItem(k, vv);
  return vv;
}

async function _patchLead(id: string, data: Record<string, unknown>) {
  const r = await fetch(`/api/admin/leads/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.success) {
    const msg = j?.error || j?.message || "PATCH falhou";
    throw new Error(msg);
  }
  return j;
}
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Lead = {
  owner?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  status?: string | null;
  id: string;
  company: { name: string; domain?: string };
  source: string;
  lastSignalCategory?: string | null;
  score?: number | null;
  createdAt?: string | null;
};

type ApiResponse = { items: Lead[] };

export default function AdminLeadsPage() {
  const [items, setItems] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"new" | "score">("new");

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/admin/leads?take=200&skip=0", { cache: "no-store" });
    const data = (await r.json()) as ApiResponse;
    setItems(data.items ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const qq = q.toLowerCase();
    return items.filter(l =>
      !qq ||
      l.company?.name?.toLowerCase().includes(qq) ||
      l.company?.domain?.toLowerCase().includes(qq) ||
      l.source?.toLowerCase().includes(qq)
    );
  }, [items, q]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sort === "score") {
      arr.sort((a,b)=> (Number(b.score ?? -1) - Number(a.score ?? -1)));
    } else {
      arr.sort((a,b)=>{
        const ad = a.createdAt ? Date.parse(a.createdAt) : 0;
        const bd = b.createdAt ? Date.parse(b.createdAt) : 0;
        return bd - ad;
      });
    }
    return arr;
  }, [filtered, sort]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">work queue</h1>
        <button onClick={()=>void load()} className="border px-3 py-1 rounded">
          atualizar
        </button>
      </div>

      <div className="flex gap-3">
        <input
          className="border px-3 py-1 rounded w-80"
          placeholder="pesquisar..."
          value={q}
          onChange={e=>setQ(e.target.value)}
        />
        <select
          value={sort}
          onChange={e=>setSort(e.target.value as "new" | "score")}
          className="border px-3 py-1 rounded"
        >
          <option value="new">mais recentes</option>
          <option value="score">score desc</option>
        </select>
      </div>

      {loading && <div>a carregar...</div>}

      <table className="w-full text-sm border">
        <thead className="bg-gray-50">
          <tr>
            <th className="p-2 text-left">empresa</th>
            <th className="p-2 text-left">domínio</th>
            <th className="p-2 text-left">source</th>
            <th className="p-2 text-left">categoria</th>
            <th className="p-2 text-right">score</th>
            <th className="p-2 text-left">status</th>
            <th className="p-2 text-left">owner</th>
            <th className="p-2 text-right"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(l=>(
            <tr key={l.id} className="border-t hover:bg-gray-50">
              <td className="p-2">{l.company?.name}</td>
              <td className="p-2">{l.company?.domain ?? "-"}</td>
              <td className="p-2">{l.source}</td>
              <td className="p-2">{l.lastSignalCategory ?? "-"}</td>
              <td className="p-2 text-right">{l.score ?? "-"}</td>
              <td className="p-2">
                <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                  l.status === 'QUALIFIED' ? 'bg-green-100 text-green-800' :
                  l.status === 'CONTACTED' ? 'bg-purple-100 text-purple-800' :
                  l.status === 'DISCARDED' ? 'bg-gray-100 text-gray-600' :
                  'bg-blue-100 text-blue-800'
                }`}>
                  {l.status ?? "NEW"}
                </span>
              </td>
              <td className="p-2 text-sm text-gray-600">{l.ownerName ?? l.ownerEmail ?? l.owner ?? "-"}</td>
              <td className="p-2 text-right">
                <Link
                  href={`/admin/leads/${l.id}`}
                  className="text-blue-600 hover:text-blue-800 underline text-sm"
                >
                  detalhe
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}














