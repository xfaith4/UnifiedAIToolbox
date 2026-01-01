"""
Configuration settings for the Orchestration Bridge service.

This module provides configuration management using environment variables with sensible defaults.
"""
from pathlib import Path
from typing import Optional, Dict, Any
from pydantic import BaseSettings, Field, validator
import logging
import os


class Settings(BaseSettings):
    """Application settings with environment variable overrides."""
    
    # Core settings
    log_level: str = Field(
        default="INFO",
        description="Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)"
    )
    
    poll_interval: int = Field(
        default=60,
        description="Polling interval in seconds for checking updates"
    )
    
    review_interval_hours: int = Field(
        default=24,
        description="Minimum hours between reviews for the same prompt"
    )
    
    # Paths
    base_dir: Path = Field(
        default=Path(__file__).parent.parent,
        description="Base directory for the application"
    )
    
    runs_dir: Path = Field(
        default_factory=lambda: Path(__file__).parent.parent / "runs",
        description="Directory for storing run manifests"
    )
    
    runbooks_dir: Path = Field(
        default_factory=lambda: Path(__file__).parent.parent / "runbooks",
        description="Directory for storing runbooks"
    )
    
    state_dir: Path = Field(
        default_factory=lambda: Path(__file__).parent.parent / "state",
        description="Directory for storing state files"
    )

    mcp_registry_path: Path = Field(
        default_factory=lambda: Path(__file__).resolve().parents[3] / "data" / "mcp" / "servers.json",
        description="Path to the MCP server registry used by orchestration agents"
    )
    
    # API settings
    prompt_api_url: str = Field(
        default="http://localhost:8000",
        description="Base URL for the Prompt API"
    )
    
    api_timeout: int = Field(
        default=30,
        description="Timeout in seconds for API requests"
    )
    
    # Codex settings
    codex_enabled: bool = Field(
        default=False,
        description="Enable/disable Codex integration"
    )
    
    codex_max_parallel: int = Field(
        default=3,
        description="Maximum number of parallel Codex tasks"
    )
    
    # Supervisor settings
    supervisor_queue_dir: Path = Field(
        default_factory=lambda: Path(__file__).parent.parent / "supervisor_tasks",
        description="Directory for supervisor task queue"
    )
    
    # Validation
    @validator('runs_dir', 'runbooks_dir', 'state_dir', 'supervisor_queue_dir', pre=True)
    def ensure_directories_exist(cls, v: Path) -> Path:
        """Ensure the directory exists."""
        v.mkdir(parents=True, exist_ok=True)
        return v

    @validator('mcp_registry_path', pre=True)
    def ensure_registry_parent(cls, v: Path) -> Path:
        """Ensure the MCP registry directory exists and expand user paths."""
        path = Path(v).expanduser()
        path.parent.mkdir(parents=True, exist_ok=True)
        return path
    
    @validator('log_level')
    def validate_log_level(cls, v: str) -> str:
        """Validate the log level is valid."""
        valid_levels = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']
        if v.upper() not in valid_levels:
            raise ValueError(f"Invalid log level: {v}. Must be one of {valid_levels}")
        return v.upper()
    
    class Config:
        env_prefix = "BRIDGE_"
        case_sensitive = False
        env_file = ".env"
        env_file_encoding = "utf-8"


# Global settings instance
settings = Settings()


def configure_logging(log_level: Optional[str] = None) -> None:
    """Configure logging with the specified log level."""
    level = getattr(logging, (log_level or settings.log_level).upper())
    logging.basicConfig(
        level=level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # Set log level for external libraries
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("requests").setLevel(logging.WARNING)


# Initialize logging
configure_logging()


if __name__ == "__main__":
    # Print current configuration for debugging
    import json
    from pydantic.json import pydantic_encoder
    
    print("Current configuration:")
    print(json.dumps(settings.dict(), indent=2, default=pydantic_encoder))
