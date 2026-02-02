"""
Validators for running sanity checks on normalized output.
"""

import subprocess
import json
import yaml
from pathlib import Path
from typing import Dict, Any, List, Tuple


class ValidationResult:
    """Result of a validation check."""
    
    def __init__(self, name: str, passed: bool, message: str = ""):
        self.name = name
        self.passed = passed
        self.message = message
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "passed": self.passed,
            "message": self.message
        }


def validate_python_syntax(base_dir: Path) -> ValidationResult:
    """
    Validate Python syntax using compileall.
    
    Args:
        base_dir: Base directory to check
        
    Returns:
        ValidationResult
    """
    # Find Python files
    py_files = list(base_dir.rglob("*.py"))
    if not py_files:
        return ValidationResult("python_syntax", True, "No Python files found")
    
    try:
        # Use python -m compileall
        result = subprocess.run(
            ["python3", "-m", "compileall", "-q", str(base_dir)],
            capture_output=True,
            text=True,
            timeout=30,
        )
        
        if result.returncode == 0:
            return ValidationResult(
                "python_syntax",
                True,
                f"All {len(py_files)} Python files compile successfully"
            )
        else:
            return ValidationResult(
                "python_syntax",
                False,
                f"Syntax errors found:\n{result.stdout}\n{result.stderr}"
            )
            
    except subprocess.TimeoutExpired:
        return ValidationResult("python_syntax", False, "Validation timed out")
    except FileNotFoundError:
        return ValidationResult("python_syntax", False, "python3 not available")
    except Exception as e:
        return ValidationResult("python_syntax", False, f"Validation failed: {e}")


def validate_package_json(base_dir: Path) -> ValidationResult:
    """
    Validate package.json structure.
    
    Args:
        base_dir: Base directory to check
        
    Returns:
        ValidationResult
    """
    package_json_files = list(base_dir.rglob("package.json"))
    
    if not package_json_files:
        return ValidationResult("package_json", True, "No package.json found")
    
    errors = []
    for pkg_file in package_json_files:
        try:
            data = json.loads(pkg_file.read_text(encoding="utf-8"))
            
            # Check required fields
            if "name" not in data:
                errors.append(f"{pkg_file.relative_to(base_dir)}: missing 'name'")
            
            if "scripts" in data and not isinstance(data["scripts"], dict):
                errors.append(f"{pkg_file.relative_to(base_dir)}: 'scripts' is not a dict")
                
        except json.JSONDecodeError as e:
            errors.append(f"{pkg_file.relative_to(base_dir)}: invalid JSON - {e}")
        except Exception as e:
            errors.append(f"{pkg_file.relative_to(base_dir)}: {e}")
    
    if errors:
        return ValidationResult("package_json", False, "\n".join(errors))
    else:
        return ValidationResult(
            "package_json",
            True,
            f"All {len(package_json_files)} package.json files valid"
        )


def validate_yaml_files(base_dir: Path) -> ValidationResult:
    """
    Validate YAML file syntax.
    
    Args:
        base_dir: Base directory to check
        
    Returns:
        ValidationResult
    """
    yaml_files = []
    for pattern in ["*.yml", "*.yaml"]:
        yaml_files.extend(base_dir.rglob(pattern))
    
    if not yaml_files:
        return ValidationResult("yaml_syntax", True, "No YAML files found")
    
    errors = []
    for yaml_file in yaml_files:
        try:
            yaml.safe_load(yaml_file.read_text(encoding="utf-8"))
        except yaml.YAMLError as e:
            errors.append(f"{yaml_file.relative_to(base_dir)}: {e}")
        except Exception as e:
            errors.append(f"{yaml_file.relative_to(base_dir)}: {e}")
    
    if errors:
        return ValidationResult("yaml_syntax", False, "\n".join(errors))
    else:
        return ValidationResult(
            "yaml_syntax",
            True,
            f"All {len(yaml_files)} YAML files valid"
        )


def validate_docker_compose(base_dir: Path) -> ValidationResult:
    """
    Validate docker-compose files.
    
    Args:
        base_dir: Base directory to check
        
    Returns:
        ValidationResult
    """
    compose_files = []
    for name in ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"]:
        compose_file = base_dir / name
        if compose_file.exists():
            compose_files.append(compose_file)
    
    if not compose_files:
        return ValidationResult("docker_compose", True, "No compose files found")
    
    errors = []
    for compose_file in compose_files:
        try:
            data = yaml.safe_load(compose_file.read_text(encoding="utf-8"))
            
            if not isinstance(data, dict):
                errors.append(f"{compose_file.name}: root is not a dict")
                continue
            
            if "services" not in data:
                errors.append(f"{compose_file.name}: missing 'services' key")
            elif not isinstance(data["services"], dict):
                errors.append(f"{compose_file.name}: 'services' is not a dict")
            elif len(data["services"]) == 0:
                errors.append(f"{compose_file.name}: no services defined")
                
        except yaml.YAMLError as e:
            errors.append(f"{compose_file.name}: YAML error - {e}")
        except Exception as e:
            errors.append(f"{compose_file.name}: {e}")
    
    if errors:
        return ValidationResult("docker_compose", False, "\n".join(errors))
    else:
        return ValidationResult(
            "docker_compose",
            True,
            f"All {len(compose_files)} compose files valid"
        )


def run_all_validations(base_dir: Path) -> Tuple[bool, List[ValidationResult]]:
    """
    Run all validation checks.
    
    Args:
        base_dir: Base directory to validate
        
    Returns:
        Tuple of (all_passed, list_of_results)
    """
    results = [
        validate_python_syntax(base_dir),
        validate_package_json(base_dir),
        validate_yaml_files(base_dir),
        validate_docker_compose(base_dir),
    ]
    
    all_passed = all(r.passed for r in results)
    
    return all_passed, results
