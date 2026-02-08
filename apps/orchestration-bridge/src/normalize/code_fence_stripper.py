"""
Code fence stripper for markdown fences accidentally included in code files.
"""

import re
from pathlib import Path
from typing import Optional, Tuple


# Extensions that should be checked for code fences
CODE_EXTENSIONS = {
    ".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".yml", ".yaml",
    ".sql", ".ps1", ".sh", ".dockerfile", ".go", ".rs", ".java",
    ".c", ".cpp", ".h", ".hpp", ".cs", ".rb", ".php", ".swift",
    ".html", ".htm", ".css", ".scss", ".sass", ".less", ".xml", ".svg"
}


def is_probably_code_fence_wrapped(text: str) -> bool:
    r"""
    Detect if text appears to be wrapped in markdown code fences.
    
    Returns True if:
    - First non-empty line matches /^```[a-zA-Z0-9_-]*\s*$/
    - A closing ``` exists near the end
    
    Args:
        text: File content as string
        
    Returns:
        True if text appears to be fence-wrapped
    """
    lines = text.splitlines()
    if not lines:
        return False
    
    # Find first non-empty line
    first_line = None
    for line in lines:
        stripped = line.strip()
        if stripped:
            first_line = stripped
            break
    
    if not first_line:
        return False
    
    # Check if first line is a code fence
    # Pattern: ``` optionally followed by language identifier
    fence_pattern = re.compile(r'^```[a-zA-Z0-9_-]*\s*$')
    if not fence_pattern.match(first_line):
        return False
    
    # Check for closing fence near the end (within last 10 non-empty lines)
    last_nonempty_lines = []
    for line in reversed(lines):
        stripped = line.strip()
        if stripped:
            last_nonempty_lines.append(stripped)
        if len(last_nonempty_lines) >= 10:
            break
    
    # Look for closing fence
    closing_fence_pattern = re.compile(r'^```\s*$')
    for line in last_nonempty_lines:
        if closing_fence_pattern.match(line):
            return True
    
    return False


def strip_code_fences(text: str) -> Tuple[str, bool]:
    """
    Strip markdown code fences from text if present.
    
    Removes:
    - Opening fence line (first non-empty line matching ```language)
    - Closing fence line (last ``` before end)
    
    Args:
        text: File content as string
        
    Returns:
        Tuple of (stripped_text, was_modified)
    """
    if not is_probably_code_fence_wrapped(text):
        return text, False
    
    lines = text.splitlines(keepends=True)
    if not lines:
        return text, False
    
    # Find and remove opening fence
    opening_idx = None
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped:
            fence_pattern = re.compile(r'^```[a-zA-Z0-9_-]*\s*$')
            if fence_pattern.match(stripped):
                opening_idx = i
            break
    
    if opening_idx is None:
        return text, False
    
    # Find and remove closing fence (search from end)
    closing_idx = None
    closing_fence_pattern = re.compile(r'^```\s*$')
    for i in range(len(lines) - 1, opening_idx, -1):
        stripped = lines[i].strip()
        if stripped and closing_fence_pattern.match(stripped):
            closing_idx = i
            break
    
    if closing_idx is None:
        return text, False
    
    # Extract content between fences
    content_lines = lines[opening_idx + 1:closing_idx]
    
    # Preserve original line endings
    stripped_text = "".join(content_lines)
    
    return stripped_text, True


def should_check_file(filepath: Path) -> bool:
    """
    Determine if a file should be checked for code fences.
    
    Args:
        filepath: Path to file
        
    Returns:
        True if file should be checked
    """
    # Check extension
    if filepath.suffix.lower() not in CODE_EXTENSIONS:
        return False
    
    # Skip if file is too large (> 1MB)
    try:
        if filepath.stat().st_size > 1024 * 1024:
            return False
    except Exception:
        return False
    
    return True


def process_file(filepath: Path) -> Tuple[bool, Optional[str]]:
    """
    Process a single file to strip code fences if present.
    
    Args:
        filepath: Path to file
        
    Returns:
        Tuple of (was_modified, error_message)
    """
    if not should_check_file(filepath):
        return False, None
    
    try:
        # Try to read as text
        text = filepath.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        return False, f"Failed to read file: {e}"
    
    stripped_text, was_modified = strip_code_fences(text)
    
    if was_modified:
        try:
            filepath.write_text(stripped_text, encoding="utf-8")
            return True, None
        except Exception as e:
            return False, f"Failed to write file: {e}"
    
    return False, None
