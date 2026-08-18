"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { VerifyResult } from "@/components/VerifyResult";
import { resolveBookingCode } from "@/lib/booking-codes";
import { useBetSlip } from "@/lib/betslip-context";
import {
  buildTicketVerification,
  lookupTicketVerification,
  lookupTicketVerificationAsync,
} from "@/lib/ticket-verify";
import { useBackendApi } from "@/lib/backend-client";

export default function VerifyPage() {
  const router = useRouter();
  const backendMode = useBackendApi();
  const { loadSlip } = useBetSlip();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [mode, setMode] = useState<"ticket" | "slip">("ticket");
  const [verification, setVerification] = useState<
    ReturnType<typeof buildTicketVerification> | null
  >(null);

  async function handleVerify() {
    setError("");
    setVerification(null);

    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      setError("Enter a verification code.");
      return;
    }

    if (mode === "ticket") {
      setVerifying(true);
      try {
        const bet = backendMode
          ? await lookupTicketVerificationAsync(normalized)
          : lookupTicketVerification(normalized);
        if (bet) {
          setVerification(buildTicketVerification(bet));
          return;
        }
        setError(
          "Ticket not found. Use the unique verify code from your settled slip.",
        );
      } finally {
        setVerifying(false);
      }
      return;
    }

    const bet = backendMode
      ? await lookupTicketVerificationAsync(normalized)
      : lookupTicketVerification(normalized);
    if (bet) {
      setVerification(buildTicketVerification(bet));
      return;
    }

    if (mode === "slip") {
      const result = resolveBookingCode(normalized);
      if (!result) {
        setError("Code not found. Check and try again.");
        return;
      }

      if (result.type === "games") {
        router.push(`/games?code=${result.code}`);
      } else if (result.type === "betslip") {
        loadSlip(result.selections, result.stake);
        router.push("/my-bets");
      } else {
        router.push(`/bet/${result.code}`);
      }
      return;
    }

    setError(
      "Ticket not found. Use the unique verify code from your settled slip.",
    );
  }

  if (verification) {
    return (
      <div className="mx-auto max-w-sm space-y-4">
        <PageHeader
          icon="booking-code"
          title="Ticket verified"
          subtitle="Official BetPlus verification"
        />
        <VerifyResult
          result={verification}
          onClear={() => {
            setVerification(null);
            setCode("");
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <PageHeader
        icon="booking-code"
        title="Verify ticket"
        subtitle="Confirm stake, result, and winnings"
      />

      <div className="flex rounded-lg border border-border bg-surface p-0.5 text-[11px] font-semibold">
        <button
          type="button"
          onClick={() => {
            setMode("ticket");
            setError("");
          }}
          className={`flex-1 rounded-md py-1.5 ${
            mode === "ticket"
              ? "bg-brand-dark text-white"
              : "text-muted hover:text-foreground"
          }`}
        >
          Verify ticket
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("slip");
            setError("");
          }}
          className={`flex-1 rounded-md py-1.5 ${
            mode === "slip"
              ? "bg-brand-dark text-white"
              : "text-muted hover:text-foreground"
          }`}
        >
          Load slip
        </button>
      </div>

      <div className="card p-3">
        <label className="block">
          <span className="mb-1 block text-[11px] text-muted">
            {mode === "ticket" ? "Verification code" : "Booking / slip code"}
          </span>
          <input
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && handleVerify()}
            placeholder={mode === "ticket" ? "GHE714ZASK10BF6JK" : "BP7X2K9M"}
            className="w-full rounded-md border border-border/80 bg-surface-elevated px-3 py-2 font-mono text-sm tracking-wider outline-none focus:border-brand"
          />
        </label>

        {error && <p className="mt-2 text-xs text-live">{error}</p>}

        <button
          type="button"
          onClick={() => void handleVerify()}
          disabled={verifying}
          className="mt-3 w-full rounded-md bg-brand py-2 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {verifying
            ? "Verifying..."
            : mode === "ticket"
              ? "Verify ticket"
              : "Load code"}
        </button>
      </div>

      <div className="card bg-surface-elevated/40 p-3 text-xs text-muted">
        <p className="font-medium text-foreground">
          {mode === "ticket" ? "What gets verified" : "Load slip works with"}
        </p>
        <ul className="mt-1.5 space-y-0.5">
          {mode === "ticket" ? (
            <>
              <li>· Stake and total odds</li>
              <li>· Won, lost, or open status</li>
              <li>· Potential win and amount returned</li>
              <li>· Unique code on each settled slip</li>
            </>
          ) : (
            <>
              <li>· Shared betslips</li>
              <li>· Placed bet booking codes (BP…)</li>
              <li>· Game codes (BETPLUS, AVIATOR)</li>
            </>
          )}
        </ul>
      </div>

      {mode === "ticket" && (
        <p className="text-center text-[10px] text-muted">
          Try demo:{" "}
          <button
            type="button"
            className="font-mono text-brand hover:underline"
            onClick={() => setCode("GHE714ZASK10BF6JK")}
          >
            GHE714ZASK10BF6JK
          </button>
        </p>
      )}

      <p className="text-center text-[11px] text-muted">
        <Link href="/support" className="text-brand hover:underline">
          Need help?
        </Link>
      </p>
    </div>
  );
}
