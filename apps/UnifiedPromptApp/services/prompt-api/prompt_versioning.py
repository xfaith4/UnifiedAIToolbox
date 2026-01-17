"""
Prompt registry with versioning support.

Treats prompts as code with:
- Active agent library (agent-library.active.json)
- Immutable version history (versions/<timestamp>_<hash>.json)
- Changelog tracking (changelog.md)
- Stable hashing for deterministic tracking
- Patch application with validation
"""

import hashlib
import json
import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field, ValidationError

logger = logging.getLogger(__name__)


class AgentLibraryVersion(BaseModel):
    """Agent library version metadata."""
    version_id: str = Field(..., description="Version identifier (timestamp_hash)")
    timestamp: str = Field(..., description="ISO-8601 timestamp")
    library_hash: str = Field(..., description="SHA-256 hash of library content")
    description: str = Field(..., description="Version description")
    created_by: str = Field(default="system", description="Creator identifier")
    parent_version: Optional[str] = Field(None, description="Parent version ID if derived from another")


class PatchOperation(BaseModel):
    """JSON Patch operation."""
    op: str = Field(..., description="Operation: replace, add, remove")
    path: str = Field(..., description="JSON pointer path (e.g., /agents/0/prompt)")
    value: Optional[Any] = Field(None, description="Value for add/replace operations")


class PromptPatch(BaseModel):
    """Structured prompt patch."""
    target: Dict[str, str] = Field(..., description="Target specification (agent_id, field)")
    change_type: str = Field(..., description="Change type: edit, insert, delete")
    patch: List[PatchOperation] = Field(..., description="JSON Patch operations")
    reason: str = Field(..., description="Reason for change")
    risk: str = Field(..., description="Risk level: low, medium, high")
    tests_required: List[str] = Field(default_factory=list, description="Tests required to validate")


class PromptRegistry:
    """
    Manages agent library with versioning.
    
    Provides:
    - Loading/saving active library
    - Creating immutable versions
    - Applying patches to create candidates
    - Computing stable hashes
    - Changelog management
    """
    
    def __init__(self, prompts_dir: Path):
        """
        Initialize prompt registry.
        
        Args:
            prompts_dir: Root directory for prompts/ (contains active, versions/, changelog.md)
        """
        self.prompts_dir = Path(prompts_dir)
        self.prompts_dir.mkdir(parents=True, exist_ok=True)
        
        self.active_path = self.prompts_dir / "agent-library.active.json"
        self.versions_dir = self.prompts_dir / "versions"
        self.versions_dir.mkdir(parents=True, exist_ok=True)
        
        self.changelog_path = self.prompts_dir / "changelog.md"
        
        # Initialize changelog if it doesn't exist
        if not self.changelog_path.exists():
            self.changelog_path.write_text("# Prompt Library Changelog\n\n")
    
    def compute_library_hash(self, library: Dict[str, Any]) -> str:
        """
        Compute stable SHA-256 hash of agent library.
        
        Normalizes the library by:
        - Sorting keys at all levels
        - Removing metadata fields that don't affect behavior
        - Using consistent JSON serialization
        
        Args:
            library: Agent library dict
            
        Returns:
            Hex-encoded SHA-256 hash
        """
        # Create a normalized copy for hashing
        normalized = self._normalize_for_hash(library)
        
        # Serialize with sorted keys and no whitespace
        json_str = json.dumps(normalized, sort_keys=True, separators=(',', ':'))
        
        return hashlib.sha256(json_str.encode('utf-8')).hexdigest()
    
    def _normalize_for_hash(self, obj: Any) -> Any:
        """Recursively normalize object for hashing."""
        if isinstance(obj, dict):
            # Remove version metadata fields that don't affect behavior
            normalized = {}
            for k, v in obj.items():
                if k not in ['createdAt', 'updatedAt', 'version_id', 'timestamp', 'created_by']:
                    normalized[k] = self._normalize_for_hash(v)
            return normalized
        elif isinstance(obj, list):
            return [self._normalize_for_hash(item) for item in obj]
        else:
            return obj
    
    def load_active_library(self) -> Optional[Dict[str, Any]]:
        """
        Load the active agent library.
        
        Returns:
            Agent library dict, or None if not found
        """
        if not self.active_path.exists():
            logger.warning(f"Active library not found: {self.active_path}")
            return None
        
        try:
            with open(self.active_path, 'r') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load active library: {e}")
            return None
    
    def save_active_library(self, library: Dict[str, Any]) -> bool:
        """
        Save the active agent library.
        
        Args:
            library: Agent library dict
            
        Returns:
            True if saved successfully
        """
        try:
            with open(self.active_path, 'w') as f:
                json.dump(library, f, indent=2)
            logger.info(f"Saved active library to {self.active_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to save active library: {e}")
            return False
    
    def create_version(
        self,
        library: Dict[str, Any],
        description: str,
        created_by: str = "system",
        parent_version: Optional[str] = None
    ) -> Tuple[str, str]:
        """
        Create an immutable version of the library.
        
        Args:
            library: Agent library to version
            description: Description of this version
            created_by: Creator identifier
            parent_version: Parent version ID if derived from another
            
        Returns:
            Tuple of (version_id, version_path)
        """
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        library_hash = self.compute_library_hash(library)
        short_hash = library_hash[:8]
        
        version_id = f"{timestamp}_{short_hash}"
        version_filename = f"{version_id}.json"
        version_path = self.versions_dir / version_filename
        
        # Create version with metadata
        version_data = {
            "_version_metadata": {
                "version_id": version_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "library_hash": library_hash,
                "description": description,
                "created_by": created_by,
                "parent_version": parent_version,
            },
            "library": library
        }
        
        try:
            with open(version_path, 'w') as f:
                json.dump(version_data, f, indent=2)
            
            logger.info(f"Created version {version_id}: {description}")
            return version_id, str(version_path)
        except Exception as e:
            logger.error(f"Failed to create version: {e}")
            raise
    
    def load_version(self, version_id: str) -> Optional[Dict[str, Any]]:
        """
        Load a specific version.
        
        Args:
            version_id: Version identifier
            
        Returns:
            Library dict, or None if not found
        """
        version_path = self.versions_dir / f"{version_id}.json"
        if not version_path.exists():
            logger.warning(f"Version not found: {version_id}")
            return None
        
        try:
            with open(version_path, 'r') as f:
                version_data = json.load(f)
                return version_data.get("library")
        except Exception as e:
            logger.error(f"Failed to load version {version_id}: {e}")
            return None
    
    def list_versions(self) -> List[Dict[str, Any]]:
        """
        List all versions with metadata.
        
        Returns:
            List of version metadata dicts
        """
        versions = []
        
        for version_file in sorted(self.versions_dir.glob("*.json"), reverse=True):
            try:
                with open(version_file, 'r') as f:
                    version_data = json.load(f)
                    metadata = version_data.get("_version_metadata", {})
                    versions.append(metadata)
            except Exception as e:
                logger.error(f"Failed to read version {version_file}: {e}")
        
        return versions
    
    def apply_patch(
        self,
        library: Dict[str, Any],
        patch: PromptPatch
    ) -> Tuple[bool, Dict[str, Any], List[str]]:
        """
        Apply a patch to create a new candidate library.
        
        Args:
            library: Source library
            patch: Patch to apply
            
        Returns:
            Tuple of (success, patched_library, errors)
        """
        import copy
        
        candidate = copy.deepcopy(library)
        errors = []
        
        try:
            for operation in patch.patch:
                success, error = self._apply_operation(candidate, operation)
                if not success:
                    errors.append(error)
            
            if errors:
                return False, candidate, errors
            
            return True, candidate, []
        except Exception as e:
            errors.append(f"Patch application failed: {e}")
            return False, candidate, errors
    
    def _apply_operation(
        self,
        library: Dict[str, Any],
        operation: PatchOperation
    ) -> Tuple[bool, Optional[str]]:
        """
        Apply a single JSON Patch operation.
        
        Args:
            library: Library to modify (in-place)
            operation: Patch operation
            
        Returns:
            Tuple of (success, error_message)
        """
        try:
            path_parts = operation.path.strip('/').split('/')
            
            if operation.op == "replace":
                # Navigate to parent and replace value
                parent = library
                for part in path_parts[:-1]:
                    if part.isdigit():
                        parent = parent[int(part)]
                    else:
                        parent = parent[part]
                
                last_key = path_parts[-1]
                if last_key.isdigit():
                    parent[int(last_key)] = operation.value
                else:
                    parent[last_key] = operation.value
                
                return True, None
            
            elif operation.op == "add":
                # Navigate to parent and add value
                parent = library
                for part in path_parts[:-1]:
                    if part.isdigit():
                        parent = parent[int(part)]
                    else:
                        parent = parent[part]
                
                last_key = path_parts[-1]
                if isinstance(parent, list):
                    if last_key == "-":
                        parent.append(operation.value)
                    else:
                        parent.insert(int(last_key), operation.value)
                else:
                    parent[last_key] = operation.value
                
                return True, None
            
            elif operation.op == "remove":
                # Navigate to parent and remove value
                parent = library
                for part in path_parts[:-1]:
                    if part.isdigit():
                        parent = parent[int(part)]
                    else:
                        parent = parent[part]
                
                last_key = path_parts[-1]
                if isinstance(parent, list):
                    del parent[int(last_key)]
                else:
                    del parent[last_key]
                
                return True, None
            
            else:
                return False, f"Unsupported operation: {operation.op}"
        
        except (KeyError, IndexError, ValueError) as e:
            return False, f"Operation failed at path {operation.path}: {e}"
        except Exception as e:
            return False, f"Unexpected error: {e}"
    
    def add_changelog_entry(
        self,
        version_id: str,
        description: str,
        changes: List[str]
    ) -> bool:
        """
        Add entry to changelog.
        
        Args:
            version_id: Version identifier
            description: Version description
            changes: List of changes
            
        Returns:
            True if successful
        """
        try:
            timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
            
            entry_lines = [
                f"## {version_id} - {timestamp}",
                "",
                description,
                "",
                "### Changes",
            ]
            
            for change in changes:
                entry_lines.append(f"- {change}")
            
            entry_lines.extend(["", "---", ""])
            
            # Read existing content
            existing = self.changelog_path.read_text()
            
            # Insert new entry after header
            lines = existing.split('\n')
            header_end = 2  # After "# Prompt Library Changelog\n\n"
            
            new_lines = lines[:header_end] + entry_lines + lines[header_end:]
            
            self.changelog_path.write_text('\n'.join(new_lines))
            
            logger.info(f"Added changelog entry for {version_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to add changelog entry: {e}")
            return False
    
    def activate_version(self, version_id: str) -> bool:
        """
        Activate a specific version (make it the active library).
        
        Args:
            version_id: Version to activate
            
        Returns:
            True if successful
        """
        library = self.load_version(version_id)
        if library is None:
            logger.error(f"Cannot activate version {version_id}: not found")
            return False
        
        # Backup current active if it exists
        if self.active_path.exists():
            backup_path = self.active_path.with_suffix('.json.backup')
            shutil.copy2(self.active_path, backup_path)
            logger.info(f"Backed up current active to {backup_path}")
        
        # Activate new version
        success = self.save_active_library(library)
        if success:
            logger.info(f"Activated version {version_id}")
        
        return success
    
    def get_active_hash(self) -> Optional[str]:
        """
        Get hash of currently active library.
        
        Returns:
            Hash string, or None if no active library
        """
        library = self.load_active_library()
        if library is None:
            return None
        
        return self.compute_library_hash(library)
