import re
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.codes import generate_booking_code, generate_ticket_id, generate_verify_code
from app.core.money import to_decimal
from app.models.bet import Bet, BetSelection
from app.models.game import Game
from app.services.ledger_service import LedgerService
from app.services.wallet_service import InsufficientBalanceError, WalletService


@dataclass
class SelectionInput:
    match_id: str
    home_team: str
    away_team: str
    selection: str
    selection_label: str
    odds: float
    league: str = ""
    market_id: str | None = None
    market_name: str | None = None
    kickoff: datetime | None = None


class BetService:
    @staticmethod
    def place_simple_bet(
        db: Session,
        user_id: str,
        stake: float,
        odds: float,
    ) -> Bet:
        """Legacy single-odds bet for backward-compatible API."""
        selection = SelectionInput(
            match_id="legacy",
            home_team="Legacy",
            away_team="Legacy",
            selection="home",
            selection_label="Home",
            odds=odds,
            league="Legacy",
        )
        return BetService.place_bet(
            db,
            user_id=user_id,
            stake=stake,
            selections=[selection],
            flex_cut=None,
        )

    @staticmethod
    def place_bet(
        db: Session,
        user_id: str,
        stake: float,
        selections: list[SelectionInput],
        flex_cut: int | None = None,
    ) -> Bet:
        if not selections:
            raise ValueError("At least one selection is required")

        dec_stake = to_decimal(stake)
        if dec_stake <= 0:
            raise ValueError("Stake must be positive")

        total_odds = Decimal("1")
        for sel in selections:
            if sel.odds <= 0:
                raise ValueError("Odds must be positive")
            total_odds *= to_decimal(sel.odds)

        potential_win = (dec_stake * total_odds).quantize(Decimal("0.01"))
        bonus = (
            (potential_win * Decimal("0.04")).quantize(Decimal("0.01"))
            if len(selections) >= 3
            else Decimal("0")
        )

        existing_codes = {code for (code,) in db.query(Bet.booking_code).all()}
        booking_code = generate_booking_code(existing_codes)

        bet = Bet(
            user_id=user_id,
            booking_code=booking_code,
            ticket_id=generate_ticket_id(),
            verify_code=generate_verify_code(),
            stake=dec_stake,
            total_odds=total_odds,
            potential_win=potential_win,
            bonus=bonus,
            flex_cut=flex_cut if flex_cut and flex_cut > 0 else None,
            status="open",
        )
        db.add(bet)
        db.flush()

        for index, sel in enumerate(selections):
            snapshot = {
                "matchId": sel.match_id,
                "homeTeam": sel.home_team,
                "awayTeam": sel.away_team,
                "selection": sel.selection,
                "selectionLabel": sel.selection_label,
                "odds": sel.odds,
                "league": sel.league,
            }
            db.add(
                BetSelection(
                    bet_id=bet.id,
                    leg_index=index,
                    match_id=sel.match_id,
                    home_team=sel.home_team,
                    away_team=sel.away_team,
                    selection=sel.selection,
                    selection_label=sel.selection_label,
                    odds=to_decimal(sel.odds),
                    league=sel.league,
                    market_id=sel.market_id,
                    market_name=sel.market_name,
                    kickoff=sel.kickoff,
                    original_snapshot=snapshot,
                )
            )

        WalletService.debit_for_bet(
            db,
            user_id,
            dec_stake,
            bet.id,
            f"Bet {booking_code}",
        )
        db.commit()
        db.refresh(bet)
        return bet

    @staticmethod
    def list_user_bets(db: Session, user_id: str) -> list[Bet]:
        return (
            db.query(Bet)
            .filter(Bet.user_id == user_id)
            .order_by(Bet.placed_at.desc())
            .all()
        )

    @staticmethod
    def get_by_booking_code(db: Session, code: str) -> Bet | None:
        return db.query(Bet).filter(Bet.booking_code == code.upper()).first()

    @staticmethod
    def get_by_verify_code(db: Session, code: str) -> Bet | None:
        normalized = code.strip().upper()
        return db.query(Bet).filter(Bet.verify_code == normalized).first()


def _normalize(value: str) -> str:
    return value.strip().lower()


def evaluate_pick_result(
    selection_label: str,
    selection: str,
    home_team: str,
    away_team: str,
    home_goals: int,
    away_goals: int,
) -> bool:
    label = _normalize(selection_label)
    home_team_n = _normalize(home_team)
    away_team_n = _normalize(away_team)
    total = home_goals + away_goals

    if label in ("home", home_team_n):
        return home_goals > away_goals
    if label in ("away", away_team_n):
        return away_goals > home_goals
    if label == "draw":
        return home_goals == away_goals

    over_match = re.match(r"^over\s+([\d.]+)$", label)
    if over_match:
        return total > float(over_match.group(1))

    under_match = re.match(r"^under\s+([\d.]+)$", label)
    if under_match:
        return total < float(under_match.group(1))

    if label == "btts yes" or ("btts" in label and "yes" in label):
        return home_goals >= 1 and away_goals >= 1
    if label == "btts no" or ("btts" in label and "no" in label):
        return home_goals == 0 or away_goals == 0

    if selection == "home":
        return home_goals > away_goals
    if selection == "away":
        return away_goals > home_goals
    if selection == "draw":
        return home_goals == away_goals

    score_match = re.match(r"^(\d+)\s*[:\-]\s*(\d+)$", label)
    if score_match:
        return int(score_match.group(1)) == home_goals and int(score_match.group(2)) == away_goals

    return False


class SettlementService:
    @staticmethod
    def _match_scores(db: Session, match_id: str) -> tuple[int, int, str | None]:
        game = db.query(Game).filter(Game.external_id == match_id).first()
        if not game:
            return 0, 0, None
        home = game.home_score if game.home_score is not None else 0
        away = game.away_score if game.away_score is not None else 0
        return home, away, game.manager_status

    @staticmethod
    def evaluate_leg(
        db: Session,
        selection: BetSelection,
    ) -> dict | None:
        if selection.manager_ft_score:
            home = selection.manager_ft_score.get("home", 0)
            away = selection.manager_ft_score.get("away", 0)
            won = evaluate_pick_result(
                selection.selection_label,
                selection.selection,
                selection.home_team,
                selection.away_team,
                home,
                away,
            )
            return {
                "legIndex": selection.leg_index,
                "homeScore": home,
                "awayScore": away,
                "won": won,
            }

        home, away, manager_status = SettlementService._match_scores(
            db, selection.match_id
        )
        if manager_status == "void":
            return {
                "legIndex": selection.leg_index,
                "homeScore": home,
                "awayScore": away,
                "won": False,
                "void": True,
            }
        if manager_status == "won":
            return {
                "legIndex": selection.leg_index,
                "homeScore": home,
                "awayScore": away,
                "won": True,
            }
        if manager_status == "lost":
            return {
                "legIndex": selection.leg_index,
                "homeScore": home,
                "awayScore": away,
                "won": False,
            }

        game = db.query(Game).filter(Game.external_id == selection.match_id).first()
        if not game or game.status not in ("finished", "ft", "completed"):
            return None

        won = evaluate_pick_result(
            selection.selection_label,
            selection.selection,
            selection.home_team,
            selection.away_team,
            home,
            away,
        )
        return {
            "legIndex": selection.leg_index,
            "homeScore": home,
            "awayScore": away,
            "won": won,
        }

    @staticmethod
    def derive_status(bet: Bet, leg_results: list[dict]) -> str | None:
        n = len(bet.selections)
        if n == 0:
            return None
        if len(leg_results) < n:
            return None
        if any(r.get("void") for r in leg_results):
            return "void"

        lost_count = sum(1 for r in leg_results if not r.get("won") and not r.get("void"))
        flex_cut = bet.flex_cut or 0
        if flex_cut > 0:
            return "won" if lost_count <= flex_cut else "lost"
        return "won" if lost_count == 0 else "lost"

    @staticmethod
    def apply_financial_settlement(db: Session, bet: Bet, status: str) -> None:
        stake = to_decimal(bet.stake)
        if status == "won":
            payout = to_decimal(bet.potential_win) + to_decimal(bet.bonus)
            bet.payout = payout
            WalletService.credit_winnings(
                db,
                bet.user_id,
                payout,
                bet.id,
                f"Winnings {bet.booking_code}",
            )
            net_profit = payout - stake
            LedgerService.record(
                db,
                entry_type="payout",
                amount=-net_profit,
                description=f"Winnings {bet.booking_code}",
                user_id=bet.user_id,
                bet_id=bet.id,
            )
        elif status == "void":
            bet.payout = stake
            WalletService.credit_winnings(
                db,
                bet.user_id,
                stake,
                bet.id,
                f"Void refund {bet.booking_code}",
            )
        else:
            bet.payout = Decimal("0")
            LedgerService.record(
                db,
                entry_type="stake_retained",
                amount=stake,
                description=f"Lost bet {bet.booking_code} — stake retained",
                user_id=bet.user_id,
                bet_id=bet.id,
            )

    @staticmethod
    def settle_bet(
        db: Session,
        bet: Bet,
        force_status: str | None = None,
        commit: bool = True,
    ) -> Bet:
        if bet.status != "open":
            return bet

        if force_status:
            if force_status not in ("won", "lost", "void"):
                raise ValueError("Invalid settlement status")
            status = force_status
            leg_results: list[dict] = list(bet.leg_results or [])
        else:
            leg_results = list(bet.leg_results or [])
            for selection in bet.selections:
                if any(r.get("legIndex") == selection.leg_index for r in leg_results):
                    continue
                evaluated = SettlementService.evaluate_leg(db, selection)
                if evaluated:
                    leg_results.append(evaluated)

            status = SettlementService.derive_status(bet, leg_results)
            if not status:
                bet.leg_results = leg_results
                db.add(bet)
                if commit:
                    db.commit()
                    db.refresh(bet)
                return bet

        bet.leg_results = leg_results
        bet.status = status
        bet.settled_at = datetime.now(timezone.utc)
        SettlementService.apply_financial_settlement(db, bet, status)

        db.add(bet)
        if commit:
            db.commit()
            db.refresh(bet)
        return bet

    @staticmethod
    def run_open_bets(
        db: Session, limit: int = 50, match_id: str | None = None
    ) -> list[Bet]:
        q = db.query(Bet).filter(Bet.status == "open")
        if match_id:
            q = q.join(BetSelection).filter(BetSelection.match_id == match_id)
        open_bets = q.order_by(Bet.placed_at).limit(limit).all()
        settled: list[Bet] = []
        for bet in open_bets:
            settled.append(SettlementService.settle_bet(db, bet, commit=True))
        return settled

    @staticmethod
    def update_leg(
        db: Session,
        bet: Bet,
        leg_index: int,
        *,
        selection: str | None = None,
        selection_label: str | None = None,
        odds: float | None = None,
        market_id: str | None = None,
        market_name: str | None = None,
        outcome_label: str | None = None,
        manager_ft_score: dict | None = None,
        outcome_status: str | None = None,
        clear_ft_score: bool = False,
    ) -> Bet:
        if bet.status != "open":
            raise ValueError("Cannot edit a settled bet")

        target = next((s for s in bet.selections if s.leg_index == leg_index), None)
        if target is None:
            raise ValueError("Leg not found")

        if selection is not None:
            target.selection = selection
        if selection_label is not None:
            target.selection_label = selection_label
        if odds is not None:
            if odds <= 0:
                raise ValueError("Odds must be positive")
            target.odds = to_decimal(odds)
        if market_id is not None:
            target.market_id = market_id
        if market_name is not None:
            target.market_name = market_name
        if outcome_label is not None:
            target.outcome_label = outcome_label
        if clear_ft_score:
            target.manager_ft_score = None
        elif manager_ft_score is not None:
            target.manager_ft_score = manager_ft_score

        total_odds = Decimal("1")
        for sel in bet.selections:
            total_odds *= to_decimal(sel.odds)
        bet.total_odds = total_odds
        bet.potential_win = (to_decimal(bet.stake) * total_odds).quantize(
            Decimal("0.01")
        )
        bet.bonus = (
            (to_decimal(bet.potential_win) * Decimal("0.04")).quantize(Decimal("0.01"))
            if len(bet.selections) >= 3
            else Decimal("0")
        )

        leg_results: list[dict] = list(bet.leg_results or [])
        result_idx = next(
            (
                i
                for i, r in enumerate(leg_results)
                if r.get("legIndex") == leg_index
            ),
            None,
        )
        if outcome_status in (None, "not_started"):
            if result_idx is not None:
                leg_results.pop(result_idx)
        elif outcome_status in ("won", "lost", "void"):
            home = 0
            away = 0
            if target.manager_ft_score:
                home = int(target.manager_ft_score.get("home", 0))
                away = int(target.manager_ft_score.get("away", 0))
            entry = {
                "legIndex": leg_index,
                "homeScore": home,
                "awayScore": away,
                "won": outcome_status == "won",
                "void": outcome_status == "void",
            }
            if result_idx is not None:
                leg_results[result_idx] = entry
            else:
                leg_results.append(entry)
        bet.leg_results = leg_results
        db.add(bet)
        db.flush()
        return SettlementService.settle_bet(db, bet, commit=True)
