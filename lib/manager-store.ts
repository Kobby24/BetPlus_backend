/**
 * Manager audit log — managers authenticate as normal users (isManager flag).
 */

export interface ManagerAuditEntry {
  id: string;
  action: string;
  detail: string;
  at: string;
  matchId?: string;
}

const AUDIT_KEY = "betplus_manager_audit";

export function logManagerAction(
  action: string,
  detail: string,
  meta?: { matchId?: string },
) {
  if (typeof window === "undefined") return;
  const entry: ManagerAuditEntry = {
    id: crypto.randomUUID(),
    action,
    detail,
    at: new Date().toISOString(),
    matchId: meta?.matchId,
  };
  try {
    const raw = localStorage.getItem(AUDIT_KEY);
    const list: ManagerAuditEntry[] = raw ? JSON.parse(raw) : [];
    list.unshift(entry);
    localStorage.setItem(AUDIT_KEY, JSON.stringify(list.slice(0, 200)));
  } catch {
    /* ignore */
  }
}

export function getManagerAuditLog(): ManagerAuditEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(AUDIT_KEY);
    return raw ? (JSON.parse(raw) as ManagerAuditEntry[]) : [];
  } catch {
    return [];
  }
}
