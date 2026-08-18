"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useBetSlip } from "@/lib/betslip-context";
import type { PlacedBet } from "@/lib/bet-types";
import { isDemoBetCode } from "@/lib/demo-bets";
import {
  getLegDisplays,
  ticketId,
  totalReturn,
  verifyCode,
} from "@/lib/ticket-display";
import { formatMoney } from "@/lib/utils";
import {
  hasSeenWinCelebration,
  markWinCelebrationSeen,
} from "@/lib/win-celebration-store";
import { TicketActions } from "./TicketActions";
import { TicketDetailsHeader } from "./TicketDetailsHeader";
import { TicketFooter } from "./TicketFooter";
import { TicketLegList } from "./TicketLegList";
import { TicketSummary } from "./TicketSummary";
import { TicketVerifyBar } from "./TicketVerifyBar";
import { WinCelebrationModal } from "./WinCelebrationModal";

interface TicketDetailsProps {
  bet: PlacedBet;
  onBetUpdate?: (bet: PlacedBet) => void;
}

export function TicketDetails({ bet, onBetUpdate }: TicketDetailsProps) {
  const router = useRouter();
  const { loadSlip, setSlipTab, setBetslipOpen } = useBetSlip();
  const legs = getLegDisplays(bet);
  const isOpen = bet.status === "open";
  const isWon = bet.status === "won";
  const isDemo = isDemoBetCode(bet.bookingCode);
  const [showWinModal, setShowWinModal] = useState(false);

  useEffect(() => {
    if (isWon && !hasSeenWinCelebration(bet.id)) {
      setShowWinModal(true);
    }
  }, [bet.id, isWon]);

  function dismissWinCelebration() {
    markWinCelebrationSeen(bet.id);
    setShowWinModal(false);
  }

  function handleShowOff() {
    dismissWinCelebration();
    const text = `I won ${formatMoney(totalReturn(bet))} on BetPlus! Ticket ID: ${ticketId(bet)}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ title: "BetPlus Win", text }).catch(() => {});
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  }

  function handleRemix() {
    loadSlip(bet.selections, bet.stake);
    setSlipTab("betslip");
    setBetslipOpen(true);
    router.push("/");
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-brand-light">
      <TicketDetailsHeader />

      <WinCelebrationModal
        bet={bet}
        open={showWinModal}
        onCheckDetails={dismissWinCelebration}
        onShowOff={handleShowOff}
        onClose={dismissWinCelebration}
      />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <TicketSummary bet={bet} onBetUpdate={onBetUpdate} />
        <TicketActions
          status={bet.status}
          onRemix={handleRemix}
          onShowOff={isWon ? handleShowOff : undefined}
        />
        {!isOpen && <TicketVerifyBar code={verifyCode(bet)} />}
        <TicketLegList bet={bet} legs={legs} onBetUpdate={onBetUpdate} />
        <TicketFooter bet={bet} />

        {isOpen && onBetUpdate && !isDemo && (
          <div className="border-t border-brand-soft px-3 py-4 text-center">
            <p className="mb-2 text-[10px] text-muted">Preview settled ticket</p>
            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onBetUpdate({ ...bet, status: "won" });
                }}
                className="rounded border border-accent px-3 py-1.5 text-xs font-semibold text-accent"
              >
                View as Won
              </button>
              <button
                type="button"
                onClick={() => {
                  onBetUpdate({ ...bet, status: "lost" });
                }}
                className="rounded border border-live px-3 py-1.5 text-xs font-semibold text-live"
              >
                View as Lost
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
