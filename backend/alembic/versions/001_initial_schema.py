"""Initial schema for BetPlus backend."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sports",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("slug", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_sports_id"), "sports", ["id"], unique=False)
    op.create_index(op.f("ix_sports_slug"), "sports", ["slug"], unique=True)

    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=32), nullable=True),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("balance", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("is_admin", sa.Boolean(), nullable=False),
        sa.Column("is_manager", sa.Boolean(), nullable=False),
        sa.Column("referral_code", sa.String(length=32), nullable=True),
        sa.Column("referred_by_manager_id", sa.String(length=36), nullable=True),
        sa.Column("settings", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=True),
        sa.ForeignKeyConstraint(["referred_by_manager_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_phone"), "users", ["phone"], unique=True)
    op.create_index(op.f("ix_users_referral_code"), "users", ["referral_code"], unique=True)

    op.create_table(
        "leagues",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("sport_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("slug", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["sport_id"], ["sports.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_leagues_id"), "leagues", ["id"], unique=False)
    op.create_index(op.f("ix_leagues_slug"), "leagues", ["slug"], unique=False)

    op.create_table(
        "platform_ledger",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_platform_ledger_id"), "platform_ledger", ["id"], unique=False)

    op.create_table(
        "games",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("external_id", sa.String(length=64), nullable=False),
        sa.Column("league_id", sa.Integer(), nullable=False),
        sa.Column("home", sa.String(), nullable=False),
        sa.Column("away", sa.String(), nullable=False),
        sa.Column("home_abbr", sa.String(length=8), nullable=True),
        sa.Column("away_abbr", sa.String(length=8), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(), nullable=True),
        sa.Column("is_live", sa.Integer(), nullable=True),
        sa.Column("live_minute", sa.Integer(), nullable=True),
        sa.Column("home_score", sa.Integer(), nullable=True),
        sa.Column("away_score", sa.Integer(), nullable=True),
        sa.Column("odds_home", sa.Numeric(precision=12, scale=4), nullable=True),
        sa.Column("odds_draw", sa.Numeric(precision=12, scale=4), nullable=True),
        sa.Column("odds_away", sa.Numeric(precision=12, scale=4), nullable=True),
        sa.Column("manager_status", sa.String(length=32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=True),
        sa.ForeignKeyConstraint(["league_id"], ["leagues.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_games_external_id"), "games", ["external_id"], unique=True)
    op.create_index(op.f("ix_games_id"), "games", ["id"], unique=False)

    op.create_table(
        "bets",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("booking_code", sa.String(length=16), nullable=False),
        sa.Column("ticket_id", sa.String(length=16), nullable=True),
        sa.Column("verify_code", sa.String(length=32), nullable=True),
        sa.Column("stake", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("total_odds", sa.Numeric(precision=12, scale=4), nullable=False),
        sa.Column("potential_win", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("bonus", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("flex_cut", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("payout", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("leg_results", sa.JSON(), nullable=True),
        sa.Column("placed_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=True),
        sa.Column("settled_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_bets_booking_code"), "bets", ["booking_code"], unique=True)
    op.create_index(op.f("ix_bets_user_id"), "bets", ["user_id"], unique=False)
    op.create_index(op.f("ix_bets_verify_code"), "bets", ["verify_code"], unique=False)

    op.create_table(
        "bet_selections",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("bet_id", sa.String(length=36), nullable=False),
        sa.Column("leg_index", sa.Integer(), nullable=False),
        sa.Column("match_id", sa.String(length=64), nullable=False),
        sa.Column("home_team", sa.String(length=255), nullable=False),
        sa.Column("away_team", sa.String(length=255), nullable=False),
        sa.Column("selection", sa.String(length=64), nullable=False),
        sa.Column("selection_label", sa.String(length=255), nullable=False),
        sa.Column("odds", sa.Numeric(precision=12, scale=4), nullable=False),
        sa.Column("league", sa.String(length=255), nullable=False),
        sa.Column("market_id", sa.String(length=64), nullable=True),
        sa.Column("market_name", sa.String(length=255), nullable=True),
        sa.Column("outcome_label", sa.String(length=255), nullable=True),
        sa.Column("manager_ft_score", sa.JSON(), nullable=True),
        sa.Column("kickoff", sa.DateTime(timezone=True), nullable=True),
        sa.Column("original_snapshot", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["bet_id"], ["bets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("bet_id", "leg_index", name="uq_bet_leg"),
    )
    op.create_index(op.f("ix_bet_selections_match_id"), "bet_selections", ["match_id"], unique=False)

    op.create_table(
        "transactions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("bet_id", sa.String(length=36), nullable=True),
        sa.Column("type", sa.String(length=32), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=True),
        sa.ForeignKeyConstraint(["bet_id"], ["bets.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_transactions_bet_id"), "transactions", ["bet_id"], unique=False)
    op.create_index(op.f("ix_transactions_user_id"), "transactions", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_table("transactions")
    op.drop_table("bet_selections")
    op.drop_table("bets")
    op.drop_table("games")
    op.drop_table("platform_ledger")
    op.drop_table("leagues")
    op.drop_table("users")
    op.drop_table("sports")
