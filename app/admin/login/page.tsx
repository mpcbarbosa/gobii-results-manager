"use client";

import { useMemo, useState } from "react";

export default function AdminLoginPage() {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const nextPath = useMemo(() => {
    const url = new URL(window.location.href);
    return url.searchParams.get("next") || "/admin/leads";
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (!r.ok) {
        setError("Credenciais inválidas.");
        setLoading(false);
        return;
      }

      window.location.href = nextPath;
    } catch (err) {
      setError("Erro ao autenticar. Tenta novamente.");
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: "60px auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>Admin login</h1>
      <p style={{ marginBottom: 18, opacity: 0.85 }}>
        Introduz o token de administração para iniciar sessão.
      </p>

      <form onSubmit={onSubmit}>
        <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
          APP_ADMIN_TOKEN
        </label>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="cola aqui o token"
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 10,
            border: "1px solid #ddd",
            marginBottom: 12,
          }}
        />

        {error && (
          <div style={{ background: "#ffe5e5", border: "1px solid #ffb3b3", padding: 10, borderRadius: 10, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 10,
            border: "none",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          {loading ? "a autenticar..." : "entrar"}
        </button>
      </form>

      <div style={{ marginTop: 18, fontSize: 12, opacity: 0.7 }}>
        Sessão expira em 12h (configurável).
      </div>
    </div>
  );
}
