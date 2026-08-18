from sqlalchemy.orm import declarative_base

Base = declarative_base()

# Import models so metadata is populated before create_all / Alembic autogenerate.
import app.models  # noqa: E402, F401
