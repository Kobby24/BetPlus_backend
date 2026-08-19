"""Expand platform ledger, referrals, audit logs, and manager match fields."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002_ops_ledger"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table("platform_ledger")
    op.create_table(
        "platform_ledger",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("entry_type", sa.String(length=32), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=True),
        sa.Column("bet_id", sa.String(length=36), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["bet_id"], ["bets.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_platform_ledger_entry_type"),
        "platform_ledger",
        ["entry_type"],
        unique=False,
    )
    op.create_index(
        op.f("ix_platform_ledger_user_id"),
        "platform_ledger",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_platform_ledger_bet_id"),
        "platform_ledger",
        ["bet_id"],
        unique=False,
    )

    op.create_table(
        "referral_deposits",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("manager_id", sa.String(length=36), nullable=False),
        sa.Column("referred_user_id", sa.String(length=36), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("commission", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("transaction_id", sa.String(length=36), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["manager_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["referred_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_referral_deposits_manager_id"),
        "referral_deposits",
        ["manager_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_referral_deposits_referred_user_id"),
        "referral_deposits",
        ["referred_user_id"],
        unique=False,
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("actor_id", sa.String(length=36), nullable=True),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("detail", sa.Text(), nullable=False),
        sa.Column("bet_id", sa.String(length=36), nullable=True),
        sa.Column("match_id", sa.String(length=64), nullable=True),
        sa.Column("booking_code", sa.String(length=16), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_audit_logs_actor_id"), "audit_logs", ["actor_id"], unique=False)
    op.create_index(op.f("ix_audit_logs_role"), "audit_logs", ["role"], unique=False)

    op.add_column(
        "games",
        sa.Column("manager_controlled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("games", sa.Column("manager_note", sa.Text(), nullable=True))
    op.add_column(
        "games",
        sa.Column("is_manual", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "games",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("games", "updated_at")
    op.drop_column("games", "is_manual")
    op.drop_column("games", "manager_note")
    op.drop_column("games", "manager_controlled")
    op.drop_table("audit_logs")
    op.drop_table("referral_deposits")
    op.drop_table("platform_ledger")
    op.create_table(
        "platform_ledger",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
