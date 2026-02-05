"""
GitHub Repository Cloning Service

Handles cloning repositories with authentication, progress tracking,
and cleanup for the Codex orchestration workflow.
"""

import os
import logging
import re
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any, Callable, List
from datetime import datetime, timezone
import tempfile

try:
    from git import Repo, RemoteProgress
    from git.exc import GitCommandError
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
    github_call_with_backoff,
)
from shared.security import redact_text, safe_message

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

    def __init__(self, message: str, payload: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.payload = payload


class RepositoryPreflightError(RepositoryCloneError):
    """Raised when preflight checks fail."""
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

    def _get_core_rate_limit(self):
        if not self.github_client:
            return None
        rate_overview = self.github_client.get_rate_limit()
        core_rate = getattr(rate_overview, "core", None)
        if core_rate is None:
            resources = getattr(rate_overview, "resources", None)
            if resources is not None:
                core_rate = getattr(resources, "core", None)
        return core_rate

    def _build_preflight_payload(
        self,
        code: str,
        user_message: str,
        technical_details: str = "",
        suggested_fixes: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        return {
            "code": code,
            "userMessage": user_message,
            "technicalDetails": safe_message(technical_details or ""),
            "suggestedFixes": suggested_fixes or [],
        }

    def _raise_preflight_error(
        self,
        code: str,
        user_message: str,
        technical_details: str = "",
        suggested_fixes: Optional[List[str]] = None,
    ) -> None:
        payload = self._build_preflight_payload(code, user_message, technical_details, suggested_fixes)
        raise RepositoryPreflightError(user_message, payload)

    def _run_git(self, args: List[str], timeout: int = 20) -> subprocess.CompletedProcess:
        env = os.environ.copy()
        env.setdefault("GIT_TERMINAL_PROMPT", "0")
        return subprocess.run(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=timeout,
            env=env,
        )

    def _format_git_details(self, args: List[str], proc: Optional[subprocess.CompletedProcess] = None) -> str:
        cmd = " ".join(args)
        if proc is None:
            return f"command={cmd}"
        stderr = proc.stderr or ""
        stdout = proc.stdout or ""
        return f"command={cmd} | stderr={stderr} | stdout={stdout}"

    def _ensure_destination_ready(self, clone_path: Path) -> None:
        if os.name == "nt":
            try:
                full_path = str(clone_path.resolve())
            except Exception:
                full_path = str(clone_path.absolute())
            if len(full_path) > 240:
                self._raise_preflight_error(
                    "LONG_PATHS",
                    "Destination path is too long for Windows.",
                    full_path,
                    [
                        "Shorten the repo runs directory path.",
                        "Move the workspace closer to the drive root (e.g., C:\\repos).",
                    ],
                )

        if clone_path.exists():
            logger.warning("Clone directory already exists, removing: %s", clone_path)
            cleanup_repository(clone_path)

        if clone_path.exists():
            try:
                entries = [p.name for p in clone_path.iterdir()][:5]
            except Exception:
                entries = []
            entry_hint = f" (entries: {entries})" if entries else ""
            self._raise_preflight_error(
                "DEST_NOT_EMPTY",
                "Destination folder already exists and is not empty.",
                f"Clone destination exists and could not be removed: {clone_path}{entry_hint}",
                [
                    "Use a fresh run directory.",
                    "Delete the existing folder and retry.",
                ],
            )

        clone_path.parent.mkdir(parents=True, exist_ok=True)
        test_path = clone_path.parent / f".uaitoolbox_write_test_{os.getpid()}"
        try:
            test_path.write_text("ok", encoding="utf-8")
            test_path.unlink(missing_ok=True)
        except Exception as exc:
            self._raise_preflight_error(
                "PATH_NOT_WRITABLE",
                "Destination folder is not writable.",
                str(exc),
                ["Check filesystem permissions.", "Choose a writable runs directory."],
            )

    def _detect_default_branch(self, repo_url: str) -> Optional[str]:
        try:
            if self.github_token and self.github_client:
                owner, repo_name = self._parse_repo_url(repo_url)
                metadata = self._fetch_repo_metadata(self.github_client, owner, repo_name)
                if metadata.get("default_branch"):
                    return metadata["default_branch"]
        except Exception:
            pass

        try:
            res = self._run_git(["git", "ls-remote", "--symref", repo_url, "HEAD"])
        except FileNotFoundError:
            return None
        if res.returncode != 0:
            return None
        for line in (res.stdout or "").splitlines():
            if line.startswith("ref:") and line.endswith("HEAD"):
                parts = line.split()
                if parts:
                    ref = parts[0].replace("ref:", "").strip()
                    if ref.startswith("refs/heads/"):
                        return ref.split("refs/heads/")[-1]
        return None

    def _classify_git_error(self, stderr: str) -> str:
        lowered = stderr.lower()
        if "authentication failed" in lowered or "access denied" in lowered:
            return "AUTH_REQUIRED"
        if "repository not found" in lowered or "not authorized" in lowered or "permission denied" in lowered:
            return "AUTH_REQUIRED"
        if "could not resolve host" in lowered or "failed to connect" in lowered or "network" in lowered:
            return "REPO_UNREACHABLE"
        if "ssl" in lowered or "tls" in lowered or "certificate" in lowered:
            return "REPO_UNREACHABLE"
        if "timeout" in lowered or "timed out" in lowered:
            return "REPO_UNREACHABLE"
        return "UNKNOWN"

    def _preflight(self, repo_url: str, branch: Optional[str], clone_path: Path) -> Optional[str]:
        try:
            res = self._run_git(["git", "--version"])
        except FileNotFoundError as exc:
            self._raise_preflight_error(
                "GIT_MISSING",
                "Git is not installed or not on PATH.",
                self._format_git_details(["git", "--version"]),
                ["Install Git and ensure it is available on PATH."],
            )
        if res.returncode != 0:
            self._raise_preflight_error(
                "GIT_MISSING",
                "Git is not available.",
                self._format_git_details(["git", "--version"], res),
                ["Install Git and ensure it is available on PATH."],
            )

        self._ensure_destination_ready(clone_path)

        resolved_branch = branch or self._detect_default_branch(repo_url)
        if resolved_branch:
            try:
                probe = self._run_git(["git", "ls-remote", "--heads", repo_url, resolved_branch])
            except Exception as exc:
                self._raise_preflight_error(
                    "REPO_UNREACHABLE",
                    "Unable to reach the repository.",
                    self._format_git_details(["git", "ls-remote", "--heads", repo_url, resolved_branch]),
                    ["Check network connectivity.", "Verify the repository URL."],
                )
            if probe.returncode != 0:
                code = self._classify_git_error(probe.stderr or "")
                self._raise_preflight_error(
                    code if code != "UNKNOWN" else "REPO_UNREACHABLE",
                    "Unable to access the repository with the provided credentials.",
                    self._format_git_details(["git", "ls-remote", "--heads", repo_url, resolved_branch], probe),
                    [
                        "Verify the repository URL.",
                        "Ensure your GitHub token has access to the repository.",
                        "Check your network connection.",
                    ],
                )
            if not (probe.stdout or "").strip():
                self._raise_preflight_error(
                    "BRANCH_NOT_FOUND",
                    f"Branch '{resolved_branch}' was not found.",
                    self._format_git_details(["git", "ls-remote", "--heads", repo_url, resolved_branch], probe),
                    [
                        "Confirm the branch name.",
                        "Leave branch empty to use the default branch.",
                    ],
                )
        else:
            try:
                probe = self._run_git(["git", "ls-remote", "--heads", repo_url])
            except Exception as exc:
                self._raise_preflight_error(
                    "REPO_UNREACHABLE",
                    "Unable to reach the repository.",
                    self._format_git_details(["git", "ls-remote", "--heads", repo_url]),
                    ["Check network connectivity.", "Verify the repository URL."],
                )
            if probe.returncode != 0:
                code = self._classify_git_error(probe.stderr or "")
                self._raise_preflight_error(
                    code if code != "UNKNOWN" else "REPO_UNREACHABLE",
                    "Unable to access the repository with the provided credentials.",
                    self._format_git_details(["git", "ls-remote", "--heads", repo_url], probe),
                    [
                        "Verify the repository URL.",
                        "Ensure your GitHub token has access to the repository.",
                        "Check your network connection.",
                    ],
                )

        return resolved_branch

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
            metadata = self._fetch_repo_metadata(
                self.github_client, owner, repo_name, include_extended=True
            )
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
            results = github_call_with_backoff(
                lambda: self._search_repos(
                    self.github_client, query, limit, include_topics=True, include_private=True
                ),
                description="Search repositories",
            )
            return results
        except GithubException as e:
            raise RepositoryCloneError(f"Search failed: {e.data.get('message', str(e))}")
        except Exception as e:
            raise RepositoryCloneError(f"Unexpected error during search: {str(e)}")

    def list_accessible_repos(
        self,
        limit: Optional[int] = None
    ) -> list[Dict[str, Any]]:
        """
        List repositories the authenticated user can access.

        Args:
            limit: Optional limit on number of repositories to return

        Returns:
            List of accessible repository metadata dictionaries

        Raises:
            RepositoryCloneError: If listing fails or authentication is missing
        """
        if not self.github_client:
            raise RepositoryCloneError(
                "GitHub token required for listing accessible repositories"
            )

        try:
            try:
                rate_limit = github_call_with_backoff(
                    lambda: self._get_core_rate_limit(),
                    description="Check GitHub rate limit",
                )
                if rate_limit and rate_limit.remaining <= 0:
                    reset_time = datetime.fromtimestamp(
                        rate_limit.reset, timezone.utc
                    ).isoformat()
                    raise RepositoryCloneError(
                        f"GitHub rate limit exceeded. Core API resets at {reset_time}."
                    )
            except GithubException:
                # If rate limit lookup fails, continue and let the main call surface errors
                rate_limit = None  # type: ignore

            user = github_call_with_backoff(self.github_client.get_user, description="Get authenticated user")
            repos_iter = github_call_with_backoff(
                lambda: user.get_repos(
                    visibility="all",
                    affiliation="owner,collaborator,organization_member",
                ),
                description="List user repositories",
            )

            repos: list[Dict[str, Any]] = []
            for repo in repos_iter:
                # Get open PR count for the repository
                open_prs_count = 0
                try:
                    open_prs_count = repo.get_pulls(state='open').totalCount
                except Exception:
                    # If fetching PR count fails, just use 0
                    pass
                
                repos.append({
                    "id": getattr(repo, "id", None),
                    "full_name": repo.full_name,
                    "name": repo.name,
                    "owner": repo.owner.login if getattr(repo, "owner", None) else "",
                    "description": repo.description or "",
                    "html_url": repo.html_url,
                    "clone_url": repo.clone_url,
                    "default_branch": getattr(repo, "default_branch", None),
                    "private": bool(getattr(repo, "private", False)),
                    "archived": bool(getattr(repo, "archived", False)),
                    "visibility": "private" if getattr(repo, "private", False) else "public",
                    "updated_at": repo.updated_at.isoformat() if getattr(repo, "updated_at", None) else None,
                    "open_prs_count": open_prs_count,
                })

                if limit is not None and len(repos) >= limit:
                    break

            return repos
        except RepositoryCloneError:
            raise
        except GithubException as e:
            message = e.data.get('message', str(e)) if getattr(e, "data", None) else str(e)

            if e.status == 403 and "rate limit" in message.lower():
                try:
                    rate_limit = self._get_core_rate_limit()
                    if rate_limit:
                        reset_time = datetime.fromtimestamp(
                            rate_limit.reset, timezone.utc
                        ).isoformat()
                    else:
                        reset_time = "soon"
                except Exception:
                    reset_time = "soon"
                raise RepositoryCloneError(
                    f"GitHub rate limit exceeded. Core API resets at {reset_time}."
                )

            if e.status in (401, 403):
                raise RepositoryCloneError(
                    "GitHub token is missing repository access. "
                    "Ensure the PAT includes the repo scope or fine-grained permissions for repository read access."
                )

            raise RepositoryCloneError(
                f"Failed to list accessible repositories: {message}"
            )
        except Exception as e:
            raise RepositoryCloneError(f"Unexpected error listing repositories: {str(e)}")

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
            # Never allow interactive git credential prompts in headless runs.
            os.environ.setdefault("GIT_TERMINAL_PROMPT", "0")

            # Parse repository URL using shared utility
            owner, repo_name = self._parse_repo_url(repo_url)

            # Normalize URL if needed
            if not repo_url.startswith(('http://', 'https://', 'git@')):
                repo_url = f"https://github.com/{owner}/{repo_name}.git"

            # Generate clone directory
            if clone_id is None:
                clone_id = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}"

            # If clone_base_dir is already a per-run directory, avoid repeating
            # the (often long) run_id in the clone folder name.
            if self.clone_base_dir.name == clone_id:
                clone_path = self.clone_base_dir / "repo"
            else:
                clone_path = self.clone_base_dir / f"{repo_name}_{clone_id}"

            # Prepare clone URL with authentication using shared utility
            clone_url_with_auth = self._get_auth_url(repo_url, self.github_token)

            # Preflight checks (git availability, connectivity, branch, destination)
            resolved_branch = self._preflight(clone_url_with_auth, branch, clone_path)
            if resolved_branch:
                branch = resolved_branch

            # Create progress tracker
            progress = CloneProgress(callback=progress_callback)

            # Clone repository
            logger.info(
                "Cloning repository",
                extra={
                    "repo_url": safe_message(repo_url),
                    "branch": branch or "default",
                    "clone_id": clone_id,
                    "clone_path": str(clone_path),
                },
            )
            repo = Repo.clone_from(
                clone_url_with_auth,
                clone_path,
                branch=branch,
                progress=progress
            )

            logger.info(
                "Successfully cloned repository",
                extra={
                    "repo_url": safe_message(repo_url),
                    "branch": branch or "default",
                    "clone_id": clone_id,
                    "clone_path": str(clone_path),
                },
            )

            return clone_path

        except RepositoryCloneError:
            raise
        except Exception as e:
            # Clean up on failure
            if 'clone_path' in locals() and Path(clone_path).exists():
                cleanup_repository(Path(clone_path))

            details = str(e)
            if isinstance(e, GitCommandError):
                stderr = getattr(e, "stderr", None)
                stdout = getattr(e, "stdout", None)
                cmd = getattr(e, "command", None)
                parts = [details]
                if cmd:
                    parts.append(f"command={cmd}")
                if stderr:
                    parts.append(f"stderr={stderr}")
                if stdout:
                    parts.append(f"stdout={stdout}")
                details = " | ".join(parts)

            redacted_error = safe_message(details)
            raise RepositoryCloneError(f"Failed to clone repository: {redacted_error}")

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
