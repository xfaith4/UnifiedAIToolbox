"""
Orphan and weirdly-named file handler.

Detects suspicious filenames and relocates them to appropriate directories.
"""

import re
from pathlib import Path
from typing import Optional, Tuple


def is_suspicious_filename(filepath: Path) -> bool:
    """
    Detect if a filename is suspicious/orphaned.
    
    Suspicious patterns:
    - No extension AND short (< 15 chars) or punctuation-heavy
    - Contains commas, "e.g.", spaces-only names
    - Contains "not financial advice", watchlists, etc.
    
    Args:
        filepath: Path to file
        
    Returns:
        True if filename is suspicious
    """
    name = filepath.name
    stem = filepath.stem
    
    # Skip if it's a common valid filename without extension
    valid_no_ext = {
        "Dockerfile", "Makefile", "README", "LICENSE", "CHANGELOG",
        "Jenkinsfile", "Vagrantfile", ".gitignore", ".dockerignore",
        ".env", ".env.example", ".gitattributes"
    }
    if name in valid_no_ext or name.startswith("."):
        return False
    
    # Check for no extension with suspicious characteristics
    if not filepath.suffix:
        # Very short names (1-2 chars)
        if len(stem) <= 2:
            return True
        
        # Contains commas
        if "," in name:
            return True
        
        # Contains "e.g."
        if "e.g." in name.lower():
            return True
        
        # Mostly spaces or punctuation
        alpha_count = sum(c.isalnum() for c in name)
        if len(name) > 0 and alpha_count / len(name) < 0.5:
            return True
        
        # Contains suspicious phrases
        suspicious_phrases = [
            "not financial advice",
            "watchlist",
            "default timeframe",
            "example",
            "sample",
            "test data",
        ]
        name_lower = name.lower()
        for phrase in suspicious_phrases:
            if phrase in name_lower:
                return True
    
    # Check for other suspicious patterns
    # Multiple spaces
    if "  " in name:
        return True
    
    # Ends with punctuation
    if name and name[-1] in ".,;:!?":
        return True
    
    return False


def infer_file_type(content: str) -> Optional[str]:
    """
    Infer file type from content.
    
    Args:
        content: File content as string
        
    Returns:
        Inferred extension (with dot) or None
    """
    lines = content.strip().splitlines()
    if not lines:
        return None
    
    # Check first few lines for patterns
    sample = "\n".join(lines[:20])
    sample_lower = sample.lower()
    
    # Python
    if re.search(r'\b(import|def|class)\b', sample):
        return ".py"
    
    # JavaScript/TypeScript
    has_js_keywords = re.search(r'\b(export|import|const|let|var|function)\b', sample)
    if has_js_keywords:
        if "tsx" in sample_lower or "</" in sample:
            return ".tsx"
        elif "jsx" in sample_lower:
            return ".jsx"
        elif ":" in sample and re.search(r'\w+:\s*\w+', sample):
            # Has type annotations like "const myVar: string"
            return ".ts"
        elif re.search(r'\b(import|export)\b.*\bfrom\b', sample):
            # Has import/export with from
            return ".ts"
        else:
            return ".js"
    
    # SQL
    if re.search(r'\b(SELECT|CREATE TABLE|INSERT INTO|UPDATE|DELETE FROM)\b', sample, re.IGNORECASE):
        return ".sql"
    
    # YAML
    if re.match(r'^[\w-]+:\s*$', lines[0]) or "openapi:" in sample_lower:
        return ".yaml"
    
    # JSON
    if sample.strip().startswith(("{", "[")):
        return ".json"
    
    # Shell script
    if lines[0].startswith("#!") and ("bash" in lines[0] or "sh" in lines[0]):
        return ".sh"
    
    # PowerShell
    if re.search(r'\$\w+\s*=|Param\s*\(|function\s+\w+', sample):
        return ".ps1"
    
    # Markdown (if starts with # header)
    if lines[0].strip().startswith("#"):
        return ".md"
    
    return None


def sanitize_filename(name: str) -> str:
    """
    Sanitize a filename to make it filesystem-safe.
    
    Args:
        name: Original filename
        
    Returns:
        Sanitized filename
    """
    # Replace spaces with underscores
    name = name.replace(" ", "_")
    
    # Replace commas with underscores
    name = name.replace(",", "_")
    
    # Remove invalid characters
    name = re.sub(r'[<>:"/\\|?*]', '', name)
    
    # Remove leading/trailing dots and underscores
    name = name.strip("._")
    
    # Collapse multiple underscores
    name = re.sub(r'_+', '_', name)
    
    # Limit length
    if len(name) > 100:
        name = name[:100]
    
    # Ensure not empty
    if not name:
        name = "unnamed"
    
    return name


def classify_orphan(filepath: Path) -> Tuple[str, str]:
    """
    Classify an orphan file and suggest a destination.
    
    Args:
        filepath: Path to orphan file
        
    Returns:
        Tuple of (suggested_path, reason)
    """
    try:
        content = filepath.read_text(encoding="utf-8", errors="replace")
    except Exception:
        # Can't read file, move to orphaned
        safe_name = sanitize_filename(filepath.name) + ".txt"
        return f"orphaned/{safe_name}", "unreadable file"
    
    # Check if it looks like markdown documentation
    if content.strip().startswith("#") or "## " in content:
        safe_name = sanitize_filename(filepath.stem) + ".md"
        return f"docs/notes/{safe_name}", "markdown documentation"
    
    # Try to infer file type from content
    inferred_ext = infer_file_type(content)
    if inferred_ext:
        safe_name = sanitize_filename(filepath.stem) + inferred_ext
        
        # Determine destination based on type
        if inferred_ext in {".py"}:
            return f"backend/utils/{safe_name}", f"python code (inferred)"
        elif inferred_ext in {".ts", ".tsx", ".js", ".jsx"}:
            return f"frontend/src/utils/{safe_name}", f"frontend code (inferred)"
        elif inferred_ext in {".sql"}:
            return f"database/{safe_name}", f"SQL script (inferred)"
        elif inferred_ext in {".yaml", ".yml"}:
            return f"config/{safe_name}", f"YAML config (inferred)"
        elif inferred_ext in {".sh", ".ps1"}:
            return f"scripts/{safe_name}", f"script (inferred)"
        else:
            return f"orphaned/{safe_name}", f"code file (type: {inferred_ext})"
    
    # If still unclear, move to orphaned as txt
    safe_name = sanitize_filename(filepath.name) + ".txt"
    return f"orphaned/{safe_name}", "unknown content type"


def process_orphan_file(filepath: Path, base_dir: Path) -> Tuple[bool, Optional[str], str]:
    """
    Process an orphan file by relocating it.
    
    Args:
        filepath: Path to orphan file
        base_dir: Base directory for the repository
        
    Returns:
        Tuple of (was_relocated, new_path, reason)
    """
    if not is_suspicious_filename(filepath):
        return False, None, "filename looks valid"
    
    suggested_path, reason = classify_orphan(filepath)
    new_path = base_dir / suggested_path
    
    try:
        # Create parent directory
        new_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Move the file
        filepath.rename(new_path)
        
        return True, suggested_path, reason
        
    except Exception as e:
        return False, None, f"failed to relocate: {e}"
