"use client";

import { useEffect, useState } from "react";
import { ManagerEditPopup } from "@/components/manager/ManagerEditPopup";
import { useAuth } from "@/lib/auth-context";
import {
  MANAGER_REFERRAL_SHARE,
  REFERRAL_COMMISSION_RATE,
  getManagerReferralStats,
  type ManagerReferralStats,
  type ReferredUserSummary,
} from "@/lib/referral-store";
import { managerGetReferrals, useBackendApi } from "@/lib/backend-client";
import { backendReferralStatsToLocal } from "@/lib/backend-mappers";
import { formatMoney } from "@/lib/utils";

function CopyInviteButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      disabled={!value}
      className="shrink-0 rounded-md bg-brand px-3 py-2 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
    >
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

function formatJoinedDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function ReferredUserDetailPopup({
  referral,
  onClose,
}: {
  referral: ReferredUserSummary;
  onClose: () => void;
}) {
  return (
    <ManagerEditPopup open onClose={onClose}>
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-bold text-brand-dark">{referral.name}</h3>
          <p className="mt-0.5 text-xs text-muted">Referred user details</p>
        </div>

        <dl className="space-y-3">
          <DetailRow label="Full name" value={referral.name} />
          <DetailRow label="Email" value={referral.email} />
          <DetailRow label="Phone" value={referral.phone} />
          <DetailRow label="Registered" value={formatJoinedDate(referral.signedUpAt)} />
          <DetailRow label="Total deposited" value={formatMoney(referral.totalDeposited)} />
          <DetailRow
            label="Deposits"
            value={`${referral.depositCount} transaction${referral.depositCount === 1 ? "" : "s"}`}
          />
          <DetailRow
            label="Your earnings (50%)"
            value={formatMoney(referral.commissionEarned)}
            highlight
          />
        </dl>

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-md border border-border py-2.5 text-sm font-semibold text-brand-dark hover:bg-brand-light/40"
        >
          Close
        </button>
      </div>
    </ManagerEditPopup>
  );
}

function DetailRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-white px-3 py-2.5">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-sm font-semibold break-all ${
          highlight ? "text-brand" : "text-brand-dark"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export function ManagerReferralsPanel() {
  const { user } = useAuth();
  const backendMode = useBackendApi();
  const [stats, setStats] = useState<ManagerReferralStats | null>(null);
  const [selectedReferral, setSelectedReferral] =
    useState<ReferredUserSummary | null>(null);

  useEffect(() => {
    if (!user?.isManager) return;
    const userId = user.id;
    async function load() {
      if (backendMode) {
        const remote = await managerGetReferrals();
        setStats(backendReferralStatsToLocal(remote, "manager"));
        return;
      }
      setStats(getManagerReferralStats(userId));
    }
    void load();
  }, [user, backendMode]);

  if (!user?.isManager || !stats) return null;

  const commissionPct = Math.round(REFERRAL_COMMISSION_RATE * 100);
  const managerSharePct = Math.round(MANAGER_REFERRAL_SHARE * 100);

  return (
    <>
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-brand-dark">Invitations</h2>
          <p className="mt-0.5 text-xs text-muted">
            Share your link. Only people who register with your code count toward
            your referrals and earnings.
          </p>
        </div>

        <div className="card p-4">
          <p className="text-[11px] font-medium text-muted">Your invitation link</p>
          <div className="mt-2 flex items-center gap-2">
            <input
              readOnly
              value={stats.inviteLink}
              className="min-w-0 flex-1 truncate rounded-md border border-border bg-surface-elevated px-3 py-2 text-xs text-brand-dark"
            />
            <CopyInviteButton value={stats.inviteLink} />
          </div>
          <p className="mt-2 text-[10px] text-muted">
            Code:{" "}
            <span className="font-semibold text-brand-dark">{stats.referralCode}</span>
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="card p-4">
            <p className="text-[11px] text-muted">People referred</p>
            <p className="mt-1 text-2xl font-bold text-brand-dark">
              {stats.signupCount}
            </p>
          </div>
          <div className="card p-4">
            <p className="text-[11px] text-muted">Referral deposits</p>
            <p className="mt-1 text-2xl font-bold text-brand">
              {formatMoney(stats.totalDeposits)}
            </p>
          </div>
          <div className="card p-4">
            <p className="text-[11px] text-muted">
              Your earnings ({managerSharePct}% of referral revenue)
            </p>
            <p className="mt-1 text-2xl font-bold text-brand-dark">
              {formatMoney(stats.managerEarnings)}
            </p>
            <p className="mt-1 text-[10px] text-muted">
              Based on {commissionPct}% of referral deposits
            </p>
          </div>
        </div>

        {stats.referrals.length > 0 ? (
          <div className="card overflow-hidden">
            <div className="border-b border-border bg-brand-light/40 px-3 py-2">
              <h3 className="text-sm font-semibold text-brand-dark">
                Referred users
              </h3>
              <p className="text-[10px] text-muted">Tap a user to view details</p>
            </div>
            <ul className="divide-y divide-border/60">
              {stats.referrals.map((referral) => (
                <li key={referral.userId}>
                  <button
                    type="button"
                    onClick={() => setSelectedReferral(referral)}
                    className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left text-xs transition-colors hover:bg-brand-light/30 active:bg-brand-light/50"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-brand-dark">{referral.name}</p>
                      <p className="mt-1 text-[10px] text-muted">
                        Joined{" "}
                        {new Date(referral.signedUpAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold tabular-nums text-brand-dark">
                        {formatMoney(referral.totalDeposited)}
                      </p>
                      <p className="text-[10px] text-muted">
                        {referral.depositCount} deposit
                        {referral.depositCount === 1 ? "" : "s"}
                      </p>
                      <p className="mt-0.5 text-[10px] font-medium text-brand">
                        +{formatMoney(referral.commissionEarned)} earned
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="card px-4 py-6 text-center text-xs text-muted">
            No referrals yet. Share your invitation link to start tracking signups
            and deposits.
          </div>
        )}
      </section>

      {selectedReferral && (
        <ReferredUserDetailPopup
          referral={selectedReferral}
          onClose={() => setSelectedReferral(null)}
        />
      )}
    </>
  );
}
