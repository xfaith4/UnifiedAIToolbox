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


@router.post("/repos/pr/create", response_model=CreatePRResponse)
def create_pull_request(
    request: CreatePRRequest,
    authorization: Optional[str] = Header(None)
):
    """
    Create a pull request from orchestration results.
    
    Creates a new branch, commits changes, pushes to GitHub, and creates a PR.
    This is typically used after an orchestration run to submit improvements.
    """
    validate_github_available()
    
    token = get_github_token(authorization)
    
    if not token:
        raise HTTPException(
            status_code=401,
            detail="GitHub token required. Set GITHUB_TOKEN environment variable or provide Authorization header."
        )
    
    try:
        service = GitHubPRService(github_token=token)
        
        # For now, we'll just create the PR without a local repo path
        # The actual implementation would need the cloned repo path
        # This is a placeholder that shows the API structure
        
        raise HTTPException(
            status_code=501,
            detail="PR creation from orchestration results requires a cloned repository. Use POST /github/repos/clone first, then provide the repo_path."
        )
    except PRCreationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to create pull request: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create pull request: {str(e)}")


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
