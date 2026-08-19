"""Add catalog markets, payment intents, idempotency, and indexes."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003_production_hardening"
down_revision: Union[str, None] = "002_ops_ledger"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("games", sa.Column("markets", sa.JSON(), nullable=True))
    op.create_index("ix_games_status", "games", ["status"], unique=False)
    op.create_index("ix_games_starts_at", "games", ["starts_at"], unique=False)

    op.create_index("ix_bets_status", "bets", ["status"], unique=False)
    op.create_index("ix_bets_placed_at", "bets", ["placed_at"], unique=False)
    op.drop_index("ix_bets_verify_code", table_name="bets")
    op.create_index("ix_bets_verify_code", "bets", ["verify_code"], unique=True)
    op.create_index("ix_bets_ticket_id", "bets", ["ticket_id"], unique=True)

    op.create_index("ix_transactions_created_at", "transactions", ["created_at"], unique=False)
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"], unique=False)
    op.create_index("ix_platform_ledger_created_at", "platform_ledger", ["created_at"], unique=False)

    op.create_check_constraint("ck_users_balance_nonneg", "users", "balance >= 0")
    op.create_check_constraint("ck_bets_stake_positive", "bets", "stake > 0")

    op.create_table(
        "payment_intents",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("provider_ref", sa.String(length=64), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("channel", sa.String(length=32), nullable=True),
        sa.Column("authorization_url", sa.String(length=512), nullable=True),
        sa.Column("extra", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider", "provider_ref", name="uq_payment_provider_ref"),
    )
    op.create_index("ix_payment_intents_user_id", "payment_intents", ["user_id"])
    op.create_index("ix_payment_intents_provider_ref", "payment_intents", ["provider_ref"])
    op.create_index("ix_payment_intents_status", "payment_intents", ["status"])
    op.create_index("ix_payment_intents_created_at", "payment_intents", ["created_at"])

    op.create_table(
        "idempotency_keys",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("key_value", sa.String(length=128), nullable=False),
        sa.Column("method", sa.String(length=8), nullable=False),
        sa.Column("path", sa.String(length=255), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=False),
        sa.Column("response_body", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "key_value", name="uq_user_idempotency_key"),
    )
    op.create_index("ix_idempotency_keys_user_id", "idempotency_keys", ["user_id"])

    op.create_table(
        "rate_limit_hits",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("bucket", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_rate_limit_hits_bucket", "rate_limit_hits", ["bucket"])
    op.create_index("ix_rate_limit_hits_created_at", "rate_limit_hits", ["created_at"])


def downgrade() -> None:
    op.drop_table("rate_limit_hits")
    op.drop_table("idempotency_keys")
    op.drop_table("payment_intents")
    op.drop_constraint("ck_bets_stake_positive", "bets", type_="check")
    op.drop_constraint("ck_users_balance_nonneg", "users", type_="check")
    op.drop_index("ix_platform_ledger_created_at", table_name="platform_ledger")
    op.drop_index("ix_audit_logs_created_at", table_name="audit_logs")
    op.drop_index("ix_transactions_created_at", table_name="transactions")
    op.drop_index("ix_bets_ticket_id", table_name="bets")
    op.drop_index("ix_bets_verify_code", table_name="bets")
    op.create_index("ix_bets_verify_code", "bets", ["verify_code"], unique=False)
    op.drop_index("ix_bets_placed_at", table_name="bets")
    op.drop_index("ix_bets_status", table_name="bets")
    op.drop_index("ix_games_starts_at", table_name="games")
    op.drop_index("ix_games_status", table_name="games")
    op.drop_column("games", "markets")
