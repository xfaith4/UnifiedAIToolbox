"""
File system utilities for the Orchestration Bridge.

This module provides helper functions for common file operations,
including reading/writing YAML/JSON files, path manipulation, and file validation.
"""
import json
import logging
import os
import shutil
import tempfile
import yaml
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Union, TypeVar, Type, TypeVar

from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Type variable for generic model parsing
T = TypeVar('T', bound=BaseModel)

def ensure_directory(path: Union[str, Path]) -> Path:
    """Ensure a directory exists, creating it if necessary.
    
    Args:
        path: Path to the directory
        
    Returns:
        Path: The resolved directory path
    """
    path = Path(path).resolve()
    path.mkdir(parents=True, exist_ok=True)
    return path

def read_json_file(path: Union[str, Path]) -> Dict[str, Any]:
    """Read a JSON file and return its contents as a dictionary.
    
    Args:
        path: Path to the JSON file
        
    Returns:
        Dict containing the parsed JSON data
        
    Raises:
        FileNotFoundError: If the file doesn't exist
        json.JSONDecodeError: If the file contains invalid JSON
    """
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {path}")
        
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def write_json_file(
    data: Any, 
    path: Union[str, Path], 
    indent: int = 2,
    ensure_ascii: bool = False
) -> Path:
    """Write data to a JSON file.
    
    Args:
        data: Data to serialize to JSON
        path: Path to the output file
        indent: Number of spaces for indentation
        ensure_ascii: If True, escape non-ASCII characters
        
    Returns:
        Path: The path to the written file
    """
    path = Path(path)
    ensure_directory(path.parent)
    
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(
            data, 
            f, 
            indent=indent, 
            ensure_ascii=ensure_ascii,
            default=_json_serializer
        )
    return path

def read_yaml_file(path: Union[str, Path]) -> Dict[str, Any]:
    """Read a YAML file and return its contents as a dictionary.
    
    Args:
        path: Path to the YAML file
        
    Returns:
        Dict containing the parsed YAML data
        
    Raises:
        FileNotFoundError: If the file doesn't exist
        yaml.YAMLError: If the file contains invalid YAML
    """
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {path}")
        
    with open(path, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)

def write_yaml_file(
    data: Any, 
    path: Union[str, Path],
    default_flow_style: bool = False,
    sort_keys: bool = False
) -> Path:
    """Write data to a YAML file.
    
    Args:
        data: Data to serialize to YAML
        path: Path to the output file
        default_flow_style: Whether to use flow style for collections
        sort_keys: Whether to sort dictionary keys
        
    Returns:
        Path: The path to the written file
    """
    path = Path(path)
    ensure_directory(path.parent)
    
    with open(path, 'w', encoding='utf-8') as f:
        yaml.dump(
            data, 
            f, 
            default_flow_style=default_flow_style,
            sort_keys=sort_keys,
            allow_unicode=True
        )
    return path

def read_model_file(path: Union[str, Path], model: Type[T]) -> T:
    """Read a file and parse it into a Pydantic model.
    
    Args:
        path: Path to the file (JSON or YAML)
        model: Pydantic model class to parse into
        
    Returns:
        An instance of the specified model
        
    Raises:
        ValueError: If the file extension is not .json or .yaml/.yml
    """
    path = Path(path)
    suffix = path.suffix.lower()
    
    if suffix == '.json':
        data = read_json_file(path)
    elif suffix in ('.yaml', '.yml'):
        data = read_yaml_file(path)
    else:
        raise ValueError(f"Unsupported file format: {suffix}")
    
    return model.parse_obj(data)

def write_model_file(
    model: BaseModel, 
    path: Union[str, Path], 
    **kwargs
) -> Path:
    """Write a Pydantic model to a file.
    
    Args:
        model: Pydantic model instance
        path: Path to the output file
        **kwargs: Additional arguments passed to write_json_file or write_yaml_file
        
    Returns:
        Path: The path to the written file
    """
    path = Path(path)
    suffix = path.suffix.lower()
    
    if suffix == '.json':
        return write_json_file(model.model_dump(), path, **kwargs)
    elif suffix in ('.yaml', '.yml'):
        return write_yaml_file(model.model_dump(), path, **kwargs)
    else:
        raise ValueError(f"Unsupported file format: {suffix}")

def _json_serializer(obj: Any) -> Any:
    """Custom JSON serializer for objects not serializable by default."""
    if isinstance(obj, (datetime, )):
        return obj.isoformat()
    elif isinstance(obj, Path):
        return str(obj)
    elif hasattr(obj, 'dict'):
        return obj.model_dump()
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")

def find_files(
    directory: Union[str, Path],
    pattern: str = "*",
    recursive: bool = True
) -> List[Path]:
    """Find files matching a glob pattern in a directory.
    
    Args:
        directory: Directory to search in
        pattern: Glob pattern to match
        recursive: Whether to search recursively
        
    Returns:
        List of matching file paths
    """
    directory = Path(directory)
    if not directory.is_dir():
        return []
        
    if recursive:
        return list(directory.rglob(pattern))
    return list(directory.glob(pattern))

def create_temp_file(
    content: Optional[str] = None,
    suffix: Optional[str] = None,
    directory: Optional[Union[str, Path]] = None
) -> Path:
    """Create a temporary file with optional content.
    
    Args:
        content: Optional content to write to the file
        suffix: Optional file suffix (e.g., '.json', '.yaml')
        directory: Optional directory to create the file in
        
    Returns:
        Path to the created temporary file
    """
    if directory is not None:
        directory = Path(directory)
        directory.mkdir(parents=True, exist_ok=True)
    
    with tempfile.NamedTemporaryFile(
        mode='w+',
        suffix=suffix or '',
        dir=str(directory) if directory else None,
        delete=False,
        encoding='utf-8'
    ) as f:
        if content is not None:
            f.write(content)
        return Path(f.name)

def atomic_write(
    content: str,
    path: Union[str, Path],
    mode: str = 'w',
    encoding: str = 'utf-8'
) -> None:
    """Atomically write content to a file.
    
    This ensures that the file is either completely written or not at all,
    preventing partial writes in case of errors.
    
    Args:
        content: Content to write
        path: Path to the output file
        mode: File open mode
        encoding: File encoding
    """
    path = Path(path)
    temp_path = path.with_suffix(f".{os.getpid()}.tmp")
    
    try:
        with open(temp_path, mode, encoding=encoding) as f:
            f.write(content)
        
        # On Windows, we need to remove the destination file first if it exists
        if os.name == 'nt' and path.exists():
            os.replace(temp_path, path)
        else:
            shutil.move(temp_path, path)
    except Exception:
        # Clean up the temp file if something went wrong
        if temp_path.exists():
            try:
                temp_path.unlink()
            except OSError:
                pass
        raise
