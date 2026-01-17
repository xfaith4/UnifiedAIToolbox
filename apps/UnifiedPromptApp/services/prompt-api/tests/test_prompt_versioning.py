"""
Unit tests for prompt versioning and registry.

Tests:
- Stable hashing (same library => same hash)
- Version creation and loading
- Patch application
- Changelog management
"""

import tempfile
import json
from pathlib import Path
import pytest

from prompt_versioning import (
    PromptRegistry,
    PromptPatch,
    PatchOperation,
)


class TestPromptHashing:
    """Test suite for prompt hashing."""
    
    def test_hash_stability(self):
        """Test that same library produces same hash."""
        with tempfile.TemporaryDirectory() as tmpdir:
            registry = PromptRegistry(Path(tmpdir))
            
            library = {
                "agents": [
                    {"id": "test_agent", "prompt": "Test prompt"}
                ]
            }
            
            hash1 = registry.compute_library_hash(library)
            hash2 = registry.compute_library_hash(library)
            
            assert hash1 == hash2
            assert len(hash1) == 64  # SHA-256
    
    def test_hash_ignores_metadata(self):
        """Test that metadata fields don't affect hash."""
        with tempfile.TemporaryDirectory() as tmpdir:
            registry = PromptRegistry(Path(tmpdir))
            
            library1 = {
                "agents": [
                    {
                        "id": "test_agent",
                        "prompt": "Test prompt",
                        "createdAt": "2024-01-01T00:00:00Z"
                    }
                ]
            }
            
            library2 = {
                "agents": [
                    {
                        "id": "test_agent",
                        "prompt": "Test prompt",
                        "createdAt": "2024-01-02T00:00:00Z"  # Different timestamp
                    }
                ]
            }
            
            hash1 = registry.compute_library_hash(library1)
            hash2 = registry.compute_library_hash(library2)
            
            # Hashes should be the same (metadata ignored)
            assert hash1 == hash2
    
    def test_hash_sensitive_to_content(self):
        """Test that content changes affect hash."""
        with tempfile.TemporaryDirectory() as tmpdir:
            registry = PromptRegistry(Path(tmpdir))
            
            library1 = {"agents": [{"id": "test", "prompt": "Prompt 1"}]}
            library2 = {"agents": [{"id": "test", "prompt": "Prompt 2"}]}
            
            hash1 = registry.compute_library_hash(library1)
            hash2 = registry.compute_library_hash(library2)
            
            assert hash1 != hash2


class TestVersionManagement:
    """Test suite for version management."""
    
    def test_create_and_load_version(self):
        """Test creating and loading a version."""
        with tempfile.TemporaryDirectory() as tmpdir:
            registry = PromptRegistry(Path(tmpdir))
            
            library = {"agents": [{"id": "test", "prompt": "Test"}]}
            
            version_id, version_path = registry.create_version(
                library,
                description="Test version",
                created_by="tester"
            )
            
            assert version_id
            assert Path(version_path).exists()
            
            # Load version
            loaded = registry.load_version(version_id)
            assert loaded is not None
            assert loaded["agents"][0]["id"] == "test"
    
    def test_list_versions(self):
        """Test listing versions."""
        with tempfile.TemporaryDirectory() as tmpdir:
            registry = PromptRegistry(Path(tmpdir))
            
            # Create multiple versions
            for i in range(3):
                library = {"agents": [{"id": f"agent_{i}", "prompt": f"Prompt {i}"}]}
                registry.create_version(library, f"Version {i}")
            
            versions = registry.list_versions()
            assert len(versions) == 3
            
            # Should be reverse chronological
            assert "Version 2" in versions[0]["description"]
    
    def test_activate_version(self):
        """Test activating a version."""
        with tempfile.TemporaryDirectory() as tmpdir:
            registry = PromptRegistry(Path(tmpdir))
            
            library = {"agents": [{"id": "test", "prompt": "Test"}]}
            version_id, _ = registry.create_version(library, "Test version")
            
            # Activate
            success = registry.activate_version(version_id)
            assert success
            
            # Check active library
            active = registry.load_active_library()
            assert active is not None
            assert active["agents"][0]["id"] == "test"


class TestPatchApplication:
    """Test suite for patch application."""
    
    def test_apply_replace_patch(self):
        """Test applying a replace operation."""
        with tempfile.TemporaryDirectory() as tmpdir:
            registry = PromptRegistry(Path(tmpdir))
            
            library = {
                "agents": [
                    {"id": "test_agent", "prompt": "Old prompt"}
                ]
            }
            
            patch = PromptPatch(
                target={"agent_id": "test_agent", "field": "prompt"},
                change_type="edit",
                patch=[
                    PatchOperation(
                        op="replace",
                        path="/agents/0/prompt",
                        value="New prompt"
                    )
                ],
                reason="Update prompt",
                risk="low",
                tests_required=[]
            )
            
            success, result, errors = registry.apply_patch(library, patch)
            
            assert success
            assert len(errors) == 0
            assert result["agents"][0]["prompt"] == "New prompt"
    
    def test_apply_add_patch(self):
        """Test applying an add operation."""
        with tempfile.TemporaryDirectory() as tmpdir:
            registry = PromptRegistry(Path(tmpdir))
            
            library = {
                "agents": [
                    {"id": "test_agent", "constraints": ["Constraint 1"]}
                ]
            }
            
            patch = PromptPatch(
                target={"agent_id": "test_agent", "field": "constraints"},
                change_type="edit",
                patch=[
                    PatchOperation(
                        op="add",
                        path="/agents/0/constraints/-",
                        value="New constraint"
                    )
                ],
                reason="Add constraint",
                risk="low",
                tests_required=[]
            )
            
            success, result, errors = registry.apply_patch(library, patch)
            
            assert success
            assert len(errors) == 0
            assert len(result["agents"][0]["constraints"]) == 2
            assert "New constraint" in result["agents"][0]["constraints"]
    
    def test_apply_remove_patch(self):
        """Test applying a remove operation."""
        with tempfile.TemporaryDirectory() as tmpdir:
            registry = PromptRegistry(Path(tmpdir))
            
            library = {
                "agents": [
                    {"id": "test_agent", "constraints": ["Keep", "Remove"]}
                ]
            }
            
            patch = PromptPatch(
                target={"agent_id": "test_agent", "field": "constraints"},
                change_type="delete",
                patch=[
                    PatchOperation(
                        op="remove",
                        path="/agents/0/constraints/1"
                    )
                ],
                reason="Remove constraint",
                risk="low",
                tests_required=[]
            )
            
            success, result, errors = registry.apply_patch(library, patch)
            
            assert success
            assert len(errors) == 0
            assert len(result["agents"][0]["constraints"]) == 1
            assert result["agents"][0]["constraints"][0] == "Keep"
    
    def test_patch_invalid_path(self):
        """Test patch with invalid path fails gracefully."""
        with tempfile.TemporaryDirectory() as tmpdir:
            registry = PromptRegistry(Path(tmpdir))
            
            library = {"agents": [{"id": "test"}]}
            
            patch = PromptPatch(
                target={"agent_id": "test", "field": "prompt"},
                change_type="edit",
                patch=[
                    PatchOperation(
                        op="replace",
                        path="/agents/99/prompt",  # Invalid index
                        value="New"
                    )
                ],
                reason="Test",
                risk="low",
                tests_required=[]
            )
            
            success, result, errors = registry.apply_patch(library, patch)
            
            assert not success
            assert len(errors) > 0


class TestChangelogManagement:
    """Test suite for changelog management."""
    
    def test_add_changelog_entry(self):
        """Test adding changelog entry."""
        with tempfile.TemporaryDirectory() as tmpdir:
            registry = PromptRegistry(Path(tmpdir))
            
            success = registry.add_changelog_entry(
                version_id="20240115_abc123",
                description="Test version",
                changes=["Change 1", "Change 2"]
            )
            
            assert success
            
            # Check changelog content
            content = registry.changelog_path.read_text()
            assert "20240115_abc123" in content
            assert "Test version" in content
            assert "Change 1" in content
            assert "Change 2" in content
    
    def test_multiple_changelog_entries(self):
        """Test multiple changelog entries maintain order."""
        with tempfile.TemporaryDirectory() as tmpdir:
            registry = PromptRegistry(Path(tmpdir))
            
            # Add first entry
            registry.add_changelog_entry(
                "20240115_v1",
                "Version 1",
                ["First change"]
            )
            
            # Add second entry
            registry.add_changelog_entry(
                "20240116_v2",
                "Version 2",
                ["Second change"]
            )
            
            content = registry.changelog_path.read_text()
            
            # Most recent should come first
            v2_pos = content.find("20240116_v2")
            v1_pos = content.find("20240115_v1")
            assert v2_pos < v1_pos
