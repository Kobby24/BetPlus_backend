"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminGate } from "@/components/admin/AdminGate";
import { SettleBetMenu } from "@/components/admin/SettleBetMenu";
import { logAdminAction } from "@/lib/admin-store";
import { getUserById } from "@/lib/auth-store";
import {
  formatLegSummary,
  getBetOriginalSelections,
  GOALS_PICK_PRESETS,
  SUPPORT_CLAIM_STATUS_LABEL,
} from "@/lib/bet-record";
import {
  canAdminEditLeg,
  formatLegFtTime,
  formatLegKickoff,
  getBetEditStatus,
  legEditLockReason,
} from "@/lib/bet-edit-rules";
import {
  addBetSupportClaim,
  applyPickCorrection,
  getBetById,
  saveBetPickEdits,
  updateBetSupportClaim,
} from "@/lib/bet-store";
import {
  adminGetBet,
  adminPatchBet,
  useBackendApi,
} from "@/lib/backend-client";
import { backendBetToPlacedBet, localSelectionToBackend } from "@/lib/backend-mappers";
import type { BetSupportClaim, PlacedBet } from "@/lib/bet-types";
import type { BetSelection } from "@/lib/types";
import { formatMoney, formatOdds } from "@/lib/utils";

function recalcFromSelections(
  selections: BetSelection[],
  stake: number,
): { totalOdds: number; potentialWin: number } {
  const totalOdds =
    Math.round(selections.reduce((acc, s) => acc * s.odds, 1) * 100) / 100;
  const potentialWin = Math.round(stake * totalOdds * 100) / 100;
  return { totalOdds, potentialWin };
}

function RecordList({ selections }: { selections: BetSelection[] }) {
  return (
    <ul className="space-y-2">
      {selections.map((sel, i) => (
        <li
          key={sel.id}
          className="rounded-md border border-border/60 bg-brand-light/30 px-3 py-2 text-xs"
        >
          <span className="font-medium text-brand-dark">Leg {i + 1}</span>
          <p className="mt-0.5">{formatLegSummary(sel)}</p>
        </li>
      ))}
    </ul>
  );
}

export default function AdminBetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const betId = params.id as string;
  const openSettleMenu = searchParams.get("settle") === "1";

  const backendMode = useBackendApi();
  const [bet, setBet] = useState<PlacedBet | null>(null);
  const [selections, setSelections] = useState<BetSelection[]>([]);
  const [stake, setStake] = useState("");
  const [totalOdds, setTotalOdds] = useState("");
  const [potentialWin, setPotentialWin] = useState("");
  const [message, setMessage] = useState("");

  const [claimLeg, setClaimLeg] = useState(0);
  const [claimText, setClaimText] = useState("");
  const [claimNote, setClaimNote] = useState("");

  async function reload() {
    if (backendMode) {
      try {
        const remote = await adminGetBet(betId);
        const loaded = backendBetToPlacedBet(remote);
        setBet(loaded);
        setSelections(loaded.selections.map((s) => ({ ...s })));
        setStake(String(loaded.stake));
        setTotalOdds(String(loaded.totalOdds));
        setPotentialWin(String(loaded.potentialWin));
      } catch {
        setBet(null);
      }
      return;
    }
    const loaded = getBetById(betId);
    if (loaded) {
      setBet(loaded);
      setSelections(loaded.selections.map((s) => ({ ...s })));
      setStake(String(loaded.stake));
      setTotalOdds(String(loaded.totalOdds));
      setPotentialWin(String(loaded.potentialWin));
    }
  }

  useEffect(() => {
    void reload();
  }, [betId, backendMode]);

  const originalSelections = bet ? getBetOriginalSelections(bet) : [];

  function updateSelection(index: number, patch: Partial<BetSelection>) {
    setSelections((prev) => {
      const next = prev.map((s, i) => (i === index ? { ...s, ...patch } : s));
      const stakeNum = Number.parseFloat(stake) || 0;
      const calc = recalcFromSelections(next, stakeNum);
      setTotalOdds(String(calc.totalOdds));
      setPotentialWin(String(calc.potentialWin));
      return next;
    });
  }

  function applyPreset(index: number, label: string, odds: number) {
    updateSelection(index, {
      selectionLabel: label,
      selection: label,
      odds,
    });
  }

  async function handleSavePicks(e: React.FormEvent) {
    e.preventDefault();
    if (!bet) return;

    const stakeNum = Number.parseFloat(stake);
    const oddsNum = Number.parseFloat(totalOdds);
    const winNum = Number.parseFloat(potentialWin);

    if (!Number.isFinite(stakeNum) || stakeNum <= 0) {
      setMessage("Invalid stake");
      return;
    }

    const before = bet.selections
      .map((s, i) => `Leg ${i + 1}: ${s.selectionLabel}`)
      .join("; ");
    const after = selections
      .map((s, i) => `Leg ${i + 1}: ${s.selectionLabel}`)
      .join("; ");

    if (backendMode) {
      try {
        const remote = await adminPatchBet(betId, {
          stake: stakeNum,
          selections: selections.map(localSelectionToBackend),
        });
        const updated = backendBetToPlacedBet(remote);
        setBet(updated);
        setMessage("Picks saved. User ticket shows the slip as placed.");
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Failed to save picks");
      }
      return;
    }

    const updated = saveBetPickEdits(betId, {
      selections,
      stake: stakeNum,
      totalOdds: Number.isFinite(oddsNum) ? oddsNum : undefined,
      potentialWin: Number.isFinite(winNum) ? winNum : undefined,
      note: "Support pick correction",
    });

    if (!updated) {
      const status = bet ? getBetEditStatus(bet) : null;
      setMessage(status?.reason ?? "Failed to save picks");
      return;
    }

    logAdminAction(
      "Pick edit saved",
      `${updated.bookingCode} — ${before} → ${after}`,
      { betId: updated.id, bookingCode: updated.bookingCode },
    );
    setBet(updated);
    setMessage("Picks saved. User ticket shows the slip as placed.");
  }

  function handleApplyClaimPick(claim: BetSupportClaim) {
    const updated = applyPickCorrection(betId, {
      legIndex: claim.legIndex,
      newPick: claim.userClaim,
      claimId: claim.id,
      note: `Support approved: ${claim.recordedPick} → ${claim.userClaim}`,
    });

    if (!updated || !bet) {
      const lock = legEditLockReason(bet!, claim.legIndex);
      setMessage(
        lock
          ? `Cannot apply pick — ${lock}. Edits are only allowed before Full Time.`
          : "Could not apply pick correction",
      );
      return;
    }

    logAdminAction(
      "Support pick correction",
      `${bet.bookingCode} Leg ${claim.legIndex + 1}: ${claim.recordedPick} → ${claim.userClaim}`,
      { betId: bet.id, bookingCode: bet.bookingCode },
    );

    reload();
    setMessage(
      `Leg ${claim.legIndex + 1} updated to "${claim.userClaim}". User ticket shows the slip as placed.`,
    );
  }

  function handleLogClaim(e: React.FormEvent) {
    e.preventDefault();
    if (!bet || !claimText.trim()) return;

    const result = addBetSupportClaim(betId, {
      legIndex: claimLeg,
      userClaim: claimText,
      adminNote: claimNote,
    });

    if (!result) {
      setMessage("Could not log support claim");
      return;
    }

    const { claim, bet: updated } = result;
    logAdminAction(
      "Support claim logged",
      `${updated.bookingCode} Leg ${claim.legIndex + 1}: user claimed "${claim.userClaim}" · record "${claim.recordedPick}"`,
      { betId: updated.id, bookingCode: updated.bookingCode },
    );

    setClaimText("");
    setClaimNote("");
    setBet(updated);
    setMessage("Claim logged. Use “Apply pick” if the user’s request is valid.");
  }

  function handleClaimStatus(claim: BetSupportClaim, status: BetSupportClaim["status"]) {
    const updated = updateBetSupportClaim(betId, claim.id, {
      status,
      adminNote:
        status === "record_confirmed"
          ? "Original record verified — no pick change needed."
          : claim.adminNote,
    });
    if (!updated || !bet) return;

    logAdminAction(
      status === "record_confirmed" ? "Claim: record confirmed" : "Claim resolved",
      `${bet.bookingCode} Leg ${claim.legIndex + 1}: ${claim.userClaim} vs record ${claim.recordedPick}`,
      { betId: bet.id, bookingCode: bet.bookingCode },
    );
    setBet(updated);
    setMessage(
      status === "record_confirmed"
        ? "Record stands — no pick change applied."
        : "Claim marked resolved.",
    );
  }

  function handleSettled(updated: PlacedBet, settleMessage: string) {
    setBet(updated);
    setMessage(settleMessage);
  }

  if (!bet) {
    return (
      <AdminGate>
        <p className="text-sm text-muted">Bet not found.</p>
        <Link href="/admin/bets" className="mt-2 inline-block text-xs text-brand">
          ← Back to bets
        </Link>
      </AdminGate>
    );
  }

  const owner = getUserById(bet.userId);
  const claims = bet.supportClaims ?? [];
  const editStatus = getBetEditStatus(bet);
  const ticketDiffersFromOriginal =
    JSON.stringify(bet.selections) !== JSON.stringify(originalSelections);

  return (
    <AdminGate>
      <div className="space-y-4">
        <Link href="/admin/bets" className="text-xs text-brand hover:underline">
          ← Bets
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="page-title">Edit slip — {bet.bookingCode}</h1>
            <p className="text-xs text-muted">
              {owner?.name ?? "Unknown user"} · Ticket {bet.ticketId ?? "—"} ·{" "}
              <span
                className={
                  bet.status === "won"
                    ? "text-accent"
                    : bet.status === "lost"
                      ? "text-live"
                      : ""
                }
              >
                {bet.status}
              </span>
            </p>
            <p className="mt-1 text-[11px] text-muted">
              {bet.status === "open"
                ? "Auto-settles after Full Time when picks match results. Use Settle to override manually."
                : bet.settledAt
                  ? `Settled ${new Date(bet.settledAt).toLocaleString()} — reopen is not available. Place a new bet or reset the demo slip.`
                  : "Already settled — Settle is only available while status is open."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SettleBetMenu
              bet={bet}
              defaultOpen={openSettleMenu}
              onSettled={handleSettled}
            />
            <button
              type="button"
              onClick={() => router.push(`/bet/${bet.bookingCode}`)}
              className="rounded-md border border-border px-3 py-1.5 text-xs"
            >
              Preview user ticket
            </button>
          </div>
        </div>

        {message && (
          <p className="rounded-md border border-brand/20 bg-brand/5 px-3 py-2 text-xs">
            {message}
          </p>
        )}

        {!editStatus.canEdit && (
          <p className="rounded-md border border-live/30 bg-live/5 px-3 py-2 text-xs text-live">
            {editStatus.reason}
          </p>
        )}

        {editStatus.canEdit && (
          <p className="rounded-md border border-brand/20 bg-brand/5 px-3 py-2 text-[11px] text-brand-dark">
            Picks can be edited until each match reaches Full Time (90 mins).
            After FT or once the bet is settled, picks are locked.
          </p>
        )}

        <form
          onSubmit={handleSavePicks}
          className="card border-brand/30 p-4 space-y-4"
        >
          <div>
            <h2 className="section-label">Edit picks (updates user ticket)</h2>
            <p className="mt-1 text-[11px] text-muted">
              Fix mistaken picks before Full Time — the user ticket updates as if
              the slip was placed that way.
            </p>
          </div>

          <div className="space-y-4">
            {selections.map((sel, index) => {
              const original = originalSelections[index];
              const changed =
                original?.selectionLabel !== sel.selectionLabel;
              const legLocked = !canAdminEditLeg(bet, index);
              const lockReason = legEditLockReason(bet, index);
              return (
                <div
                  key={sel.id}
                  className={`rounded-md border p-3 text-xs ${
                    legLocked
                      ? "border-border/60 bg-muted/5 opacity-80"
                      : changed
                        ? "border-brand bg-brand/5"
                        : "border-border/70"
                  }`}
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-brand-dark">
                      Leg {index + 1}: {sel.homeTeam} vs {sel.awayTeam}
                    </p>
                    {legLocked ? (
                      <span className="rounded-full bg-live/10 px-2 py-0.5 text-[10px] font-medium text-live">
                        {lockReason}
                      </span>
                    ) : (
                      <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                        Editable until FT
                      </span>
                    )}
                  </div>

                  <p className="mb-2 text-[10px] text-muted">
                    Kickoff {formatLegKickoff(bet, index)} · Locks at FT{" "}
                    {formatLegFtTime(bet, index)}
                  </p>

                  <p className="mb-2 text-[10px] text-muted">
                    {sel.marketName ?? "Market"} · {sel.league}
                  </p>

                  {!legLocked && (
                    <>
                      <div className="mb-2 flex flex-wrap gap-1">
                        {GOALS_PICK_PRESETS.map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() =>
                              applyPreset(index, preset.label, preset.odds)
                            }
                            className={`rounded-full px-2 py-0.5 text-[10px] ${
                              sel.selectionLabel === preset.label
                                ? "bg-brand text-white"
                                : "border border-border text-muted hover:border-brand"
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="block">
                          <span className="mb-1 block text-[10px] text-muted">
                            Pick
                          </span>
                          <input
                            type="text"
                            value={sel.selectionLabel}
                            onChange={(e) =>
                              updateSelection(index, {
                                selectionLabel: e.target.value,
                                selection: e.target.value,
                              })
                            }
                            className="w-full rounded border border-border px-2 py-1.5 outline-none focus:border-brand"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-[10px] text-muted">
                            Odds
                          </span>
                          <input
                            type="number"
                            min="1"
                            step="0.01"
                            value={sel.odds}
                            onChange={(e) =>
                              updateSelection(index, {
                                odds:
                                  Number.parseFloat(e.target.value) || sel.odds,
                              })
                            }
                            className="w-full rounded border border-border px-2 py-1.5 outline-none focus:border-brand"
                          />
                        </label>
                      </div>
                    </>
                  )}

                  {legLocked && (
                    <p className="font-medium text-foreground">
                      Pick: {sel.selectionLabel} @ {formatOdds(sel.odds)}
                    </p>
                  )}

                  {original && changed && !legLocked && (
                    <p className="mt-2 text-[10px] text-muted">
                      Was: {original.selectionLabel}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="grid gap-3 border-t border-border/60 pt-3 sm:grid-cols-3">
            <div>
              <p className="text-[10px] text-muted">Stake</p>
              <p className="font-medium">
                {formatMoney(Number.parseFloat(stake) || 0)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted">Total odds</p>
              <p className="font-medium">
                {formatOdds(Number.parseFloat(totalOdds) || 0)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted">Potential win</p>
              <p className="font-medium">
                {formatMoney(Number.parseFloat(potentialWin) || 0)}
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={!editStatus.canEdit}
            className="rounded-md bg-brand px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save picks — update user ticket
          </button>
        </form>

        <section className="card border-brand/25 p-3">
          <h2 className="section-label mb-1">Original placement record</h2>
          <p className="mb-3 text-[11px] text-muted">
            Kept for audit only — never changes. Compare when reviewing support
            requests.
          </p>
          <RecordList selections={originalSelections} />
        </section>

        {ticketDiffersFromOriginal && (
          <section className="card p-3">
            <h2 className="section-label mb-1">Current user ticket</h2>
            <p className="mb-2 text-[11px] text-brand">
              Picks differ from original — correction applied for the user.
            </p>
            <RecordList selections={bet.selections} />
          </section>
        )}

        <section className="card p-3">
          <h2 className="section-label mb-1">Support claims</h2>
          <p className="mb-3 text-[11px] text-muted">
            Log the user&apos;s complaint, then apply the correct pick if their
            request is valid.
          </p>

          {claims.length > 0 && (
            <ul className="mb-4 space-y-2">
              {claims.map((claim) => (
                <li
                  key={claim.id}
                  className="rounded-md border border-border/70 p-3 text-xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        Leg {claim.legIndex + 1} ·{" "}
                        {SUPPORT_CLAIM_STATUS_LABEL[claim.status]}
                      </p>
                      <p className="mt-1">
                        User wanted:{" "}
                        <span className="font-medium text-brand-dark">
                          {claim.userClaim}
                        </span>
                      </p>
                      <p>
                        Placed as:{" "}
                        <span className="font-medium">{claim.recordedPick}</span>
                      </p>
                      {claim.adminNote && (
                        <p className="mt-1 text-muted">Note: {claim.adminNote}</p>
                      )}
                    </div>
                    {claim.status === "open" && (
                      <div className="flex flex-col gap-1">
                        {canAdminEditLeg(bet, claim.legIndex) ? (
                          <button
                            type="button"
                            onClick={() => handleApplyClaimPick(claim)}
                            className="rounded bg-accent px-2 py-1 text-[10px] font-medium text-white"
                          >
                            Apply pick
                          </button>
                        ) : (
                          <span className="text-[10px] text-live">
                            Locked — FT reached
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleClaimStatus(claim, "record_confirmed")}
                          className="rounded border border-brand px-2 py-1 text-[10px] text-brand"
                        >
                          Record stands
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleLogClaim} className="space-y-2 border-t border-border/60 pt-3">
            <p className="text-[11px] font-medium text-brand-dark">Log support request</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[10px] text-muted">Leg</span>
                <select
                  value={claimLeg}
                  onChange={(e) => setClaimLeg(Number(e.target.value))}
                  className="w-full rounded border border-border px-2 py-1.5 text-xs outline-none focus:border-brand"
                >
                  {originalSelections.map((sel, i) => (
                    <option key={sel.id} value={i}>
                      Leg {i + 1}: {sel.selectionLabel}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] text-muted">
                  What user says they wanted
                </span>
                <input
                  type="text"
                  value={claimText}
                  onChange={(e) => setClaimText(e.target.value)}
                  placeholder="e.g. Over 1.5"
                  className="w-full rounded border border-border px-2 py-1.5 text-xs outline-none focus:border-brand"
                  required
                />
              </label>
            </div>
            <button
              type="submit"
              className="rounded-md border border-brand px-3 py-1.5 text-xs font-medium text-brand"
            >
              Log claim
            </button>
          </form>
        </section>
      </div>
    </AdminGate>
  );
}
