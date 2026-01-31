import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-center font-mono text-sm">
        <h1 className="text-4xl font-bold text-center mb-4">
          Gobii Results Manager
        </h1>
        <p className="text-center text-muted-foreground mb-8">
          Sistema para gerenciar workflows e resultados de processos de negócio
        </p>
        <div className="flex justify-center gap-4">
          <Link
            href="/admin/leads"
            className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 transition-colors"
          >
            Admin Console →
          </Link>
        </div>
      </div>
    </main>
  );
}
