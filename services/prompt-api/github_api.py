"""
GitHub Integration API Endpoints

FastAPI endpoints for repository cloning, searching, and Codex swarm execution.
"""

import logging
import sys
from pathlib import Path
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import json

# Add orchestration-bridge to path
ROOT_DIR = Path(__file__).parent.parent.parent
BRIDGE_DIR = ROOT_DIR / "apps" / "orchestration-bridge"
sys.path.insert(0, str(BRIDGE_DIR))

try:
    from github_integration.clone_service import GitHubCloneService, RepositoryCloneError
    from github_integration.codex_service import CodexSwarmService, CodexRunStatus
    from github_integration.pr_service import GitHubPRService, PRCreationError
except ImportError as e:
    raise ImportError(f"Failed to import GitHub services: {e}")

logger = logging.getLogger(__name__)

# Initialize services
github_service = None
codex_service = None
pr_service = None

router = APIRouter(prefix="/github", tags=["GitHub Integration"])


# Pydantic Models
class RepositorySearchRequest(BaseModel):
    """Request model for repository search."""
    query: str = Field(..., description="Search query")
    limit: int = Field(default=20, ge=1, le=100, description="Maximum results")


class RepositoryMetadata(BaseModel):
    """Repository metadata response model."""
    full_name: str
    description: str
    stars: int
    forks: int
    language: str
    size: int
    default_branch: str
    html_url: str
    clone_url: str
    private: bool
    archived: bool
    topics: List[str] = []


class CloneRequest(BaseModel):
    """Request model for cloning a repository."""
    repo_url: str = Field(..., description="Repository URL or owner/repo format")
    branch: Optional[str] = Field(default=None, description="Branch to clone")
    clone_id: Optional[str] = Field(default=None, description="Custom clone identifier")


class CloneResponse(BaseModel):
    """Response model for clone operation."""
    clone_id: str
    clone_path: str
    status: str
    message: str


class CodexRunRequest(BaseModel):
    """Request model for starting a Codex run."""
    repo_path: str = Field(..., description="Path to the cloned repository")
    model: str = Field(default="gpt-4", description="AI model to use")
    max_parallel: int = Field(default=3, ge=1, le=10, description="Max parallel agents")


class CodexRunResponse(BaseModel):
    """Response model for Codex run."""
    run_id: str
    status: str
    message: str


class CodexRunStatus(BaseModel):
    """Status of a Codex run."""
    run_id: str
    status: str
    repo_path: str
    model: str
    start_time: str
    end_time: Optional[str]
    findings_count: Optional[int]
    log_file: str


def get_github_service() -> GitHubCloneService:
    """Get or initialize the GitHub service."""
    global github_service
    if github_service is None:
        github_service = GitHubCloneService()
    return github_service


def get_codex_service() -> CodexSwarmService:
    """Get or initialize the Codex service."""
    global codex_service
    if codex_service is None:
        codex_service = CodexSwarmService()
    return codex_service


@router.get("/search", response_model=List[Dict[str, Any]])
async def search_repositories(
    query: str = Query(..., description="Search query"),
    limit: int = Query(20, ge=1, le=100, description="Maximum results")
):
    """
    Search for GitHub repositories.
    
    Example: /github/search?query=machine+learning&limit=10
    """
    try:
        service = get_github_service()
        results = service.search_repositories(query=query, limit=limit)
        return results
    except RepositoryCloneError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Repository search failed: {e}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@router.get("/repo/{owner}/{repo}", response_model=RepositoryMetadata)
async def get_repository_metadata(
    owner: str,
    repo: str
):
    """
    Get metadata for a specific GitHub repository.
    
    Example: /github/repo/microsoft/vscode
    """
    try:
        service = get_github_service()
        metadata = service.get_repo_metadata(owner=owner, repo_name=repo)
        return metadata
    except RepositoryCloneError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to fetch repository metadata: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/clone", response_model=CloneResponse)
async def clone_repository(request: CloneRequest):
    """
    Clone a GitHub repository.
    
    Example body:
    {
        "repo_url": "https://github.com/microsoft/vscode",
        "branch": "main",
        "clone_id": "my-analysis-001"
    }
    """
    try:
        service = get_github_service()
        
        # Track progress (could be enhanced with WebSocket for real-time updates)
        progress_updates = []
        
        def progress_callback(progress: Dict[str, Any]):
            progress_updates.append(progress)
            logger.info(f"Clone progress: {progress}")
        
        clone_path = service.clone_repository(
            repo_url=request.repo_url,
            branch=request.branch,
            progress_callback=progress_callback,
            clone_id=request.clone_id
        )
        
        return CloneResponse(
            clone_id=request.clone_id or clone_path.name,
            clone_path=str(clone_path),
            status="success",
            message=f"Repository cloned successfully to {clone_path}"
        )
    except RepositoryCloneError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Clone operation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Clone failed: {str(e)}")


@router.get("/clone/{clone_id}/branches")
async def list_branches(clone_id: str):
    """
    List branches in a cloned repository.
    
    Example: /github/clone/my-analysis-001/branches
    """
    try:
        service = get_github_service()
        clone_path = service.clone_base_dir / clone_id
        
        if not clone_path.exists():
            raise HTTPException(status_code=404, detail="Clone not found")
        
        branches = service.list_branches(clone_path)
        return {"clone_id": clone_id, "branches": branches}
    except Exception as e:
        logger.error(f"Failed to list branches: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/clone/{clone_id}/tree")
async def get_file_tree(clone_id: str, max_depth: int = Query(3, ge=1, le=5)):
    """
    Get file tree of a cloned repository.
    
    Example: /github/clone/my-analysis-001/tree?max_depth=3
    """
    try:
        service = get_github_service()
        clone_path = service.clone_base_dir / clone_id
        
        if not clone_path.exists():
            raise HTTPException(status_code=404, detail="Clone not found")
        
        tree = service.get_file_tree(clone_path, max_depth=max_depth)
        return tree
    except Exception as e:
        logger.error(f"Failed to get file tree: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/clone/{clone_id}")
async def cleanup_clone(clone_id: str):
    """
    Delete a cloned repository.
    
    Example: DELETE /github/clone/my-analysis-001
    """
    try:
        service = get_github_service()
        clone_path = service.clone_base_dir / clone_id
        
        if not clone_path.exists():
            raise HTTPException(status_code=404, detail="Clone not found")
        
        success = service.cleanup_clone(clone_path)
        
        if success:
            return {"status": "success", "message": f"Clone {clone_id} deleted"}
        else:
            raise HTTPException(status_code=500, detail="Failed to delete clone")
    except Exception as e:
        logger.error(f"Failed to cleanup clone: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/codex/run", response_model=CodexRunResponse)
async def start_codex_run(request: CodexRunRequest, background_tasks: BackgroundTasks):
    """
    Start a Codex swarm analysis on a cloned repository.
    
    Example body:
    {
        "repo_path": "/tmp/github_clones/vscode_20231117",
        "model": "gpt-4",
        "max_parallel": 3
    }
    """
    try:
        service = get_codex_service()
        repo_path = Path(request.repo_path)
        
        if not repo_path.exists():
            raise HTTPException(status_code=404, detail="Repository path not found")
        
        # Start the run
        run_id = await service.start_codex_run(
            repo_path=repo_path,
            model=request.model,
            max_parallel=request.max_parallel
        )
        
        return CodexRunResponse(
            run_id=run_id,
            status="started",
            message=f"Codex run {run_id} started"
        )
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to start Codex run: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/codex/run/{run_id}/stream")
async def stream_codex_run(run_id: str):
    """
    Stream the execution of a Codex run.
    
    Returns Server-Sent Events (SSE) with progress updates.
    
    Example: /github/codex/run/abc123/stream
    """
    try:
        service = get_codex_service()
        
        async def event_generator():
            try:
                async for update in service.execute_codex_run(run_id):
                    # Format as SSE
                    yield f"data: {json.dumps(update)}\n\n"
            except Exception as e:
                error_data = {
                    'error': str(e),
                    'run_id': run_id,
                    'status': 'error'
                }
                yield f"data: {json.dumps(error_data)}\n\n"
        
        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream"
        )
    except Exception as e:
        logger.error(f"Failed to stream Codex run: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/codex/run/{run_id}/status")
async def get_codex_run_status(run_id: str):
    """
    Get the status of a Codex run.
    
    Example: /github/codex/run/abc123/status
    """
    try:
        service = get_codex_service()
        status = service.get_run_status(run_id)
        
        if status is None:
            raise HTTPException(status_code=404, detail="Run not found")
        
        return status
    except Exception as e:
        logger.error(f"Failed to get run status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/codex/runs")
async def list_codex_runs():
    """
    List all Codex runs.
    
    Example: /github/codex/runs
    """
    try:
        service = get_codex_service()
        runs = service.list_runs()
        return {"runs": runs, "count": len(runs)}
    except Exception as e:
        logger.error(f"Failed to list runs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/codex/run/{run_id}/findings")
async def get_codex_findings(run_id: str):
    """
    Get findings from a completed Codex run.
    
    Example: /github/codex/run/abc123/findings
    """
    try:
        service = get_codex_service()
        findings = service.get_findings(run_id)
        return {"run_id": run_id, "findings": findings, "count": len(findings)}
    except Exception as e:
        logger.error(f"Failed to get findings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/codex/run/{run_id}/cancel")
async def cancel_codex_run(run_id: str):
    """
    Cancel a running Codex swarm.
    
    Example: POST /github/codex/run/abc123/cancel
    """
    try:
        service = get_codex_service()
        success = await service.cancel_run(run_id)
        
        if success:
            return {"status": "cancelled", "run_id": run_id}
        else:
            raise HTTPException(
                status_code=400,
                detail="Run not found or not in running state"
            )
    except Exception as e:
        logger.error(f"Failed to cancel run: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# PR Creation Models
class PRCreateRequest(BaseModel):
    """Request model for creating a PR from Codex findings."""
    clone_id: str = Field(..., description="Clone identifier")
    run_id: str = Field(..., description="Codex run identifier")
    repo_owner: str = Field(..., description="Repository owner")
    repo_name: str = Field(..., description="Repository name")
    base_branch: str = Field(default="main", description="Base branch for PR")
    branch_name: Optional[str] = Field(default=None, description="Custom branch name")
    title: Optional[str] = Field(default=None, description="PR title")
    body: Optional[str] = Field(default=None, description="PR description")


class PRResponse(BaseModel):
    """Response model for PR creation."""
    pr_number: int
    pr_url: str
    title: str
    state: str
    branch: str
    base_branch: str
    commit_sha: Optional[str] = None


class PRStatusResponse(BaseModel):
    """Response model for PR status."""
    pr_number: int
    state: str
    merged: bool
    title: str
    html_url: str
    created_at: str
    updated_at: str
    comments: int
    commits: int
    additions: int
    deletions: int


def get_pr_service() -> GitHubPRService:
    """Get or initialize the PR service."""
    global pr_service
    if pr_service is None:
        pr_service = GitHubPRService()
    return pr_service


@router.post("/pr/create", response_model=PRResponse)
async def create_pull_request(request: PRCreateRequest):
    """
    Create a pull request from Codex findings.
    
    This endpoint:
    1. Gets the cloned repository path
    2. Retrieves Codex findings from the run
    3. Creates a new branch
    4. Commits the changes
    5. Pushes the branch
    6. Creates a PR via GitHub API
    
    Example:
        POST /github/pr/create
        {
            "clone_id": "abc123",
            "run_id": "xyz789",
            "repo_owner": "owner",
            "repo_name": "repo",
            "base_branch": "main"
        }
    """
    try:
        # Get services
        github_svc = get_github_service()
        codex_svc = get_codex_service()
        pr_svc = get_pr_service()
        
        # Get clone path
        clone_info = github_svc.get_clone(request.clone_id)
        if not clone_info:
            raise HTTPException(status_code=404, detail="Clone not found")
        
        repo_path = Path(clone_info['path'])
        
        # Get findings
        findings = codex_svc.get_findings(request.run_id)
        if not findings:
            raise HTTPException(
                status_code=400,
                detail="No findings available for this run"
            )
        
        # Create PR
        pr_info = pr_svc.create_pr_from_run(
            repo_path=repo_path,
            repo_owner=request.repo_owner,
            repo_name=request.repo_name,
            findings=findings,
            base_branch=request.base_branch,
            branch_name=request.branch_name
        )
        
        return PRResponse(**pr_info)
        
    except PRCreationError as e:
        logger.error(f"PR creation failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to create PR: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pr/{repo_owner}/{repo_name}/{pr_number}", response_model=PRStatusResponse)
async def get_pr_status(repo_owner: str, repo_name: str, pr_number: int):
    """
    Get the status of a pull request.
    
    Example: /github/pr/octocat/Hello-World/42
    """
    try:
        pr_svc = get_pr_service()
        status = pr_svc.get_pr_status(repo_owner, repo_name, pr_number)
        return PRStatusResponse(**status)
    except PRCreationError as e:
        logger.error(f"Failed to get PR status: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to get PR status: {e}")
        raise HTTPException(status_code=500, detail=str(e))
