"""
GitHub Pull Request Creation Service

Handles creating pull requests from Codex findings, including:
- Creating a new branch from findings
- Committing changes based on findings
- Generating PR descriptions
- Creating PR via GitHub API
"""

import logging
import uuid
from pathlib import Path
from typing import Optional, Dict, Any, List
from datetime import datetime

try:
    from git import Repo, GitCommandError
    from github import Github, GithubException
except ImportError:
    raise ImportError(
        "GitPython and PyGithub are required. "
        "Install with: pip install GitPython PyGithub"
    )

logger = logging.getLogger(__name__)


class PRCreationError(Exception):
    """Raised when PR creation fails."""
    pass


class GitHubPRService:
    """Service for creating pull requests from Codex findings."""
    
    def __init__(self, github_token: Optional[str] = None):
        """
        Initialize the PR service.
        
        Args:
            github_token: GitHub personal access token for authentication
        """
        import os
        self.github_token = github_token or os.environ.get("GITHUB_TOKEN")
        
        if not self.github_token:
            raise ValueError("GitHub token is required for PR creation")
        
        self.github_client = Github(self.github_token)
    
    def create_branch_from_findings(
        self,
        repo_path: Path,
        branch_name: Optional[str] = None,
        base_branch: str = "main"
    ) -> str:
        """
        Create a new branch for PR.
        
        Args:
            repo_path: Path to the cloned repository
            branch_name: Name for the new branch (auto-generated if None)
            base_branch: Base branch to create from
            
        Returns:
            Name of the created branch
            
        Raises:
            PRCreationError: If branch creation fails
        """
        try:
            repo = Repo(repo_path)
            
            # Generate branch name if not provided
            if not branch_name:
                timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
                branch_name = f"codex-improvements-{timestamp}"
            
            # Ensure we're on the base branch
            try:
                repo.git.checkout(base_branch)
            except GitCommandError:
                # If base_branch doesn't exist locally, try to fetch it
                try:
                    repo.git.fetch('origin', base_branch)
                    repo.git.checkout(f'origin/{base_branch}', b=base_branch)
                except GitCommandError as e:
                    logger.warning(f"Could not checkout {base_branch}, using current branch: {e}")
            
            # Create new branch
            new_branch = repo.create_head(branch_name)
            new_branch.checkout()
            
            logger.info(f"Created branch: {branch_name}")
            return branch_name
            
        except Exception as e:
            raise PRCreationError(f"Failed to create branch: {e}")
    
    def commit_findings(
        self,
        repo_path: Path,
        findings: List[Dict[str, Any]],
        commit_message: Optional[str] = None
    ) -> str:
        """
        Commit changes based on Codex findings.
        
        Args:
            repo_path: Path to the cloned repository
            findings: List of finding dictionaries
            commit_message: Custom commit message (auto-generated if None)
            
        Returns:
            Commit SHA
            
        Raises:
            PRCreationError: If commit fails
        """
        try:
            repo = Repo(repo_path)
            
            # Check if there are any changes to commit
            if not repo.is_dirty(untracked_files=True):
                logger.warning("No changes to commit")
                return repo.head.commit.hexsha
            
            # Add all changes
            repo.git.add(A=True)
            
            # Generate commit message if not provided
            if not commit_message:
                commit_message = self._generate_commit_message(findings)
            
            # Commit changes
            commit = repo.index.commit(commit_message)
            
            logger.info(f"Created commit: {commit.hexsha[:8]}")
            return commit.hexsha
            
        except Exception as e:
            raise PRCreationError(f"Failed to commit changes: {e}")
    
    def _generate_commit_message(self, findings: List[Dict[str, Any]]) -> str:
        """
        Generate a commit message from findings.
        
        Args:
            findings: List of finding dictionaries
            
        Returns:
            Generated commit message
        """
        agent_count = len(set(f.get('agent_role', 'unknown') for f in findings))
        shard_count = len(findings)
        
        message = f"Apply Codex improvements from {agent_count} agents across {shard_count} shards\n\n"
        
        # Group findings by agent role
        by_role: Dict[str, List[Dict[str, Any]]] = {}
        for finding in findings:
            role = finding.get('agent_role', 'unknown')
            if role not in by_role:
                by_role[role] = []
            by_role[role].append(finding)
        
        # Add summary by role
        for role, role_findings in by_role.items():
            message += f"- {role.capitalize()}: {len(role_findings)} shards analyzed\n"
        
        message += "\nGenerated by UnifiedAIToolbox Codex Swarm"
        
        return message
    
    def push_branch(
        self,
        repo_path: Path,
        branch_name: str,
        remote_name: str = "origin"
    ) -> bool:
        """
        Push branch to remote repository.
        
        Args:
            repo_path: Path to the cloned repository
            branch_name: Name of the branch to push
            remote_name: Name of the remote
            
        Returns:
            True if push succeeded
            
        Raises:
            PRCreationError: If push fails
        """
        try:
            repo = Repo(repo_path)
            
            # Get remote
            remote = repo.remote(remote_name)
            
            # Push branch
            remote.push(branch_name)
            
            logger.info(f"Pushed branch {branch_name} to {remote_name}")
            return True
            
        except Exception as e:
            raise PRCreationError(f"Failed to push branch: {e}")
    
    def create_pull_request(
        self,
        repo_owner: str,
        repo_name: str,
        branch_name: str,
        base_branch: str,
        findings: List[Dict[str, Any]],
        title: Optional[str] = None,
        body: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a pull request via GitHub API.
        
        Args:
            repo_owner: Repository owner
            repo_name: Repository name
            branch_name: Name of the branch with changes
            base_branch: Base branch for PR
            findings: List of finding dictionaries
            title: PR title (auto-generated if None)
            body: PR body (auto-generated if None)
            
        Returns:
            PR information dictionary
            
        Raises:
            PRCreationError: If PR creation fails
        """
        try:
            # Get repository
            repo = self.github_client.get_repo(f"{repo_owner}/{repo_name}")
            
            # Generate title if not provided
            if not title:
                title = self._generate_pr_title(findings)
            
            # Generate body if not provided
            if not body:
                body = self._generate_pr_body(findings)
            
            # Create PR
            pr = repo.create_pull(
                title=title,
                body=body,
                head=branch_name,
                base=base_branch
            )
            
            logger.info(f"Created PR #{pr.number}: {pr.html_url}")
            
            return {
                'pr_number': pr.number,
                'pr_url': pr.html_url,
                'title': pr.title,
                'state': pr.state,
                'created_at': pr.created_at.isoformat(),
                'branch': branch_name,
                'base_branch': base_branch
            }
            
        except GithubException as e:
            raise PRCreationError(f"GitHub API error: {e}")
        except Exception as e:
            raise PRCreationError(f"Failed to create PR: {e}")
    
    def _generate_pr_title(self, findings: List[Dict[str, Any]]) -> str:
        """
        Generate a PR title from findings.
        
        Args:
            findings: List of finding dictionaries
            
        Returns:
            Generated PR title
        """
        agent_count = len(set(f.get('agent_role', 'unknown') for f in findings))
        return f"🤖 Codex Improvements from {agent_count} AI Agents"
    
    def _generate_pr_body(self, findings: List[Dict[str, Any]]) -> str:
        """
        Generate a PR body/description from findings.
        
        Args:
            findings: List of finding dictionaries
            
        Returns:
            Generated PR body in markdown
        """
        # Group findings by agent role
        by_role: Dict[str, List[Dict[str, Any]]] = {}
        for finding in findings:
            role = finding.get('agent_role', 'unknown')
            if role not in by_role:
                by_role[role] = []
            by_role[role].append(finding)
        
        body = "## 🤖 Automated Codex Improvements\n\n"
        body += "This PR contains improvements generated by the UnifiedAIToolbox Codex Swarm.\n\n"
        
        body += "### 📊 Analysis Summary\n\n"
        body += f"- **Total Agents**: {len(by_role)}\n"
        body += f"- **Total Shards Analyzed**: {len(findings)}\n\n"
        
        body += "### 🔍 Agent Analysis Breakdown\n\n"
        
        for role, role_findings in sorted(by_role.items()):
            body += f"#### {role.capitalize()} Agent\n"
            body += f"- Analyzed {len(role_findings)} code shards\n"
            
            # Add sample findings if available
            if role_findings and 'log_content' in role_findings[0]:
                sample = role_findings[0]['log_content']
                if sample and len(sample.strip()) > 0:
                    # Truncate if too long
                    if len(sample) > 200:
                        sample = sample[:200] + "..."
                    body += f"- Sample finding: `{sample.strip()}`\n"
            
            body += "\n"
        
        body += "### 🚀 Next Steps\n\n"
        body += "1. Review the changes made by each agent\n"
        body += "2. Run tests to ensure no functionality is broken\n"
        body += "3. Merge if all checks pass\n\n"
        
        body += "---\n"
        body += "*Generated by [UnifiedAIToolbox](https://github.com/xfaith4/UnifiedAIToolbox) Codex Swarm*"
        
        return body
    
    def create_pr_from_run(
        self,
        repo_path: Path,
        repo_owner: str,
        repo_name: str,
        findings: List[Dict[str, Any]],
        base_branch: str = "main",
        branch_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Complete workflow: create branch, commit, push, and create PR.
        
        Args:
            repo_path: Path to the cloned repository
            repo_owner: Repository owner
            repo_name: Repository name
            findings: List of finding dictionaries
            base_branch: Base branch for PR
            branch_name: Custom branch name (auto-generated if None)
            
        Returns:
            PR information dictionary
            
        Raises:
            PRCreationError: If any step fails
        """
        try:
            # Step 1: Create branch
            branch = self.create_branch_from_findings(
                repo_path, branch_name, base_branch
            )
            
            # Step 2: Commit changes
            commit_sha = self.commit_findings(repo_path, findings)
            
            # Step 3: Push branch
            self.push_branch(repo_path, branch)
            
            # Step 4: Create PR
            pr_info = self.create_pull_request(
                repo_owner, repo_name, branch, base_branch, findings
            )
            
            pr_info['commit_sha'] = commit_sha
            pr_info['branch_created'] = branch
            
            return pr_info
            
        except Exception as e:
            raise PRCreationError(f"PR workflow failed: {e}")
    
    def get_pr_status(self, repo_owner: str, repo_name: str, pr_number: int) -> Dict[str, Any]:
        """
        Get the status of a pull request.
        
        Args:
            repo_owner: Repository owner
            repo_name: Repository name
            pr_number: PR number
            
        Returns:
            PR status information
            
        Raises:
            PRCreationError: If status retrieval fails
        """
        try:
            repo = self.github_client.get_repo(f"{repo_owner}/{repo_name}")
            pr = repo.get_pull(pr_number)
            
            return {
                'pr_number': pr.number,
                'state': pr.state,
                'merged': pr.merged,
                'mergeable': pr.mergeable,
                'title': pr.title,
                'html_url': pr.html_url,
                'created_at': pr.created_at.isoformat(),
                'updated_at': pr.updated_at.isoformat(),
                'comments': pr.comments,
                'commits': pr.commits,
                'additions': pr.additions,
                'deletions': pr.deletions
            }
            
        except GithubException as e:
            raise PRCreationError(f"GitHub API error: {e}")
        except Exception as e:
            raise PRCreationError(f"Failed to get PR status: {e}")
