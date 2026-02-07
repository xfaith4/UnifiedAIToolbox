import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from github_integration.clone_service import evaluate_appfactory_status


def test_appfactory_known():
    topics = ["appfactory-managed", "appfactory"]
    metadata = {
        "schema_version": "1.0",
        "factory": {"name": "AppFactory"},
        "classification": {"contract_universe": "build_app", "contract_version": "build_app_contract.v1"},
    }
    result = evaluate_appfactory_status(topics, metadata)
    assert result["known"] is True
    assert result["status"] == "known"


def test_appfactory_tampered_when_topic_missing_metadata():
    topics = ["appfactory-managed"]
    result = evaluate_appfactory_status(topics, None)
    assert result["known"] is False
    assert result["status"] == "tampered_or_legacy"


def test_appfactory_topic_missing_but_metadata_present():
    topics = []
    metadata = {"schema_version": "1.0", "factory": {"name": "AppFactory"}}
    result = evaluate_appfactory_status(topics, metadata)
    assert result["known"] is True
    assert result["status"] == "topic_missing"
    assert result["needs_topic_heal"] is True
