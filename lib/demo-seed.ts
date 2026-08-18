import { ensureUser, setUserBalance } from "./auth-store";
import {
  adminUpdateBet,
  deleteBetById,
  getBetByCode,
  placeBetForUser,
} from "./bet-store";
import type { PlacedBet } from "./bet-types";
import type { BetSelection } from "./types";
import type { User } from "./user-types";

export const DEMO_USER1 = {
  name: "User1",
  email: "user1@betplus.com",
  phone: "0241110001",
  password: "user123",
};

export const DEMO_USER1_BET_CODE = "BPUSER1";

function leg(
  id: string,
  matchId: string,
  home: string,
  away: string,
  label: string,
  odds: number,
  marketName: string,
  league: string,
  kickoff: string,
): BetSelection {
  return {
    id,
    matchId,
    homeTeam: home,
    awayTeam: away,
    selection: id,
    selectionLabel: label,
    odds,
    league,
    marketId: marketName.toLowerCase().replace(/\s+/g, "-"),
    marketName,
    kickoff,
  };
}

function futureKickoff(hoursFromNow: number): string {
  const d = new Date();
  d.setTime(d.getTime() + hoursFromNow * 60 * 60 * 1000);
  return d.toISOString();
}

function pastKickoff(minutesAgo: number): string {
  const d = new Date();
  d.setTime(d.getTime() - minutesAgo * 60 * 1000);
  return d.toISOString();
}

/** Demo slip — Home win, Over 2.5, BTTS Yes (all win with demo FT scores) */
function user1Selections(editable = false): BetSelection[] {
  return [
    leg(
      "u1-leg-1",
      "m-hearts-kotoko",
      "Accra Hearts",
      "Asante Kotoko",
      "Home",
      2.15,
      "1X2",
      "Ghana Premier League",
      editable ? futureKickoff(4) : pastKickoff(100),
    ),
    leg(
      "u1-leg-2",
      "m-medeama-bibiani",
      "Medeama SC",
      "Bibiani Gold Stars",
      "Over 2.5",
      1.85,
      "Over/Under Goals",
      "Ghana Premier League",
      editable ? futureKickoff(6) : pastKickoff(100),
    ),
    leg(
      "u1-leg-3",
      "m-arsenal-chelsea",
      "Arsenal",
      "Chelsea",
      "BTTS Yes",
      1.72,
      "Both Teams To Score",
      "Premier League",
      editable ? futureKickoff(8) : pastKickoff(100),
    ),
  ];
}

export function seedUser1DemoSlip(options?: {
  editable?: boolean;
  recreate?: boolean;
}): {
  user: User;
  bet: PlacedBet;
  created: boolean;
} {
  const editable = options?.editable ?? true;
  const user = ensureUser({
    ...DEMO_USER1,
    balance: 250,
  });

  const existing = getBetByCode(DEMO_USER1_BET_CODE);
  if (existing && options?.recreate) {
    deleteBetById(existing.id);
  } else if (existing) {
    const bet = getBetByCode(DEMO_USER1_BET_CODE)!;
    return { user, bet, created: false };
  }

  const selections = user1Selections(editable);
  const stake = 25;
  const totalOdds =
    Math.round(selections.reduce((a, s) => a * s.odds, 1) * 100) / 100;
  const bonus = Math.round(stake * totalOdds * 0.04 * 100) / 100;
  const potentialWin = Math.round((stake * totalOdds + bonus) * 100) / 100;

  placeBetForUser({
    userId: user.id,
    selections,
    stake,
    totalOdds,
    potentialWin,
    bookingCode: DEMO_USER1_BET_CODE,
    verifyCode: "GHUSER1DEMOSLIP01",
    ticketId: "100001",
  });

  const bet = getBetByCode(DEMO_USER1_BET_CODE)!;
  return { user, bet, created: true };
}

/** Replace demo slip with an open bet (future kickoff) for manual settle testing. */
export function resetUser1OpenDemo() {
  const user = ensureUser({ ...DEMO_USER1, balance: 250 });
  setUserBalance(user.id, 250);
  return seedUser1DemoSlip({ editable: true, recreate: true });
}

/** Push demo slip kickoffs to the past so auto-settlement runs after FT. */
export function prepareUser1DemoForAutoSettle(): PlacedBet | null {
  const bet = getBetByCode(DEMO_USER1_BET_CODE);
  if (!bet || bet.status !== "open") return bet;
  return adminUpdateBet(bet.id, { selections: user1Selections(false) });
}
