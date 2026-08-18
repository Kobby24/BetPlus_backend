"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminManagerReferralDetail } from "@/components/admin/AdminManagerReferralDetail";
import { getUserById } from "@/lib/auth-store";
import type { User } from "@/lib/user-types";

export default function AdminManagerDetailPage() {
  const params = useParams();
  const managerId = params.id as string;
  const [manager, setManager] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    setManager(getUserById(managerId));
  }, [managerId]);

  if (manager === undefined) {
    return (
      <AdminGate>
        <p className="text-sm text-muted">Loading…</p>
      </AdminGate>
    );
  }

  if (!manager) {
    return (
      <AdminGate>
        <p className="text-sm text-muted">Manager not found.</p>
        <Link href="/admin/managers" className="mt-2 inline-block text-xs text-brand">
          Back to managers
        </Link>
      </AdminGate>
    );
  }

  if (!manager.isManager) {
    return (
      <AdminGate>
        <p className="text-sm text-muted">This user is not a manager.</p>
        <Link href="/admin/managers" className="mt-2 inline-block text-xs text-brand">
          Back to managers
        </Link>
      </AdminGate>
    );
  }

  return (
    <AdminGate>
      <div className="space-y-4">
        <div>
          <Link
            href="/admin/managers"
            className="text-xs font-medium text-brand hover:underline"
          >
            ← All managers
          </Link>
          <h1 className="page-title mt-2">{manager.name}</h1>
          <p className="text-xs text-muted">{manager.email}</p>
        </div>

        <AdminManagerReferralDetail manager={manager} />
      </div>
    </AdminGate>
  );
}
