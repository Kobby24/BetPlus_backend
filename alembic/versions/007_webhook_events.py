"""Record Moolre webhook event keys and provider transaction ids."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007_webhook_events"
down_revision: Union[str, None] = "006b_job_created_idx"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "payment_intents",
        sa.Column("provider_txn_id", sa.String(length=64), nullable=True),
    )
    op.create_index(
        "ix_payment_intents_provider_txn_id",
        "payment_intents",
        ["provider_txn_id"],
        unique=False,
    )
    op.create_table(
        "payment_webhook_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("event_key", sa.String(length=128), nullable=False),
        sa.Column("payment_intent_id", sa.String(length=36), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["payment_intent_id"], ["payment_intents.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider", "event_key", name="uq_payment_webhook_event"),
    )
    op.create_index(
        "ix_payment_webhook_events_provider",
        "payment_webhook_events",
        ["provider"],
    )
    op.create_index(
        "ix_payment_webhook_events_payment_intent_id",
        "payment_webhook_events",
        ["payment_intent_id"],
    )
    op.create_index(
        "ix_payment_webhook_events_created_at",
        "payment_webhook_events",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_payment_webhook_events_created_at", table_name="payment_webhook_events"
    )
    op.drop_index(
        "ix_payment_webhook_events_payment_intent_id",
        table_name="payment_webhook_events",
    )
    op.drop_index(
        "ix_payment_webhook_events_provider", table_name="payment_webhook_events"
    )
    op.drop_table("payment_webhook_events")
    op.drop_index("ix_payment_intents_provider_txn_id", table_name="payment_intents")
    op.drop_column("payment_intents", "provider_txn_id")
