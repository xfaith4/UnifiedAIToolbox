"""
GitHub Repository Cloning Service

Handles cloning repositories with authentication, progress tracking,
and cleanup for the Codex orchestration workflow.
"""

import os
import logging
from pathlib import Path
from typing import Optional, Dict, Any, Callable
from datetime import datetime
import tempfile

try:
    from git import Repo, RemoteProgress
    from github import GithubException
except ImportError:
    raise ImportError(
        "GitPython and PyGithub are required. "
        "Install with: pip install GitPython PyGithub"
    )

from shared.github_core import (
    GitHubClientMixin,
    FileTreeMixin,
    CloneUrlMixin,
    build_file_tree,
    list_repo_branches,
    switch_repo_branch,
    cleanup_repository,
)

logger = logging.getLogger(__name__)


class CloneProgress(RemoteProgress):
    """Progress tracker for git clone operations."""
    
    def __init__(self, callback: Optional[Callable[[Dict[str, Any]], None]] = None):
        super().__init__()
        self.callback = callback
        self._last_op_code = None
    
    def update(self, op_code, cur_count, max_count=None, message=''):
        """Called by GitPython during clone operations."""
        progress_data = {
            'stage': self._get_stage_name(op_code),
            'current': cur_count,
            'total': max_count,
            'message': message or '',
            'percent': int((cur_count / max_count * 100) if max_count else 0)
        }
        
        if self.callback:
            self.callback(progress_data)
        
        self._last_op_code = op_code
    
    def _get_stage_name(self, op_code) -> str:
        """Convert git operation code to human-readable stage name."""
        if op_code & self.COUNTING:
            return "Counting objects"
        elif op_code & self.COMPRESSING:
            return "Compressing objects"
        elif op_code & self.RECEIVING:
            return "Receiving objects"
        elif op_code & self.RESOLVING:
            return "Resolving deltas"
        elif op_code & self.FINDING_SOURCES:
            return "Finding sources"
        elif op_code & self.CHECKING_OUT:
            return "Checking out files"
        return "Processing"


class RepositoryCloneError(Exception):
    """Raised when repository cloning fails."""
    pass


class GitHubCloneService(GitHubClientMixin, FileTreeMixin, CloneUrlMixin):
    """Service for cloning and managing GitHub repositories."""
    
    def __init__(
        self,
        github_token: Optional[str] = None,
        clone_base_dir: Optional[Path] = None
    ):
        """
        Initialize the GitHub clone service.
        
        Args:
            github_token: GitHub personal access token for authentication
            clone_base_dir: Base directory for cloned repositories
        """
        self.github_token = github_token or os.environ.get("GITHUB_TOKEN")
        
        if clone_base_dir is None:
            clone_base_dir = Path(tempfile.gettempdir()) / "github_clones"
        
        self.clone_base_dir = Path(clone_base_dir)
        self.clone_base_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize GitHub API client using shared mixin
        self.github_client = self._init_github_client(self.github_token, use_auth_class=False)
    
    def get_repo_metadata(self, owner: str, repo_name: str) -> Dict[str, Any]:
        """
        Fetch repository metadata from GitHub API.
        
        Args:
            owner: Repository owner (username or organization)
            repo_name: Repository name
            
        Returns:
            Dictionary with repository metadata
            
        Raises:
            RepositoryCloneError: If metadata cannot be fetched
        """
        if not self.github_client:
            raise RepositoryCloneError(
                "GitHub token required for fetching repository metadata"
            )
        
        try:
            metadata = self._fetch_repo_metadata(self.github_client, owner, repo_name)
            # Add additional fields expected by this API
            repo = self.github_client.get_repo(f"{owner}/{repo_name}")
            metadata['ssh_url'] = repo.ssh_url
            metadata['created_at'] = repo.created_at.isoformat() if repo.created_at else None
            metadata['open_issues'] = repo.open_issues_count
            return metadata
        except GithubException as e:
            raise RepositoryCloneError(
                f"Failed to fetch repository metadata: {e.data.get('message', str(e))}"
            )
        except Exception as e:
            raise RepositoryCloneError(f"Unexpected error fetching metadata: {str(e)}")
    
    def search_repositories(
        self,
        query: str,
        limit: int = 20
    ) -> list[Dict[str, Any]]:
        """
        Search for repositories on GitHub.
        
        Args:
            query: Search query string
            limit: Maximum number of results to return
            
        Returns:
            List of repository metadata dictionaries
        """
        if not self.github_client:
            raise RepositoryCloneError(
                "GitHub token required for searching repositories"
            )
        
        try:
            results = self._search_repos(self.github_client, query, limit, include_topics=True)
            # Add additional fields expected by this API
            repos = self.github_client.search_repositories(query=query)
            for i, repo in enumerate(repos[:limit]):
                if i < len(results):
                    results[i]['private'] = repo.private
            return results
        except GithubException as e:
            raise RepositoryCloneError(f"Search failed: {e.data.get('message', str(e))}")
        except Exception as e:
            raise RepositoryCloneError(f"Unexpected error during search: {str(e)}")
    
    def clone_repository(
        self,
        repo_url: str,
        branch: Optional[str] = None,
        progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
        clone_id: Optional[str] = None
    ) -> Path:
        """
        Clone a GitHub repository.
        
        Args:
            repo_url: Full repository URL or owner/repo format
            branch: Specific branch to clone (default: main/master)
            progress_callback: Function to call with progress updates
            clone_id: Optional identifier for this clone (default: timestamp-based)
            
        Returns:
            Path to the cloned repository
            
        Raises:
            RepositoryCloneError: If cloning fails
        """
        try:
            # Parse repository URL using shared utility
            owner, repo_name = self._parse_repo_url(repo_url)
            
            # Normalize URL if needed
            if not repo_url.startswith(('http://', 'https://', 'git@')):
                repo_url = f"https://github.com/{owner}/{repo_name}.git"
            
            # Generate clone directory
            if clone_id is None:
                clone_id = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            
            clone_path = self.clone_base_dir / f"{repo_name}_{clone_id}"
            
            # Clean up if directory already exists
            if clone_path.exists():
                logger.warning(f"Clone directory already exists, removing: {clone_path}")
                cleanup_repository(clone_path)
            
            # Prepare clone URL with authentication using shared utility
            clone_url_with_auth = self._get_auth_url(repo_url, self.github_token)
            
            # Create progress tracker
            progress = CloneProgress(callback=progress_callback)
            
            # Clone repository
            logger.info(f"Cloning repository to {clone_path}")
            repo = Repo.clone_from(
                clone_url_with_auth,
                clone_path,
                branch=branch,
                progress=progress
            )
            
            logger.info(f"Successfully cloned repository to {clone_path}")
            
            return clone_path
            
        except Exception as e:
            # Clean up on failure
            if 'clone_path' in locals() and Path(clone_path).exists():
                cleanup_repository(Path(clone_path))
            
            raise RepositoryCloneError(f"Failed to clone repository: {str(e)}")
    
    def list_branches(self, repo_path: Path) -> list[str]:
        """
        List all branches in a cloned repository.
        
        Args:
            repo_path: Path to the cloned repository
            
        Returns:
            List of branch names
        """
        return list_repo_branches(repo_path)
    
    def switch_branch(self, repo_path: Path, branch: str) -> bool:
        """
        Switch to a different branch in a cloned repository.
        
        Args:
            repo_path: Path to the cloned repository
            branch: Branch name to switch to
            
        Returns:
            True if successful, False otherwise
        """
        return switch_repo_branch(repo_path, branch)
    
    def cleanup_clone(self, clone_path: Path) -> bool:
        """
        Remove a cloned repository directory.
        
        Args:
            clone_path: Path to the cloned repository
            
        Returns:
            True if cleanup was successful, False otherwise
        """
        return cleanup_repository(clone_path)
    
    def get_file_tree(self, repo_path: Path, max_depth: int = 3) -> Dict[str, Any]:
        """
        Get a tree structure of files in the repository.
        
        Args:
            repo_path: Path to the cloned repository
            max_depth: Maximum depth to traverse
            
        Returns:
            Dictionary representing the file tree
        """
        return build_file_tree(repo_path, max_depth=max_depth, skip_hidden=True, allow_github_dir=True)
