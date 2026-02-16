import Link from "next/link";

export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <div className="border-b">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/leads" className="font-semibold">Gobii Results Manager</Link>
            <span className="text-xs text-gray-500">admin</span>
          </div>

          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin/leads" className="hover:underline">work queue</Link>
            <Link href="/admin/tasks" className="hover:underline">tasks</Link>
            <Link href="/admin/inbox" className="hover:underline">inbox</Link>
            <Link href="/admin/agents" className="hover:underline">agents</Link>
          </nav>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}
