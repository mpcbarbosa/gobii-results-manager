"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Lead = {
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
            <th className="p-2 text-right"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(l=>(
            <tr key={l.id} className="border-t">
              <td className="p-2">{l.company?.name}</td>
              <td className="p-2">{l.company?.domain ?? "-"}</td>
              <td className="p-2">{l.source}</td>
              <td className="p-2">{l.lastSignalCategory ?? "-"}</td>
              <td className="p-2 text-right">{l.score ?? "-"} </td>
              <td className="p-2">{l.status ?? "NEW"}</td>
              <td className="p-2">{l.owner ?? "-"}</td>
              <td className="p-2 text-right">
                <Link
                  href={`/admin/leads/${l.id}`}
                  className="underline"
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

