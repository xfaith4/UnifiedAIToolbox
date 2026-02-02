"""
Docker Compose fixer for rewriting invalid compose files.
"""

import re
import yaml
from pathlib import Path
from typing import Optional, Dict, Any, Tuple, List


def is_valid_compose_yaml(filepath: Path) -> Tuple[bool, Optional[str]]:
    """
    Check if a docker-compose file is valid YAML with required structure.
    
    Args:
        filepath: Path to docker-compose file
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    try:
        content = filepath.read_text(encoding="utf-8")
        data = yaml.safe_load(content)
        
        if not isinstance(data, dict):
            return False, "Root element is not a dict"
        
        if "services" not in data:
            return False, "Missing 'services' key"
        
        if not isinstance(data["services"], dict):
            return False, "'services' is not a dict"
        
        return True, None
        
    except yaml.YAMLError as e:
        return False, f"YAML parse error: {e}"
    except Exception as e:
        return False, f"Failed to read file: {e}"


def extract_dockerfile_sections(content: str) -> List[Tuple[str, str]]:
    """
    Extract Dockerfile sections from a compose blob.
    
    Args:
        content: Compose file content
        
    Returns:
        List of tuples (suggested_path, dockerfile_content)
    """
    sections = []
    lines = content.splitlines()
    
    # Pattern for detecting Dockerfile sections
    dockerfile_patterns = [
        (re.compile(r'^#*\s*(?:File|file):\s*(.*/Dockerfile.*?)\s*$'), "explicit"),
        (re.compile(r'^#*\s*Dockerfile\s*-\s*(.+?)\s*$'), "labeled"),
    ]
    
    current_path = None
    current_lines = []
    in_dockerfile = False
    
    for line in lines:
        stripped = line.strip()
        
        # Check for section marker
        found_marker = False
        for pattern, _ in dockerfile_patterns:
            match = pattern.match(stripped)
            if match:
                # Save previous section
                if current_path and current_lines:
                    dockerfile_content = "\n".join(current_lines)
                    sections.append((current_path, dockerfile_content))
                
                # Start new section
                current_path = match.group(1)
                current_lines = []
                in_dockerfile = True
                found_marker = True
                break
        
        # Check if line looks like Dockerfile start
        if not found_marker and stripped.startswith("FROM "):
            if not in_dockerfile:
                # Infer path
                current_path = "Dockerfile"
                current_lines = [line]
                in_dockerfile = True
                continue
        
        # Add line to current section
        if in_dockerfile and not found_marker:
            # Check if we've reached end of dockerfile
            if stripped.startswith("---") or (
                stripped.startswith("#") and "File:" in stripped
            ):
                # Save and reset
                if current_path and current_lines:
                    dockerfile_content = "\n".join(current_lines)
                    sections.append((current_path, dockerfile_content))
                current_path = None
                current_lines = []
                in_dockerfile = False
            else:
                current_lines.append(line)
    
    # Save last section
    if current_path and current_lines:
        dockerfile_content = "\n".join(current_lines)
        sections.append((current_path, dockerfile_content))
    
    return sections


def create_minimal_compose(backend_exists: bool, frontend_exists: bool) -> str:
    """
    Create a minimal valid docker-compose.yml.
    
    Args:
        backend_exists: Whether backend service should be included
        frontend_exists: Whether frontend service should be included
        
    Returns:
        YAML content for docker-compose.yml
    """
    services = {}
    
    if backend_exists:
        services["backend"] = {
            "build": {
                "context": "./backend",
                "dockerfile": "Dockerfile"
            },
            "ports": ["8000:8000"],
            "environment": ["PORT=8000"]
        }
    
    if frontend_exists:
        services["frontend"] = {
            "build": {
                "context": "./frontend",
                "dockerfile": "Dockerfile"
            },
            "ports": ["3000:3000"],
            "environment": ["PORT=3000"]
        }
    
    compose = {
        "version": "3.8",
        "services": services
    }
    
    return yaml.dump(compose, default_flow_style=False, sort_keys=False)


def fix_compose_file(filepath: Path, base_dir: Path) -> Tuple[bool, List[str], Optional[str]]:
    """
    Fix an invalid docker-compose file.
    
    Args:
        filepath: Path to docker-compose file
        base_dir: Base directory of repository
        
    Returns:
        Tuple of (was_fixed, extracted_files, error_message)
    """
    is_valid, error = is_valid_compose_yaml(filepath)
    if is_valid:
        return False, [], None
    
    try:
        content = filepath.read_text(encoding="utf-8")
        
        # Extract any Dockerfile sections
        dockerfiles = extract_dockerfile_sections(content)
        extracted = []
        
        for path, dockerfile_content in dockerfiles:
            # Sanitize path
            path = path.replace("\\", "/").strip("/")
            full_path = base_dir / path
            
            # Create parent directory
            full_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Write Dockerfile
            full_path.write_text(dockerfile_content + "\n", encoding="utf-8")
            extracted.append(path)
        
        # Create a clean compose file
        backend_dir = base_dir / "backend"
        frontend_dir = base_dir / "frontend"
        
        backend_exists = backend_dir.exists() and any(backend_dir.rglob("*.py"))
        frontend_exists = frontend_dir.exists() and any(
            frontend_dir.rglob("*.ts") or frontend_dir.rglob("*.tsx")
        )
        
        new_compose = create_minimal_compose(backend_exists, frontend_exists)
        filepath.write_text(new_compose, encoding="utf-8")
        
        return True, extracted, None
        
    except Exception as e:
        return False, [], f"Failed to fix compose file: {e}"
