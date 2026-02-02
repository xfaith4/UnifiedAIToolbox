"""
Transform logger for artifact normalization.

Provides structured JSON logging of all transformations applied during normalization.
"""

import json
import hashlib
from pathlib import Path
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict


@dataclass
class TransformEntry:
    """A single transformation entry."""
    action: str
    path_before: str
    path_after: Optional[str]
    reason: str
    hash_before: Optional[str] = None
    hash_after: Optional[str] = None


class TransformLogger:
    """Logs all transformations during normalization."""
    
    def __init__(self):
        self.entries: List[TransformEntry] = []
    
    def log(
        self,
        action: str,
        path_before: str,
        path_after: Optional[str],
        reason: str,
        content_before: Optional[bytes] = None,
        content_after: Optional[bytes] = None,
    ):
        """
        Log a transformation.
        
        Args:
            action: Type of transformation (e.g., "strip_fence", "split_blob", "relocate")
            path_before: Original path
            path_after: New path (if changed, else None)
            reason: Human-readable reason for the transformation
            content_before: Original content for hashing
            content_after: New content for hashing
        """
        hash_before = None
        hash_after = None
        
        if content_before is not None:
            hash_before = hashlib.sha256(content_before).hexdigest()[:16]
        
        if content_after is not None:
            hash_after = hashlib.sha256(content_after).hexdigest()[:16]
        
        entry = TransformEntry(
            action=action,
            path_before=path_before,
            path_after=path_after,
            reason=reason,
            hash_before=hash_before,
            hash_after=hash_after,
        )
        self.entries.append(entry)
    
    def get_summary(self) -> Dict[str, Any]:
        """Get summary statistics of transformations."""
        summary = {
            "total_transforms": len(self.entries),
            "by_action": {},
        }
        
        for entry in self.entries:
            action = entry.action
            summary["by_action"][action] = summary["by_action"].get(action, 0) + 1
        
        return summary
    
    def save_to_file(self, filepath: Path):
        """Save transformation log to JSON file."""
        data = {
            "summary": self.get_summary(),
            "transforms": [asdict(entry) for entry in self.entries],
        }
        
        filepath.write_text(json.dumps(data, indent=2), encoding="utf-8")
    
    def generate_markdown_report(self) -> str:
        """Generate a markdown report of all transformations."""
        lines = ["# Normalization Report\n"]
        
        summary = self.get_summary()
        lines.append(f"**Total Transformations:** {summary['total_transforms']}\n")
        
        if summary['by_action']:
            lines.append("## Transformations by Type\n")
            for action, count in sorted(summary['by_action'].items()):
                lines.append(f"- **{action}**: {count}")
            lines.append("")
        
        if self.entries:
            lines.append("## Detailed Log\n")
            for i, entry in enumerate(self.entries, 1):
                lines.append(f"### {i}. {entry.action}")
                lines.append(f"- **Path Before:** `{entry.path_before}`")
                if entry.path_after:
                    lines.append(f"- **Path After:** `{entry.path_after}`")
                lines.append(f"- **Reason:** {entry.reason}")
                if entry.hash_before:
                    lines.append(f"- **Hash Before:** `{entry.hash_before}`")
                if entry.hash_after:
                    lines.append(f"- **Hash After:** `{entry.hash_after}`")
                lines.append("")
        
        return "\n".join(lines)
