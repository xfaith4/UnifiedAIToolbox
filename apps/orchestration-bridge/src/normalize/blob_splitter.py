"""
Blob splitter for detecting and splitting multi-file blobs.

Detects files that contain multiple sections like:
- File: backend/Dockerfile
- --- filename ---
- ### BEGIN FILE: path
"""

import re
from pathlib import Path
from typing import List, Tuple, Optional, Dict


# Patterns for multi-file markers
FILE_MARKERS = [
    # "File: path/to/file" or "file: path/to/file"
    (re.compile(r'^[Ff]ile:\s*(.+?)\s*$'), "file_colon"),
    # "--- filename ---"
    (re.compile(r'^---\s*(.+?)\s*---\s*$'), "triple_dash"),
    # "### BEGIN FILE: path"
    (re.compile(r'^###\s*BEGIN\s+FILE:\s*(.+?)\s*$'), "begin_file"),
    # "// File: path" or "# File: path"
    (re.compile(r'^[/#]+\s*[Ff]ile:\s*(.+?)\s*$'), "comment_file"),
]


def detect_bundled_blob(text: str) -> bool:
    """
    Detect if text contains bundled multi-file sections.
    
    Returns True if multiple file markers are found.
    
    Args:
        text: File content as string
        
    Returns:
        True if text appears to be a bundled blob
    """
    lines = text.splitlines()
    marker_count = 0
    
    for line in lines:
        stripped = line.strip()
        for pattern, _ in FILE_MARKERS:
            if pattern.match(stripped):
                marker_count += 1
                if marker_count >= 2:
                    return True
    
    return False


def split_bundled_blob(text: str) -> List[Tuple[str, str]]:
    """
    Split a bundled blob into individual files.
    
    Args:
        text: File content as string
        
    Returns:
        List of tuples (filepath, content)
    """
    lines = text.splitlines(keepends=True)
    files: List[Tuple[str, str]] = []
    current_path: Optional[str] = None
    current_lines: List[str] = []
    
    for line in lines:
        stripped = line.strip()
        found_marker = False
        
        # Check if this line is a file marker
        for pattern, marker_type in FILE_MARKERS:
            match = pattern.match(stripped)
            if match:
                # Save previous file if any
                if current_path and current_lines:
                    content = "".join(current_lines)
                    files.append((current_path, content))
                
                # Start new file
                current_path = match.group(1).strip()
                current_lines = []
                found_marker = True
                break
        
        # Add line to current file content (skip marker line itself)
        if not found_marker and current_path:
            current_lines.append(line)
    
    # Save last file
    if current_path and current_lines:
        content = "".join(current_lines)
        files.append((current_path, content))
    
    return files


def sanitize_extracted_path(path: str) -> str:
    """
    Sanitize an extracted file path.
    
    Args:
        path: Extracted path from blob marker
        
    Returns:
        Sanitized path
    """
    # Remove quotes
    path = path.strip('\'"')
    
    # Replace backslashes with forward slashes
    path = path.replace("\\", "/")
    
    # Remove leading slashes
    path = path.lstrip("/")
    
    # Remove any dangerous patterns
    parts = path.split("/")
    safe_parts = []
    for part in parts:
        # Skip empty parts, ".", and ".."
        if part and part != "." and part != "..":
            # Remove any remaining special characters from filename
            part = re.sub(r'[<>:"|?*]', '_', part)
            safe_parts.append(part)
    
    return "/".join(safe_parts) if safe_parts else "extracted.txt"


def process_blob_file(filepath: Path, output_dir: Path) -> Tuple[bool, List[str], Optional[str]]:
    """
    Process a potential blob file and split it if needed.
    
    Args:
        filepath: Path to potential blob file
        output_dir: Directory to write extracted files
        
    Returns:
        Tuple of (was_split, extracted_paths, error_message)
    """
    try:
        text = filepath.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        return False, [], f"Failed to read file: {e}"
    
    if not detect_bundled_blob(text):
        return False, [], None
    
    try:
        files = split_bundled_blob(text)
        extracted_paths = []
        
        for raw_path, content in files:
            # Sanitize the path
            safe_path = sanitize_extracted_path(raw_path)
            full_path = output_dir / safe_path
            
            # Create parent directories
            full_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Write the file
            full_path.write_text(content.strip() + "\n", encoding="utf-8")
            extracted_paths.append(safe_path)
        
        # Create a stub note in place of the original blob
        stub_content = (
            f"# This file was a bundled multi-file blob\n\n"
            f"Extracted {len(files)} files:\n"
        )
        for path in extracted_paths:
            stub_content += f"- {path}\n"
        
        filepath.write_text(stub_content, encoding="utf-8")
        
        return True, extracted_paths, None
        
    except Exception as e:
        return False, [], f"Failed to split blob: {e}"


def should_check_for_blob(filepath: Path) -> bool:
    """
    Determine if a file should be checked for bundled blobs.
    
    Args:
        filepath: Path to file
        
    Returns:
        True if file should be checked
    """
    # Check common blob filenames
    blob_names = {
        "docker-compose.yml",
        "docker-compose.yaml", 
        "compose.yml",
        "compose.yaml",
        "deployment.yml",
        "deployment.yaml",
        "all-files.txt",
        "combined.txt",
        "bundle.txt",
    }
    
    if filepath.name.lower() in blob_names:
        return True
    
    # Check for large text files (potential blobs)
    if filepath.suffix.lower() in {".txt", ".md", ".yml", ".yaml"}:
        try:
            if filepath.stat().st_size > 10 * 1024:  # > 10KB
                return True
        except Exception:
            pass
    
    return False
