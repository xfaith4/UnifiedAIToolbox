"""
Core GitHub utilities shared across clone services.

This module contains reusable components for GitHub repository operations,
including file tree generation, URL handling, and GitHub API client setup.
"""

import logging
import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from git import Repo
    from github import Github, GithubException, Auth
except ImportError:
    raise ImportError(
        "GitPython and PyGithub are required. "
        "Install with: pip install GitPython PyGithub"
    )

logger = logging.getLogger(__name__)


def build_file_tree(
    path: Path,
    max_depth: int = 3,
    current_depth: int = 0,
    skip_hidden: bool = True,
    allow_github_dir: bool = True,
) -> Dict[str, Any]:
    """
    Recursively build a file tree dictionary from a directory path.
    
    Args:
        path: Root path to start building tree from
        max_depth: Maximum depth to traverse
        current_depth: Current recursion depth (internal use)
        skip_hidden: Whether to skip hidden files/directories
        allow_github_dir: Whether to allow .github directory when skip_hidden is True
        
    Returns:
        Dictionary representing the file tree structure
    """
    if current_depth >= max_depth:
        return {'name': path.name, 'type': 'directory', 'truncated': True}
    
    if path.is_file():
        return {
            'name': path.name,
            'type': 'file',
            'size': path.stat().st_size
        }
    
    children = []
    try:
        for item in sorted(path.iterdir(), key=lambda x: (not x.is_dir(), x.name)):
            # Skip hidden files/directories based on settings
            if skip_hidden and item.name.startswith('.'):
                if not (allow_github_dir and item.name == '.github'):
                    continue
            children.append(
                build_file_tree(
                    item,
                    max_depth=max_depth,
                    current_depth=current_depth + 1,
                    skip_hidden=skip_hidden,
                    allow_github_dir=allow_github_dir,
                )
            )
    except PermissionError:
        pass
    
    return {
        'name': path.name,
        'type': 'directory',
        'children': children
    }


def list_repo_branches(repo_path: Path) -> List[str]:
    """
    List all branches in a cloned repository.
    
    Args:
        repo_path: Path to the cloned repository
        
    Returns:
        List of branch names
    """
    try:
        repo = Repo(repo_path)
        return [ref.name.replace('origin/', '') for ref in repo.remote().refs]
    except Exception as e:
        logger.error(f"Failed to list branches: {e}")
        return []


def switch_repo_branch(repo_path: Path, branch: str) -> bool:
    """
    Switch to a different branch in a cloned repository.
    
    Args:
        repo_path: Path to the cloned repository
        branch: Branch name to switch to
        
    Returns:
        True if successful, False otherwise
    """
    try:
        repo = Repo(repo_path)
        repo.git.checkout(branch)
        logger.info(f"Switched to branch: {branch}")
        return True
    except Exception as e:
        logger.error(f"Failed to switch branch: {e}")
        return False


def cleanup_repository(clone_path: Path) -> bool:
    """
    Remove a cloned repository directory.
    
    Args:
        clone_path: Path to the cloned repository
        
    Returns:
        True if cleanup was successful, False otherwise
    """
    try:
        if clone_path.exists():
            shutil.rmtree(clone_path)
            logger.info(f"Cleaned up clone at {clone_path}")
            return True
        return False
    except Exception as e:
        logger.error(f"Failed to cleanup clone at {clone_path}: {e}")
        return False


def get_authenticated_clone_url(repo_url: str, token: Optional[str]) -> str:
    """
    Add authentication to a clone URL if a token is provided.
    
    Args:
        repo_url: Original repository URL
        token: GitHub personal access token
        
    Returns:
        URL with embedded authentication (if token provided)
    """
    if not token:
        return repo_url
    
    if repo_url.startswith('https://github.com/'):
        return repo_url.replace(
            'https://github.com/',
            f'https://{token}@github.com/'
        )
    elif repo_url.startswith('https://'):
        return repo_url.replace('https://', f'https://{token}@')
    
    return repo_url


def parse_repo_url(repo_url: str) -> tuple[str, str]:
    """
    Parse a repository URL to extract owner and repo name.
    
    Args:
        repo_url: Repository URL or owner/repo format
        
    Returns:
        Tuple of (owner, repo_name)
    """
    # Handle owner/repo format
    if not repo_url.startswith(('http://', 'https://', 'git@')):
        parts = repo_url.split('/')
        if len(parts) >= 2:
            return parts[-2], parts[-1].replace('.git', '')
    
    # Handle full URL format
    url = repo_url.rstrip('/')
    parts = url.split('/')
    repo_name = parts[-1].replace('.git', '')
    owner = parts[-2] if len(parts) >= 2 else ''
    
    return owner, repo_name


class GitHubClientMixin:
    """Mixin providing GitHub API client initialization and common operations."""
    
    def _init_github_client(
        self, 
        token: Optional[str] = None,
        use_auth_class: bool = False
    ) -> Optional[Github]:
        """
        Initialize GitHub API client.
        
        Args:
            token: GitHub personal access token
            use_auth_class: Whether to use Auth.Token class (newer API)
            
        Returns:
            Initialized Github client or None
        """
        if not token:
            return None if use_auth_class else Github()
        
        try:
            if use_auth_class:
                auth = Auth.Token(token)
                return Github(auth=auth)
            else:
                return Github(token)
        except Exception as e:
            logger.warning(f"Failed to initialize GitHub client: {e}")
            return None
    
    def _fetch_repo_metadata(
        self,
        github_client: Github,
        owner: str,
        repo_name: str,
        include_branches: bool = False,
    ) -> Dict[str, Any]:
        """
        Fetch repository metadata from GitHub API.
        
        Args:
            github_client: Initialized Github client
            owner: Repository owner
            repo_name: Repository name
            include_branches: Whether to include branch list
            
        Returns:
            Dictionary with repository metadata
            
        Raises:
            GithubException: If API call fails
        """
        repo = github_client.get_repo(f"{owner}/{repo_name}")
        
        metadata = {
            'full_name': repo.full_name,
            'name': repo.name,
            'owner': repo.owner.login,
            'description': repo.description or '',
            'clone_url': repo.clone_url,
            'html_url': repo.html_url,
            'stars': repo.stargazers_count,
            'forks': repo.forks_count,
            'language': repo.language or 'Unknown',
            'size': repo.size,
            'default_branch': repo.default_branch,
            'topics': repo.get_topics(),
            'updated_at': repo.updated_at.isoformat() if repo.updated_at else None,
            'private': repo.private,
            'archived': repo.archived,
        }
        
        if include_branches:
            metadata['branches'] = [branch.name for branch in repo.get_branches()]
        
        return metadata
    
    def _search_repos(
        self,
        github_client: Github,
        query: str,
        limit: int = 20,
        include_topics: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        Search for repositories on GitHub.
        
        Args:
            github_client: Initialized Github client
            query: Search query string
            limit: Maximum number of results
            include_topics: Whether to include topics (slower)
            
        Returns:
            List of repository metadata dictionaries
        """
        repos = github_client.search_repositories(query=query)
        results = []
        
        for repo in repos[:limit]:
            result = {
                'full_name': repo.full_name,
                'description': repo.description or '',
                'stars': repo.stargazers_count,
                'language': repo.language or 'Unknown',
                'size': repo.size,
                'html_url': repo.html_url,
            }
            
            if include_topics:
                result['topics'] = repo.get_topics()
            
            results.append(result)
        
        return results


class FileTreeMixin:
    """Mixin providing file tree generation capabilities."""
    
    def _build_file_tree(
        self,
        repo_path: Path,
        max_depth: int = 3,
        skip_git_dir: bool = True,
    ) -> Dict[str, Any]:
        """
        Get a tree structure of files in the repository.
        
        Args:
            repo_path: Path to the cloned repository
            max_depth: Maximum depth to traverse
            skip_git_dir: Whether to skip .git directory
            
        Returns:
            Dictionary representing the file tree
        """
        return build_file_tree(
            repo_path,
            max_depth=max_depth,
            skip_hidden=skip_git_dir,
            allow_github_dir=True,
        )


class CloneUrlMixin:
    """Mixin providing clone URL handling capabilities."""
    
    def _get_auth_url(self, repo_url: str, token: Optional[str]) -> str:
        """
        Get authenticated clone URL.
        
        Args:
            repo_url: Original repository URL
            token: GitHub personal access token
            
        Returns:
            URL with embedded authentication if token provided
        """
        return get_authenticated_clone_url(repo_url, token)
    
    def _parse_repo_url(self, repo_url: str) -> tuple[str, str]:
        """
        Parse repository URL to extract owner and repo name.
        
        Args:
            repo_url: Repository URL or owner/repo format
            
        Returns:
            Tuple of (owner, repo_name)
        """
        return parse_repo_url(repo_url)
