"""
Basic integration tests for MCP governance API endpoints.
"""

import sys
import pathlib

# Add parent directory to path
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

from mcp_governance import storage
from mcp_governance.models import Collection, InstallRecord, InstallStatus, Allowlist, AllowlistScope
from datetime import datetime


def test_get_servers():
    """Test loading servers from catalog."""
    servers = storage.get_servers()
    assert len(servers) > 0, "Should have servers in catalog"
    
    # Check structure
    first_server = servers[0]
    assert "id" in first_server
    assert "name" in first_server
    assert "capabilities" in first_server
    print(f"✓ Loaded {len(servers)} servers from catalog")


def test_search_servers():
    """Test server search with filters."""
    # Search all
    results, total = storage.search_servers(limit=100)
    assert total > 0
    print(f"✓ Found {total} servers total")
    
    # Search by query
    results, total = storage.search_servers(query="filesystem")
    assert total > 0
    assert any("filesystem" in r.get("name", "").lower() for r in results)
    print(f"✓ Search for 'filesystem' found {total} servers")
    
    # Search by tag
    results, total = storage.search_servers(tags=["local"])
    assert total > 0
    print(f"✓ Search by tag 'local' found {total} servers")


def test_collection_crud():
    """Test collection CRUD operations."""
    # Create
    collection = Collection(
        collection_id="test-collection-1",
        name="Test Collection",
        description="Test collection for unit tests",
        server_ids=["local-filesystem"],
        tags=["test"],
        created_by="test-user",
        created_at=datetime.utcnow()
    )
    
    saved = storage.save_collection(collection)
    assert saved.collection_id == collection.collection_id
    print("✓ Created collection")
    
    # Read
    loaded = storage.get_collection("test-collection-1")
    assert loaded is not None
    assert loaded.name == "Test Collection"
    print("✓ Retrieved collection")
    
    # Update
    loaded.description = "Updated description"
    storage.save_collection(loaded)
    updated = storage.get_collection("test-collection-1")
    assert updated.description == "Updated description"
    print("✓ Updated collection")
    
    # Delete
    success = storage.delete_collection("test-collection-1")
    assert success
    deleted = storage.get_collection("test-collection-1")
    assert deleted is None
    print("✓ Deleted collection")


def test_install_record_crud():
    """Test install record operations."""
    # Create
    record = InstallRecord(
        install_id="test-install-1",
        server_id="local-filesystem",
        status=InstallStatus.ENABLED,
        installed_at=datetime.utcnow(),
        installed_by="test-user"
    )
    
    saved = storage.save_install_record(record)
    assert saved.install_id == record.install_id
    print("✓ Created install record")
    
    # Read
    loaded = storage.get_install_record("test-install-1")
    assert loaded is not None
    assert loaded.server_id == "local-filesystem"
    print("✓ Retrieved install record")
    
    # Update status
    loaded.status = InstallStatus.DISABLED
    loaded.disabled_at = datetime.utcnow()
    storage.save_install_record(loaded)
    updated = storage.get_install_record("test-install-1")
    assert updated.status == InstallStatus.DISABLED
    print("✓ Updated install record")
    
    # Delete
    success = storage.delete_install_record("test-install-1")
    assert success
    print("✓ Deleted install record")


def test_allowlist_crud():
    """Test allowlist operations."""
    # Create
    allowlist = Allowlist(
        allowlist_id="test-allowlist-1",
        scope=AllowlistScope.RUN,
        scope_id="run-test-123",
        allowed_servers=["local-filesystem"],
        allowed_collections=["data-tools"],
        denied_servers=[],
        denied_tools=[],
        created_by="test-user",
        created_at=datetime.utcnow()
    )
    
    saved = storage.save_allowlist(allowlist)
    assert saved.allowlist_id == allowlist.allowlist_id
    print("✓ Created allowlist")
    
    # Read
    loaded = storage.get_allowlist("test-allowlist-1")
    assert loaded is not None
    assert "local-filesystem" in loaded.allowed_servers
    print("✓ Retrieved allowlist")
    
    # Get by scope
    scope_list = storage.get_allowlist_for_scope(AllowlistScope.RUN, "run-test-123")
    assert scope_list is not None
    print("✓ Retrieved allowlist by scope")
    
    # Delete
    success = storage.delete_allowlist("test-allowlist-1")
    assert success
    print("✓ Deleted allowlist")


if __name__ == "__main__":
    print("Running MCP Governance Storage Tests\n")
    print("=" * 50)
    
    try:
        test_get_servers()
        print()
        test_search_servers()
        print()
        test_collection_crud()
        print()
        test_install_record_crud()
        print()
        test_allowlist_crud()
        print()
        print("=" * 50)
        print("✅ All tests passed!")
    except AssertionError as e:
        print(f"\n❌ Test failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
