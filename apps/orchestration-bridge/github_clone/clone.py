"""GitHub repository cloning service with progress tracking."""

import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Optional, Dict, List
import threading
import git
from github import GithubException

from shared.github_core import (
    GitHubClientMixin,
    FileTreeMixin,
    CloneUrlMixin,
    build_file_tree,
    list_repo_branches,
    cleanup_repository,
    switch_repo_branch,
)


class CloneStatus(str, Enum):
    """Status of a clone operation."""
    PENDING = "pending"
    CLONING = "cloning"
    COMPLETED = "completed"
    FAILED = "failed"
    CLEANING = "cleaning"


@dataclass
class CloneProgress:
    """Progress information for a clone operation."""
    repo_url: str
    status: CloneStatus
    progress_percent: float = 0.0
    message: str = ""
    clone_path: Optional[str] = None
    start_time: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    end_time: Optional[datetime] = None
    error: Optional[str] = None
    size_mb: Optional[float] = None
    file_count: Optional[int] = None
    branches: List[str] = field(default_factory=list)


class GitHubCloner(GitHubClientMixin, FileTreeMixin, CloneUrlMixin):
    """
    Service for cloning GitHub repositories with authentication,
    progress tracking, and cleanup.
    """

    def __init__(self, token: Optional[str] = None, base_clone_dir: str = "/tmp/github_clones"):
        """
        Initialize the GitHub cloner.
        
        Args:
            token: GitHub personal access token for authentication
            base_clone_dir: Base directory for cloning repositories
        """
        self.token = token
        self.base_clone_dir = Path(base_clone_dir)
        self.base_clone_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize GitHub API client using mixin
        self.github = self._init_github_client(token, use_auth_class=True)
        
        # Track active clones
        self._clones: Dict[str, CloneProgress] = {}
        self._lock = threading.Lock()

    def search_repositories(self, query: str, max_results: int = 30) -> List[Dict]:
        """
        Search for repositories on GitHub.
        
        Args:
            query: Search query
            max_results: Maximum number of results to return
            
        Returns:
            List of repository metadata dictionaries
        """
        try:
            repos = self.github.search_repositories(query=query)
            results = []
            
            for repo in repos[:max_results]:
                results.append({
                    'full_name': repo.full_name,
                    'name': repo.name,
                    'owner': repo.owner.login,
                    'description': repo.description,
                    'url': repo.html_url,
                    'clone_url': repo.clone_url,
                    'stars': repo.stargazers_count,
                    'forks': repo.forks_count,
                    'language': repo.language,
                    'size_kb': repo.size,
                    'updated_at': repo.updated_at.isoformat() if repo.updated_at else None,
                    'default_branch': repo.default_branch,
                })
            
            return results
        except GithubException as e:
            raise Exception(f"GitHub API error: {e.data.get('message', str(e))}")

    def get_repository_info(self, owner: str, repo_name: str) -> Dict:
        """
        Get detailed information about a repository.
        
        Args:
            owner: Repository owner
            repo_name: Repository name
            
        Returns:
            Repository metadata dictionary
        """
        try:
            metadata = self._fetch_repo_metadata(
                self.github, owner, repo_name, include_branches=True
            )
            # Add additional fields expected by this API
            metadata['url'] = metadata['html_url']
            metadata['size_kb'] = metadata['size']
            metadata['license'] = None
            try:
                repo = self.github.get_repo(f"{owner}/{repo_name}")
                metadata['license'] = repo.license.name if repo.license else None
            except Exception:
                pass
            return metadata
        except GithubException as e:
            raise Exception(f"GitHub API error: {e.data.get('message', str(e))}")

    def clone_repository(
        self,
        repo_url: str,
        branch: Optional[str] = None,
        depth: Optional[int] = None
    ) -> str:
        """
        Clone a repository from GitHub.
        
        Args:
            repo_url: Repository URL (e.g., 'https://github.com/owner/repo')
            branch: Specific branch to clone (default: default branch)
            depth: Clone depth for shallow clone (None for full clone)
            
        Returns:
            Clone operation ID for tracking progress
        """
        # Generate clone ID
        clone_id = f"{int(time.time())}_{hash(repo_url)}"
        
        # Initialize progress
        progress = CloneProgress(
            repo_url=repo_url,
            status=CloneStatus.PENDING,
            message="Preparing to clone..."
        )
        
        with self._lock:
            self._clones[clone_id] = progress
        
        # Start clone in background thread
        thread = threading.Thread(
            target=self._clone_worker,
            args=(clone_id, repo_url, branch, depth)
        )
        thread.daemon = True
        thread.start()
        
        return clone_id

    def _clone_worker(
        self,
        clone_id: str,
        repo_url: str,
        branch: Optional[str],
        depth: Optional[int]
    ):
        """Background worker for cloning a repository."""
        progress = self._clones[clone_id]
        
        try:
            # Update status
            progress.status = CloneStatus.CLONING
            progress.message = "Cloning repository..."
            progress.progress_percent = 10.0
            
            # Parse repo name from URL using shared utility
            owner, repo_name = self._parse_repo_url(repo_url)
            
            # Create clone directory
            clone_path = self.base_clone_dir / f"{owner}_{repo_name}_{clone_id}"
            clone_path.mkdir(parents=True, exist_ok=True)
            
            progress.clone_path = str(clone_path)
            progress.progress_percent = 20.0
            
            # Prepare clone arguments
            clone_kwargs = {}
            if branch:
                clone_kwargs['branch'] = branch
            if depth:
                clone_kwargs['depth'] = depth
            
            # Add authentication using shared utility
            auth_url = self._get_auth_url(repo_url, self.token)
            
            # Clone the repository
            progress.message = "Downloading files..."
            progress.progress_percent = 30.0
            
            repo = git.Repo.clone_from(auth_url, clone_path, **clone_kwargs)
            
            progress.progress_percent = 80.0
            progress.message = "Analyzing repository..."
            
            # Get repository statistics
            file_count = sum(1 for _ in clone_path.rglob('*') if _.is_file())
            size_bytes = sum(f.stat().st_size for f in clone_path.rglob('*') if f.is_file())
            size_mb = size_bytes / (1024 * 1024)
            
            # Get branches using shared utility
            branches = list_repo_branches(clone_path)
            
            progress.file_count = file_count
            progress.size_mb = round(size_mb, 2)
            progress.branches = branches
            progress.progress_percent = 100.0
            progress.status = CloneStatus.COMPLETED
            progress.message = "Clone completed successfully"
            progress.end_time = datetime.now(timezone.utc)
            
        except Exception as e:
            progress.status = CloneStatus.FAILED
            progress.error = str(e)
            progress.message = f"Clone failed: {str(e)}"
            progress.end_time = datetime.now(timezone.utc)

    def get_progress(self, clone_id: str) -> Optional[CloneProgress]:
        """
        Get the progress of a clone operation.
        
        Args:
            clone_id: Clone operation ID
            
        Returns:
            CloneProgress object or None if not found
        """
        with self._lock:
            return self._clones.get(clone_id)

    def list_clones(self) -> List[CloneProgress]:
        """
        List all tracked clone operations.
        
        Returns:
            List of CloneProgress objects
        """
        with self._lock:
            return list(self._clones.values())

    def get_file_tree(self, clone_id: str, max_depth: int = 3) -> Optional[Dict]:
        """
        Get the file tree of a cloned repository.
        
        Args:
            clone_id: Clone operation ID
            max_depth: Maximum depth to traverse
            
        Returns:
            File tree as nested dictionary or None if clone not found
        """
        progress = self.get_progress(clone_id)
        if not progress or not progress.clone_path:
            return None
        
        clone_path = Path(progress.clone_path)
        if not clone_path.exists():
            return None
        
        return build_file_tree(clone_path, max_depth=max_depth, skip_hidden=True, allow_github_dir=False)

    def cleanup_clone(self, clone_id: str) -> bool:
        """
        Clean up a cloned repository.
        
        Args:
            clone_id: Clone operation ID
            
        Returns:
            True if cleanup was successful, False otherwise
        """
        progress = self.get_progress(clone_id)
        if not progress or not progress.clone_path:
            return False
        
        try:
            progress.status = CloneStatus.CLEANING
            progress.message = "Cleaning up..."
            
            clone_path = Path(progress.clone_path)
            result = cleanup_repository(clone_path)
            
            with self._lock:
                del self._clones[clone_id]
            
            return result
        except Exception as e:
            progress.error = f"Cleanup failed: {str(e)}"
            return False

    def cleanup_all(self) -> int:
        """
        Clean up all cloned repositories.
        
        Returns:
            Number of repositories cleaned up
        """
        count = 0
        clone_ids = list(self._clones.keys())
        
        for clone_id in clone_ids:
            if self.cleanup_clone(clone_id):
                count += 1
        
        return count

    def get_branches(self, clone_id: str) -> List[str]:
        """
        Get list of branches in a cloned repository.
        
        Args:
            clone_id: Clone operation ID
            
        Returns:
            List of branch names
        """
        progress = self.get_progress(clone_id)
        if not progress or not progress.clone_path:
            return []
        
        branches = list_repo_branches(Path(progress.clone_path))
        return branches if branches else progress.branches

    def checkout_branch(self, clone_id: str, branch: str) -> bool:
        """
        Checkout a specific branch in a cloned repository.
        
        Args:
            clone_id: Clone operation ID
            branch: Branch name to checkout
            
        Returns:
            True if successful, False otherwise
        """
        progress = self.get_progress(clone_id)
        if not progress or not progress.clone_path:
            return False
        
        return switch_repo_branch(Path(progress.clone_path), branch)
