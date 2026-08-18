"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminLogin } from "@/lib/admin-store";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const ok = await adminLogin(email, password);
    setLoading(false);
    if (ok) {
      router.push("/admin");
    } else {
      setError("Invalid admin credentials");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-dark px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-brand/30 bg-white p-5 shadow-lg"
      >
        <h1 className="text-lg font-bold text-brand-dark">Admin login</h1>
        <p className="mt-1 text-xs text-muted">
          Authorized staff only. Credentials are not stored in the app code.
        </p>

        <label className="mt-4 block">
          <span className="mb-1 block text-[11px] text-muted">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            required
          />
        </label>

        <label className="mt-3 block">
          <span className="mb-1 block text-[11px] text-muted">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            required
          />
        </label>

        {error && <p className="mt-2 text-xs text-live">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-4 w-full rounded-md bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
