"""
Data models for the Orchestration Bridge service.

This module defines the core data structures used throughout the application.
"""
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional, Any, Union
from pydantic import BaseModel, Field, HttpUrl, validator


class PromptSpec(BaseModel):
    """Represents a prompt specification."""
    id: str = Field(..., description="Unique identifier for the prompt")
    version: str = Field(..., description="Version of the prompt")
    path: Path = Field(..., description="Filesystem path to the prompt definition")
    raw: Dict[str, Any] = Field(default_factory=dict, description="Raw prompt data")
    
    class Config:
        arbitrary_types_allowed = True
        json_encoders = {
            Path: str
        }


class RunStatus(str, Enum):
    """Status of a run."""
    QUEUED = "queued"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class RunManifest(BaseModel):
    """Manifest for a run."""
    run_id: str = Field(..., description="Unique identifier for the run")
    prompt_id: str = Field(..., description="ID of the prompt being run")
    version: str = Field(..., description="Version of the prompt")
    source_path: Path = Field(..., description="Path to the source prompt definition")
    requested_at: datetime = Field(default_factory=datetime.utcnow, description="When the run was requested")
    status: RunStatus = Field(default=RunStatus.QUEUED, description="Current status of the run")
    review_policy: str = Field(default="default", description="Review policy for the run")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata for the run")
    
    @validator('requested_at', pre=True)
    def parse_requested_at(cls, v):
        if isinstance(v, str):
            return datetime.fromisoformat(v.replace('Z', '+00:00'))
        return v
    
    class Config:
        json_encoders = {
            Path: str,
            datetime: lambda v: v.isoformat()
        }


class ReviewResult(BaseModel):
    """Result of a review."""
    status: str = Field(..., description="Review status (e.g., 'approved', 'rejected')")
    reviewers: List[str] = Field(default_factory=list, description="List of reviewers")
    notes: Optional[str] = Field(None, description="Review notes")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="When the review was performed")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional review metadata")


class CodexTask(BaseModel):
    """Codex task configuration."""
    task_id: str = Field(..., description="Unique identifier for the task")
    prompt_id: str = Field(..., description="ID of the prompt being processed")
    work_dir: Path = Field(..., description="Working directory for the task")
    max_parallel: int = Field(default=3, description="Maximum parallel tasks")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="Task parameters")
    
    class Config:
        json_encoders = {
            Path: str
        }


class SupervisorTask(BaseModel):
    """Supervisor task configuration."""
    task_id: str = Field(..., description="Unique identifier for the task")
    action: str = Field(..., description="Action to perform")
    target: str = Field(..., description="Target of the action")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="Task parameters")
    status: str = Field(default="queued", description="Current status of the task")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="When the task was created")
    started_at: Optional[datetime] = Field(None, description="When the task was started")
    completed_at: Optional[datetime] = Field(None, description="When the task was completed")
    result: Optional[Dict[str, Any]] = Field(None, description="Task result")
    error: Optional[str] = Field(None, description="Error message if the task failed")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }


class TelemetryData(BaseModel):
    """Telemetry data for monitoring and analytics."""
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="When the telemetry data was recorded")
    event_type: str = Field(..., description="Type of event")
    event_data: Dict[str, Any] = Field(default_factory=dict, description="Event-specific data")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
