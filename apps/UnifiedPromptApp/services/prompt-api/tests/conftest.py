import pytest
import app as app_module


@pytest.fixture(autouse=True, scope="session")
def initialize_db():
    """Ensure the database is initialized with all required tables before tests run."""
    app_module.init_db()
