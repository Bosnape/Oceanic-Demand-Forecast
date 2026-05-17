"""Shared pytest fixtures for backend tests.

All tests run against the same PostgreSQL instance configured via DATABASE_URL.
Each test function gets a fresh session; data is cleaned up in teardown so
tests are isolated from one another.
"""

import os
import pytest
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Load .env so tests work locally with the same config as the app
load_dotenv()
DATABASE_URL = os.environ["DATABASE_URL"]

# Import models so SQLAlchemy registers them with the metadata
from database.base import Base  # noqa: E402
from database.models import (  # noqa: E402
    Company,
    DataSource,
    InventoryAnalysis,
    InventorySnapshot,
    ModelMetrics,
    Prediction,
    SalesTransaction,
)


@pytest.fixture(scope="session")
def engine():
    """Session-scoped engine. Creates all tables and required indexes once."""
    eng = create_engine(DATABASE_URL)
    Base.metadata.create_all(bind=eng)
    with eng.connect() as conn:
        conn.execute(text("""
            CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_transaction_key
            ON sales_transaction (company_id, item_id, COALESCE(store_id, ''), date)
        """))
        conn.execute(text("""
            CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_snapshot_key
            ON inventory_snapshot (company_id, item_id, COALESCE(store_id, ''), date)
        """))
        conn.commit()
    yield eng
    eng.dispose()


def _truncate_all(session) -> None:
    """Delete all rows in FK-safe order."""
    session.query(ModelMetrics).delete()
    session.query(InventoryAnalysis).delete()
    session.query(InventorySnapshot).delete()
    session.query(Prediction).delete()
    session.query(SalesTransaction).delete()
    session.query(DataSource).delete()
    session.query(Company).delete()
    session.commit()


@pytest.fixture
def db(engine):
    """Function-scoped DB session. Cleans up before and after each test."""
    Session = sessionmaker(bind=engine)
    session = Session()
    _truncate_all(session)   # setup: ensure clean state even on local re-runs
    yield session
    _truncate_all(session)   # teardown: leave clean state for next test
    session.close()


@pytest.fixture
def client(db):
    """FastAPI TestClient with get_db overridden to use the test session."""
    from api.main import app
    from database.database import get_db
    from fastapi.testclient import TestClient

    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
