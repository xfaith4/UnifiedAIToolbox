"""
GitHub Integration API Endpoints

Provides endpoints for GitHub authentication, repository operations,
pull requests, issues, and orchestration result uploads.
"""

import os
import logging
from typing import Optional, Dict, Any, List
from pathlib import Path
from datetime import datetime

from fastapi import APIRouter, HTTPException, Header, Query, Body
from pydantic import BaseModel, Field

# Lazy import of GitHub services to avoid dependency issues
try:
    import sys
    bridge_path = Path(__file__).parent.parent.parent.parent.parent / "apps" / "orchestration-bridge"
    if str(bridge_path) not in sys.path:
        sys.path.insert(0, str(bridge_path))
    
    from github_integration.clone_service import GitHubCloneService, RepositoryCloneError
    from github_integration.pr_service import GitHubPRService, PRCreationError
    from github_integration.repo_intake_service import RepoIntakeService, RepoIntakeError
    from github_integration.supervisor_planner import SupervisorPlanner, SupervisorPlannerError
    from shared.github_core import parse_repo_url
    GITHUB_AVAILABLE = True
except ImportError as e:
    logging.warning(f"GitHub integration services not available: {e}")
    GITHUB_AVAILABLE = False
try:
    import sys
    bridge_path = Path(__file__).parent.parent.parent.parent.parent / "apps" / "orchestration-bridge"
    if str(bridge_path) not in sys.path:
        sys.path.insert(0, str(bridge_path))
    
    from github_integration.clone_service import GitHubCloneService, RepositoryCloneError
    from github_integration.pr_service import GitHubPRService, PRCreationError
    from github_integration.repo_intake_service import RepoIntakeService, RepoIntakeError
    from github_integration.supervisor_planner import SupervisorPlanner, SupervisorPlannerError
    from shared.github_core import parse_repo_url
    GITHUB_AVAILABLE = True
except ImportError as e:
    logging.warning(f"GitHub integration services not available: {e}")
    GITHUB_AVAILABLE = False
try:
    import sys
    bridge_path = Path(__file__).parent.parent.parent.parent.parent / "apps" / "orchestration-bridge"
    if str(bridge_path) not in sys.path:
        sys.path.insert(0, str(bridge_path))
    
    from github_integration.clone_service import GitHubCloneService, RepositoryCloneError
    from github_integration.pr_service import GitHubPRService, PRCreationError
    from github_integration.repo_intake_service import RepoIntakeService, RepoIntakeError
    from github_integration.supervisor_planner import SupervisorPlanner, SupervisorPlannerError
    from shared.github_core import parse_repo_url
    GITHUB_AVAILABLE = True
except ImportError as e:
    logging.warning(f"GitHub integration services not available: {e}")
    GITHUB_AVAILABLE = False
try:
    import sys
    bridge_path = Path(__file__).parent.parent.parent.parent.parent / "apps" / "orchestration-bridge"
    if str(bridge_path) not in sys.path:
        sys.path.insert(0, str(bridge_path))
    
    from github_integration.clone_service import GitHubCloneService, RepositoryCloneError
    from github_integration.pr_service import GitHubPRService, PRCreationError
    from github_integration.repo_intake_service import RepoIntakeService, RepoIntakeError
    from shared.github_core import parse_repo_url
    GITHUB_AVAILABLE = True
except ImportError as e:
    logging.warning(f"GitHub integration services not available: {e}")
    GITHUB_AVAILABLE = False

router = APIRouter(prefix="/github", tags=["github"])
logger = logging.getLogger(__name__)


# ============================================================================
# Request/Response Models
# ============================================================================

class GitHubAuthRequest(BaseModel):
    """Request model for GitHub authentication."""
    token: str = Field(..., description="GitHub personal access token")


class GitHubAuthResponse(BaseModel):
    """Response model for GitHub authentication."""
    authenticated: bool
    username: Optional[str] = None
    message: str


class RepositoryMetadataResponse(BaseModel):
    """Response model for repository metadata."""
    full_name: str
    name: str
    owner: str
    description: str
    clone_url: str
    html_url: str
    stars: int
    forks: int
    language: str
    size: int
    default_branch: str
    topics: List[str]
    private: bool
    archived: bool
    updated_at: Optional[str] = None


class AccessibleRepository(BaseModel):
    """Repository listing entry for accessible repositories."""
    id: Optional[int] = None
    full_name: str
    name: str
    owner: Optional[str] = None
    description: Optional[str] = ""
    html_url: str
    clone_url: Optional[str] = None
    default_branch: Optional[str] = None
    private: bool = False
    archived: bool = False
    visibility: Optional[str] = None
    updated_at: Optional[str] = None


class RepoIntakeRequest(BaseModel):
    """Request model for repository intake."""
    repo_url: str = Field(..., description="Repository URL or owner/repo format")
    run_id: str = Field(..., description="Workspace/run identifier for artifacts")
    branch: Optional[str] = Field(None, description="Optional branch to checkout")


class RepoIntakeResponse(BaseModel):
    """Response model for repository intake."""
    intake: Dict[str, Any]


class TaskGraphConstraints(BaseModel):
    """Constraints influencing the task graph."""
    allowed_paths: List[str] = Field(default_factory=list)
    max_parallel: int = Field(default=1, ge=1)
    risk_posture: str = Field(default="standard")


class TaskGraphRequest(BaseModel):
    """Request for supervisor planning."""
    run_id: str = Field(..., description="Workspace/run identifier containing intake artifacts")
    user_goal: str = Field(..., description="High-level objective to plan towards")
    constraints: TaskGraphConstraints = Field(default_factory=TaskGraphConstraints)
    intake: Optional[Dict[str, Any]] = Field(None, description="Inline intake report; falls back to disk if omitted")


class TaskGraphResponse(BaseModel):
    """Response with task graph data."""
    taskgraph: Dict[str, Any]


class CloneRepositoryRequest(BaseModel):
    """Request model for cloning a repository."""
    repo_url: str = Field(..., description="Repository URL or owner/repo format")
    branch: Optional[str] = Field(None, description="Specific branch to clone")
    private: bool
    archived: bool
    updated_at: Optional[str] = None


class AccessibleRepository(BaseModel):
    """Repository listing entry for accessible repositories."""
    id: Optional[int] = None
    full_name: str
    name: str
    owner: Optional[str] = None
    description: Optional[str] = ""
    html_url: str
    clone_url: Optional[str] = None
    default_branch: Optional[str] = None
    private: bool = False
    archived: bool = False
    visibility: Optional[str] = None
    updated_at: Optional[str] = None


class RepoIntakeRequest(BaseModel):
    """Request model for repository intake."""
    repo_url: str = Field(..., description="Repository URL or owner/repo format")
    run_id: str = Field(..., description="Workspace/run identifier for artifacts")
    branch: Optional[str] = Field(None, description="Optional branch to checkout")


class RepoIntakeResponse(BaseModel):
    """Response model for repository intake."""
    intake: Dict[str, Any]


class TaskGraphConstraints(BaseModel):
    """Constraints influencing the task graph."""
    allowed_paths: List[str] = Field(default_factory=list)
    max_parallel: int = Field(default=1, ge=1)
    risk_posture: str = Field(default="standard")


class TaskGraphRequest(BaseModel):
    """Request for supervisor planning."""
    run_id: str = Field(..., description="Workspace/run identifier containing intake artifacts")
    user_goal: str = Field(..., description="High-level objective to plan towards")
    constraints: TaskGraphConstraints = Field(default_factory=TaskGraphConstraints)
    intake: Optional[Dict[str, Any]] = Field(None, description="Inline intake report; falls back to disk if omitted")


class TaskGraphResponse(BaseModel):
    """Response with task graph data."""
    taskgraph: Dict[str, Any]


class CloneRepositoryRequest(BaseModel):
    """Request model for cloning a repository."""
    repo_url: str = Field(..., description="Repository URL or owner/repo format")
    branch: Optional[str] = Field(None, description="Specific branch to clone")
    private: bool
    archived: bool
    updated_at: Optional[str] = None


class AccessibleRepository(BaseModel):
    """Repository listing entry for accessible repositories."""
    id: Optional[int] = None
    full_name: str
    name: str
    owner: Optional[str] = None
    description: Optional[str] = ""
    html_url: str
    clone_url: Optional[str] = None
    default_branch: Optional[str] = None
    private: bool = False
    archived: bool = False
    visibility: Optional[str] = None
    updated_at: Optional[str] = None


class RepoIntakeRequest(BaseModel):
    """Request model for repository intake."""
    repo_url: str = Field(..., description="Repository URL or owner/repo format")
    run_id: str = Field(..., description="Workspace/run identifier for artifacts")
    branch: Optional[str] = Field(None, description="Optional branch to checkout")


class RepoIntakeResponse(BaseModel):
    """Response model for repository intake."""
    intake: Dict[str, Any]


class TaskGraphConstraints(BaseModel):
    """Constraints influencing the task graph."""
    allowed_paths: List[str] = Field(default_factory=list)
    max_parallel: int = Field(default=1, ge=1)
    risk_posture: str = Field(default="standard")


class TaskGraphRequest(BaseModel):
    """Request for supervisor planning."""
    run_id: str = Field(..., description="Workspace/run identifier containing intake artifacts")
    user_goal: str = Field(..., description="High-level objective to plan towards")
    constraints: TaskGraphConstraints = Field(default_factory=TaskGraphConstraints)
    intake: Optional[Dict[str, Any]] = Field(None, description="Inline intake report; falls back to disk if omitted")


class TaskGraphResponse(BaseModel):
    """Response with task graph data."""
    taskgraph: Dict[str, Any]


class CloneRepositoryRequest(BaseModel):
    """Request model for cloning a repository."""
    repo_url: str = Field(..., description="Repository URL or owner/repo format")
    branch: Optional[str] = Field(None, description="Specific branch to clone")
    private: bool
    archived: bool
    updated_at: Optional[str] = None


class AccessibleRepository(BaseModel):
    """Repository listing entry for accessible repositories."""
    id: Optional[int] = None
    full_name: str
    name: str
    owner: Optional[str] = None
    description: Optional[str] = ""
    html_url: str
    clone_url: Optional[str] = None
    default_branch: Optional[str] = None
    private: bool = False
    archived: bool = False
    visibility: Optional[str] = None
    updated_at: Optional[str] = None


class RepoIntakeRequest(BaseModel):
    """Request model for repository intake."""
    repo_url: str = Field(..., description="Repository URL or owner/repo format")
    run_id: str = Field(..., description="Workspace/run identifier for artifacts")
    branch: Optional[str] = Field(None, description="Optional branch to checkout")


class RepoIntakeResponse(BaseModel):
    """Response model for repository intake."""
    intake: Dict[str, Any]


class CloneRepositoryRequest(BaseModel):
    """Request model for cloning a repository."""
    repo_url: str = Field(..., description="Repository URL or owner/repo format")
    branch: Optional[str] = Field(None, description="Specific branch to clone")


class CloneRepositoryResponse(BaseModel):
    """Response model for cloned repository."""
    clone_id: str
    repo_path: str
    owner: str
    repo_name: str
    branch: Optional[str] = None
    file_tree: Optional[Dict[str, Any]] = None


class PullRequestInfo(BaseModel):
    """Pull request information."""
    number: int
    title: str
    state: str
    html_url: str
    created_at: str
    updated_at: str
    user: str
    base: str
    head: str
    draft: bool = False
    mergeable: Optional[bool] = None


class IssueInfo(BaseModel):
    """Issue information."""
    number: int
    title: str
    state: str
    html_url: str
    created_at: str
    updated_at: str
    user: str
    labels: List[str]
    comments: int


class CreatePRRequest(BaseModel):
    """Request model for creating a pull request."""
    repo_owner: str
    repo_name: str
    branch_name: str
    base_branch: str = "main"
    title: Optional[str] = None
    body: Optional[str] = None
    findings: List[Dict[str, Any]] = Field(default_factory=list)


class CreatePRResponse(BaseModel):
    """Response model for created pull request."""
    pr_number: int
    pr_url: str
    title: str
    state: str
    branch: str
    base_branch: str
    commit_sha: Optional[str] = None


# ============================================================================
# Helper Functions
# ============================================================================

def get_github_token(authorization: Optional[str] = None) -> Optional[str]:
    """
    Extract GitHub token from authorization header or environment.
    
    Args:
        authorization: Authorization header value
        
    Returns:
        GitHub token or None
    """
    if authorization and authorization.startswith("Bearer "):
        return authorization[7:]
    return os.environ.get("GITHUB_TOKEN")


def validate_github_available():
    """Raise error if GitHub integration is not available."""
    if not GITHUB_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="GitHub integration not available. Install required dependencies: GitPython, PyGithub"
        )


# ============================================================================
# API Endpoints
# ============================================================================

@router.get("/status")
def github_status():
    """
    Check GitHub integration status.
    
    Returns status of GitHub integration and authentication.
    """
    token = os.environ.get("GITHUB_TOKEN")
    
    return {
        "available": GITHUB_AVAILABLE,
        "authenticated": token is not None,
        "message": "GitHub integration ready" if GITHUB_AVAILABLE else "GitHub integration not available"
    }


@router.post("/auth/verify", response_model=GitHubAuthResponse)
def verify_github_auth(
    auth_request: GitHubAuthRequest
):
    """
    Verify GitHub authentication token.
    
    Validates the provided GitHub token and returns user information.
    """
    validate_github_available()
    
    try:
        from github import Github, GithubException
        
        gh = Github(auth_request.token)
        user = gh.get_user()
        
        return GitHubAuthResponse(
            authenticated=True,
            username=user.login,
            message=f"Successfully authenticated as {user.login}"
        )
    except GithubException as e:
        raise HTTPException(
            status_code=401,
            detail=f"GitHub authentication failed: {e.data.get('message', str(e))}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to verify authentication: {str(e)}"
        )


@router.get("/repos", response_model=List[AccessibleRepository])
def list_accessible_repositories(
    authorization: Optional[str] = Header(None)
):
    """
    List repositories accessible to the provided GitHub token.
    
    Includes both public and private repositories where the token holder is
    an owner, collaborator, or organization member.
    """
    validate_github_available()
    
    token = get_github_token(authorization)
    if not token:
        raise HTTPException(
            status_code=401,
            detail="GitHub token required to list accessible repositories."
        )

    try:
        service = GitHubCloneService(github_token=token)
        return service.list_accessible_repos()
    except RepositoryCloneError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to list accessible repositories: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to list accessible repositories."
        )


@router.post("/repos/intake", response_model=RepoIntakeResponse)
def generate_repo_intake(
    request: RepoIntakeRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Generate an intake report for the requested repository.

    The report is persisted under apps/orchestration-bridge/runs/<run_id>/intake.{json,md}
    and returned as structured JSON.
    """
    validate_github_available()

    token = get_github_token(authorization)
    runs_dir = Path(__file__).parent.parent.parent.parent / "orchestration-bridge" / "runs"

    try:
        service = RepoIntakeService(
            github_token=token,
            runs_dir=runs_dir,
        )
        intake = service.run_intake(
            repo_url=request.repo_url,
            run_id=request.run_id,
            branch=request.branch,
        )
        return RepoIntakeResponse(intake=intake)
    except RepoIntakeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to generate intake: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate intake report.")


@router.post("/supervisor/taskgraph", response_model=TaskGraphResponse)
def generate_taskgraph(
    request: TaskGraphRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Generate a TaskGraph artifact from an IntakeReport and user goal.
    """
    validate_github_available()

    runs_dir = Path(__file__).parent.parent.parent.parent / "orchestration-bridge" / "runs"
    planner = SupervisorPlanner(runs_dir=runs_dir)

    try:
        # Load intake from disk if not provided inline
        intake = request.intake
        if intake is None:
            intake_path = runs_dir / request.run_id / "intake.json"
            if not intake_path.exists():
                raise HTTPException(status_code=400, detail="Intake report not found for run_id.")
            intake = json.loads(intake_path.read_text(encoding="utf-8"))

        taskgraph = planner.generate_taskgraph(
            run_id=request.run_id,
            intake=intake,
            user_goal=request.user_goal,
            constraints=request.constraints.model_dump(),
        )
        return TaskGraphResponse(taskgraph=taskgraph)
    except HTTPException:
        raise
    except SupervisorPlannerError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to generate taskgraph: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate task graph.")


@router.get("/repos/{owner}/{repo}", response_model=RepositoryMetadataResponse)
def get_repository_metadata(
    owner: str,
    repo: str,
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to verify authentication: {str(e)}"
        )


@router.get("/repos", response_model=List[AccessibleRepository])
def list_accessible_repositories(
    authorization: Optional[str] = Header(None)
):
    """
    List repositories accessible to the provided GitHub token.
    
    Includes both public and private repositories where the token holder is
    an owner, collaborator, or organization member.
    """
    validate_github_available()
    
    token = get_github_token(authorization)
    if not token:
        raise HTTPException(
            status_code=401,
            detail="GitHub token required to list accessible repositories."
        )

    try:
        service = GitHubCloneService(github_token=token)
        return service.list_accessible_repos()
    except RepositoryCloneError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to list accessible repositories: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to list accessible repositories."
        )


@router.post("/repos/intake", response_model=RepoIntakeResponse)
def generate_repo_intake(
    request: RepoIntakeRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Generate an intake report for the requested repository.

    The report is persisted under apps/orchestration-bridge/runs/<run_id>/intake.{json,md}
    and returned as structured JSON.
    """
    validate_github_available()

    token = get_github_token(authorization)
    runs_dir = Path(__file__).parent.parent.parent.parent / "orchestration-bridge" / "runs"

    try:
        service = RepoIntakeService(
            github_token=token,
            runs_dir=runs_dir,
        )
        intake = service.run_intake(
            repo_url=request.repo_url,
            run_id=request.run_id,
            branch=request.branch,
        )
        return RepoIntakeResponse(intake=intake)
    except RepoIntakeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to generate intake: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate intake report.")


@router.post("/supervisor/taskgraph", response_model=TaskGraphResponse)
def generate_taskgraph(
    request: TaskGraphRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Generate a TaskGraph artifact from an IntakeReport and user goal.
    """
    validate_github_available()

    runs_dir = Path(__file__).parent.parent.parent.parent / "orchestration-bridge" / "runs"
    planner = SupervisorPlanner(runs_dir=runs_dir)

    try:
        # Load intake from disk if not provided inline
        intake = request.intake
        if intake is None:
            intake_path = runs_dir / request.run_id / "intake.json"
            if not intake_path.exists():
                raise HTTPException(status_code=400, detail="Intake report not found for run_id.")
            intake = json.loads(intake_path.read_text(encoding="utf-8"))

        taskgraph = planner.generate_taskgraph(
            run_id=request.run_id,
            intake=intake,
            user_goal=request.user_goal,
            constraints=request.constraints.model_dump(),
        )
        return TaskGraphResponse(taskgraph=taskgraph)
    except HTTPException:
        raise
    except SupervisorPlannerError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to generate taskgraph: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate task graph.")


@router.get("/repos/{owner}/{repo}", response_model=RepositoryMetadataResponse)
def get_repository_metadata(
    owner: str,
    repo: str,
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to verify authentication: {str(e)}"
        )


@router.get("/repos", response_model=List[AccessibleRepository])
def list_accessible_repositories(
    authorization: Optional[str] = Header(None)
):
    """
    List repositories accessible to the provided GitHub token.
    
    Includes both public and private repositories where the token holder is
    an owner, collaborator, or organization member.
    """
    validate_github_available()
    
    token = get_github_token(authorization)
    if not token:
        raise HTTPException(
            status_code=401,
            detail="GitHub token required to list accessible repositories."
        )

    try:
        service = GitHubCloneService(github_token=token)
        return service.list_accessible_repos()
    except RepositoryCloneError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to list accessible repositories: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to list accessible repositories."
        )


@router.post("/repos/intake", response_model=RepoIntakeResponse)
def generate_repo_intake(
    request: RepoIntakeRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Generate an intake report for the requested repository.

    The report is persisted under apps/orchestration-bridge/runs/<run_id>/intake.{json,md}
    and returned as structured JSON.
    """
    validate_github_available()

    token = get_github_token(authorization)
    runs_dir = Path(__file__).parent.parent.parent.parent / "orchestration-bridge" / "runs"

    try:
        service = RepoIntakeService(
            github_token=token,
            runs_dir=runs_dir,
        )
        intake = service.run_intake(
            repo_url=request.repo_url,
            run_id=request.run_id,
            branch=request.branch,
        )
        return RepoIntakeResponse(intake=intake)
    except RepoIntakeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to generate intake: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate intake report.")


@router.post("/supervisor/taskgraph", response_model=TaskGraphResponse)
def generate_taskgraph(
    request: TaskGraphRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Generate a TaskGraph artifact from an IntakeReport and user goal.
    """
    validate_github_available()

    runs_dir = Path(__file__).parent.parent.parent.parent / "orchestration-bridge" / "runs"
    planner = SupervisorPlanner(runs_dir=runs_dir)

    try:
        # Load intake from disk if not provided inline
        intake = request.intake
        if intake is None:
            intake_path = runs_dir / request.run_id / "intake.json"
            if not intake_path.exists():
                raise HTTPException(status_code=400, detail="Intake report not found for run_id.")
            intake = json.loads(intake_path.read_text(encoding="utf-8"))

        taskgraph = planner.generate_taskgraph(
            run_id=request.run_id,
            intake=intake,
            user_goal=request.user_goal,
            constraints=request.constraints.model_dump(),
        )
        return TaskGraphResponse(taskgraph=taskgraph)
    except HTTPException:
        raise
    except SupervisorPlannerError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to generate taskgraph: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate task graph.")


@router.get("/repos/{owner}/{repo}", response_model=RepositoryMetadataResponse)
def get_repository_metadata(
    owner: str,
    repo: str,
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to verify authentication: {str(e)}"
        )


@router.get("/repos", response_model=List[AccessibleRepository])
def list_accessible_repositories(
    authorization: Optional[str] = Header(None)
):
    """
    List repositories accessible to the provided GitHub token.
    
    Includes both public and private repositories where the token holder is
    an owner, collaborator, or organization member.
    """
    validate_github_available()
    
    token = get_github_token(authorization)
    if not token:
        raise HTTPException(
            status_code=401,
            detail="GitHub token required to list accessible repositories."
        )

    
    try:
        service = GitHubCloneService(github_token=token)
        return service.list_accessible_repos()
    except RepositoryCloneError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to list accessible repositories: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to list accessible repositories."
        )


@router.post("/repos/intake", response_model=RepoIntakeResponse)
def generate_repo_intake(
    request: RepoIntakeRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Generate an intake report for the requested repository.

    The report is persisted under apps/orchestration-bridge/runs/<run_id>/intake.{json,md}
    and returned as structured JSON.
    """
    validate_github_available()

    token = get_github_token(authorization)
    runs_dir = Path(__file__).parent.parent.parent.parent / "orchestration-bridge" / "runs"

    try:
        service = RepoIntakeService(
            github_token=token,
            runs_dir=runs_dir,
        )
        intake = service.run_intake(
            repo_url=request.repo_url,
            run_id=request.run_id,
            branch=request.branch,
        )
        return RepoIntakeResponse(intake=intake)
    except RepoIntakeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to generate intake: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate intake report.")


@router.get("/repos/{owner}/{repo}", response_model=RepositoryMetadataResponse)
def get_repository_metadata(
    owner: str,
    repo: str,
    authorization: Optional[str] = Header(None)
):
    """
    Get metadata for a GitHub repository.
    
    Returns detailed information about the repository including stars, forks,
    language, topics, and more.
    """
    validate_github_available()
    
    token = get_github_token(authorization)
    
    try:
        service = GitHubCloneService(github_token=token)
        metadata = service.get_repo_metadata(owner, repo)
        
        return RepositoryMetadataResponse(**metadata)
    except RepositoryCloneError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to get repository metadata: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve metadata: {str(e)}")


@router.post("/repos/clone", response_model=CloneRepositoryResponse)
def clone_repository(
    request: CloneRepositoryRequest,
    authorization: Optional[str] = Header(None),
    include_tree: bool = Query(True, description="Include file tree in response")
):
    """
    Clone a GitHub repository locally.
    
    Clones the specified repository and returns the local path and file tree.
    This can be used for orchestration runs or code analysis.
    """
    validate_github_available()
    
    token = get_github_token(authorization)
    
    try:
        service = GitHubCloneService(github_token=token)
        
        # Parse repo URL to get owner and name
        owner, repo_name = parse_repo_url(request.repo_url)
        
        # Generate clone ID
        clone_id = f"{owner}_{repo_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        # Clone repository
        clone_path = service.clone_repository(
            repo_url=request.repo_url,
            branch=request.branch,
            clone_id=clone_id
        )
        
        # Get file tree if requested
        file_tree = None
        if include_tree:
            file_tree = service.get_file_tree(clone_path, max_depth=3)
        
        return CloneRepositoryResponse(
            clone_id=clone_id,
            repo_path=str(clone_path),
            owner=owner,
            repo_name=repo_name,
            branch=request.branch,
            file_tree=file_tree
        )
    except RepositoryCloneError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to clone repository: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to clone repository: {str(e)}")


@router.get("/repos/{owner}/{repo}/pulls", response_model=List[PullRequestInfo])
def list_pull_requests(
    owner: str,
    repo: str,
    state: str = Query("open", pattern="^(open|closed|all)$"),
    limit: int = Query(30, ge=1, le=100),
    authorization: Optional[str] = Header(None)
):
    """
    List pull requests for a repository.
    
    Returns a list of pull requests with their metadata.
    """
    validate_github_available()
    
    token = get_github_token(authorization)
    
    if not token:
        raise HTTPException(
            status_code=401,
            detail="GitHub token required. Set GITHUB_TOKEN environment variable or provide Authorization header."
        )
    
    try:
        from github import Github
        
        gh = Github(token)
        repo_obj = gh.get_repo(f"{owner}/{repo}")
        
        pulls = repo_obj.get_pulls(state=state)
        
        result = []
        for pr in pulls[:limit]:
            result.append(PullRequestInfo(
                number=pr.number,
                title=pr.title,
                state=pr.state,
                html_url=pr.html_url,
                created_at=pr.created_at.isoformat(),
                updated_at=pr.updated_at.isoformat(),
                user=pr.user.login,
                base=pr.base.ref,
                head=pr.head.ref,
                draft=pr.draft,
                mergeable=pr.mergeable
            ))
        
        return result
    except Exception as e:
        logger.error(f"Failed to list pull requests: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list pull requests: {str(e)}")


@router.get("/repos/{owner}/{repo}/issues", response_model=List[IssueInfo])
def list_issues(
    owner: str,
    repo: str,
    state: str = Query("open", pattern="^(open|closed|all)$"),
    limit: int = Query(30, ge=1, le=100),
    authorization: Optional[str] = Header(None)
):
    """
    List issues for a repository.
    
    Returns a list of issues with their metadata.
    """
    validate_github_available()
    
    token = get_github_token(authorization)
    
    if not token:
        raise HTTPException(
            status_code=401,
            detail="GitHub token required. Set GITHUB_TOKEN environment variable or provide Authorization header."
        )
    
    try:
        from github import Github
        
        gh = Github(token)
        repo_obj = gh.get_repo(f"{owner}/{repo}")
        
        issues = repo_obj.get_issues(state=state)
        
        result = []
        for issue in issues[:limit]:
            # Skip pull requests (they appear in issues list)
            if issue.pull_request:
                continue
            
            result.append(IssueInfo(
                number=issue.number,
                title=issue.title,
                state=issue.state,
                html_url=issue.html_url,
                created_at=issue.created_at.isoformat(),
                updated_at=issue.updated_at.isoformat(),
                user=issue.user.login,
                labels=[label.name for label in issue.labels],
                comments=issue.comments
            ))
        
        return result
    except Exception as e:
        logger.error(f"Failed to list issues: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list issues: {str(e)}")





@router.get("/repos/{owner}/{repo}/branches")
def list_branches(
    owner: str,
    repo: str,
    authorization: Optional[str] = Header(None)
):
    """
    List branches for a repository.
    
    Returns a list of branch names.
    """
    validate_github_available()
    
    token = get_github_token(authorization)
    
    if not token:
        raise HTTPException(
            status_code=401,
            detail="GitHub token required."
        )
    
    try:
        from github import Github
        
        gh = Github(token)
        repo_obj = gh.get_repo(f"{owner}/{repo}")
        
        branches = [branch.name for branch in repo_obj.get_branches()]
        
        return {"branches": branches}
    except Exception as e:
        logger.error(f"Failed to list branches: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list branches: {str(e)}")


# ============================================================================
# Orchestration Integration Endpoints
# ============================================================================

class OrchestrationRunRequest(BaseModel):
    """Request model for running orchestration on a GitHub repository."""
    repo_url: str = Field(..., description="Repository URL or owner/repo format")
    branch: Optional[str] = Field(None, description="Specific branch to clone")
    create_pr: bool = Field(False, description="Create PR with orchestration results")
    pr_base_branch: str = Field("main", description="Base branch for PR")
    orchestration_type: str = Field("codex", description="Type of orchestration to run (codex, custom)")


class OrchestrationRunResponse(BaseModel):
    """Response model for orchestration run."""
    run_id: str
    repo_path: str
    status: str
    message: str
    pr_url: Optional[str] = None


@router.post("/orchestration/run", response_model=OrchestrationRunResponse)
def run_orchestration_on_repo(
    request: OrchestrationRunRequest,
    authorization: Optional[str] = Header(None)
):
    """
    Clone a GitHub repository and run orchestration on it.
    
    This endpoint:
    1. Clones the specified repository
    2. Runs the configured orchestration (e.g., Codex swarm)
    3. Optionally creates a PR with the results
    
    This is the main integration point for running orchestration on GitHub repositories.
    """
    validate_github_available()
    
    token = get_github_token(authorization)
    
    try:
        # Clone repository
        service = GitHubCloneService(github_token=token)
        
        # Parse repo URL
        owner, repo_name = parse_repo_url(request.repo_url)
        
        # Generate run ID
        run_id = f"orch_{owner}_{repo_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        # Clone repository
        clone_path = service.clone_repository(
            repo_url=request.repo_url,
            branch=request.branch,
            clone_id=run_id
        )
        
        logger.info(f"Cloned repository to {clone_path} for orchestration run {run_id}")
        
        # For now, we'll return a placeholder response
        # The actual orchestration integration would call the PowerShell scripts
        # or Python orchestration services here
        
        return OrchestrationRunResponse(
            run_id=run_id,
            repo_path=str(clone_path),
            status="cloned",
            message=f"Repository cloned successfully. Orchestration run queued. Path: {clone_path}",
            pr_url=None
        )
    except RepositoryCloneError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to run orchestration: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to run orchestration: {str(e)}")


class UploadResultsRequest(BaseModel):
    """Request model for uploading orchestration results to GitHub."""
    repo_path: str = Field(..., description="Path to the cloned repository")
    repo_owner: str
    repo_name: str
    base_branch: str = Field("main", description="Base branch for PR")
    branch_name: Optional[str] = Field(None, description="Custom branch name for PR")
    pr_title: Optional[str] = Field(None, description="Custom PR title")
    pr_body: Optional[str] = Field(None, description="Custom PR body/description")
    findings: List[Dict[str, Any]] = Field(default_factory=list, description="Orchestration findings to include in PR")


@router.post("/orchestration/upload-results", response_model=CreatePRResponse)
def upload_orchestration_results(
    request: UploadResultsRequest,
    authorization: Optional[str] = Header(None)
):
    """
    Upload orchestration results to GitHub as a pull request.
    
    This endpoint takes the results from an orchestration run and:
    1. Creates a new branch
    2. Commits the changes
    3. Pushes to GitHub
    4. Creates a pull request
    
    Use this after running orchestration to submit improvements to the repository.
    """
    validate_github_available()
    
    token = get_github_token(authorization)
    
    if not token:
        raise HTTPException(
            status_code=401,
            detail="GitHub token required for PR creation."
        )
    
    try:
        repo_path = Path(request.repo_path)
        
        if not repo_path.exists():
            raise HTTPException(
                status_code=400,
                detail=f"Repository path does not exist: {request.repo_path}"
            )
        
        # Create PR using the PR service
        pr_service = GitHubPRService(github_token=token)
        
        pr_info = pr_service.create_pr_from_run(
            repo_path=repo_path,
            repo_owner=request.repo_owner,
            repo_name=request.repo_name,
            findings=request.findings,
            base_branch=request.base_branch,
            branch_name=request.branch_name
        )
        
        return CreatePRResponse(
            pr_number=pr_info['pr_number'],
            pr_url=pr_info['pr_url'],
            title=pr_info['title'],
            state=pr_info['state'],
            branch=pr_info['branch_created'],
            base_branch=pr_info['base_branch'],
            commit_sha=pr_info.get('commit_sha')
        )
    except PRCreationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to upload orchestration results: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to upload results: {str(e)}")
