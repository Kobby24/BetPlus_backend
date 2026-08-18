import { setAccessToken } from "./backend-client";

export interface AdminAuditEntry {
  id: string;
  action: string;
  detail: string;
  at: string;
  betId?: string;
  bookingCode?: string;
}

const AUDIT_KEY = "betplus_admin_audit";

export async function checkAdminSession(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const res = await fetch("/api/admin/session", { credentials: "include" });
    if (!res.ok) return false;
    const data = (await res.json()) as { authenticated?: boolean };
    return data.authenticated === true;
  } catch {
    return false;
  }
}

export async function adminLogin(email: string, password: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { access_token?: string | null };
    if (data.access_token) setAccessToken(data.access_token);
    return true;
  } catch {
    return false;
  }
}

export async function adminLogout(): Promise<void> {
  if (typeof window === "undefined") return;
  setAccessToken(null);
  try {
    await fetch("/api/admin/logout", {
      method: "POST",
      credentials: "include",
    });
  } catch {
    /* ignore */
  }
}

export function logAdminAction(
  action: string,
  detail: string,
  meta?: { betId?: string; bookingCode?: string },
) {
  if (typeof window === "undefined") return;
  const entry: AdminAuditEntry = {
    id: crypto.randomUUID(),
    action,
    detail,
    at: new Date().toISOString(),
    betId: meta?.betId,
    bookingCode: meta?.bookingCode,
  };
  try {
    const raw = localStorage.getItem(AUDIT_KEY);
    const list: AdminAuditEntry[] = raw ? JSON.parse(raw) : [];
    list.unshift(entry);
    localStorage.setItem(AUDIT_KEY, JSON.stringify(list.slice(0, 200)));
  } catch {
    /* ignore */
  }
}

export function getAdminAuditLog(): AdminAuditEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(AUDIT_KEY);
    return raw ? (JSON.parse(raw) as AdminAuditEntry[]) : [];
  } catch {
    return [];
  }
}
