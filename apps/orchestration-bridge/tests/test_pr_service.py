"""
Unit tests for PR creation service.
"""

import unittest
from unittest.mock import Mock, MagicMock, patch, call
from pathlib import Path
import tempfile
import os

# Add parent directory to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from github_integration.pr_service import GitHubPRService, PRCreationError


class TestGitHubPRService(unittest.TestCase):
    """Test cases for GitHubPRService."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.mock_token = "test_token_123"
        os.environ['GITHUB_TOKEN'] = self.mock_token
        
        # Sample findings
        self.sample_findings = [
            {
                'id': '1',
                'agent_role': 'critic',
                'shard': 'shard_1',
                'log_content': 'Found code quality issues'
            },
            {
                'id': '2',
                'agent_role': 'security',
                'shard': 'shard_2',
                'log_content': 'Security vulnerability detected'
            },
            {
                'id': '3',
                'agent_role': 'critic',
                'shard': 'shard_3',
                'log_content': 'More quality improvements'
            }
        ]
    
    def tearDown(self):
        """Clean up after tests."""
        if 'GITHUB_TOKEN' in os.environ:
            del os.environ['GITHUB_TOKEN']
    
    @patch('github_integration.pr_service.Github')
    def test_init_with_token(self, mock_github):
        """Test initialization with GitHub token."""
        service = GitHubPRService(github_token=self.mock_token)
        
        self.assertEqual(service.github_token, self.mock_token)
        mock_github.assert_called_once_with(self.mock_token)
    
    def test_init_without_token_raises_error(self):
        """Test initialization without token raises error."""
        del os.environ['GITHUB_TOKEN']
        
        with self.assertRaises(ValueError):
            GitHubPRService()
    
    @patch('github_integration.pr_service.Github')
    @patch('github_integration.pr_service.Repo')
    def test_create_branch_from_findings(self, mock_repo_class, mock_github):
        """Test creating a new branch."""
        service = GitHubPRService(github_token=self.mock_token)
        
        # Mock repository
        mock_repo = MagicMock()
        mock_repo_class.return_value = mock_repo
        mock_head = MagicMock()
        mock_repo.create_head.return_value = mock_head
        
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_path = Path(tmpdir)
            branch_name = service.create_branch_from_findings(
                repo_path,
                branch_name="test-branch"
            )
            
            self.assertEqual(branch_name, "test-branch")
            mock_repo.create_head.assert_called_once_with("test-branch")
            mock_head.checkout.assert_called_once()
    
    @patch('github_integration.pr_service.Github')
    @patch('github_integration.pr_service.Repo')
    def test_create_branch_auto_generated_name(self, mock_repo_class, mock_github):
        """Test creating branch with auto-generated name."""
        service = GitHubPRService(github_token=self.mock_token)
        
        mock_repo = MagicMock()
        mock_repo_class.return_value = mock_repo
        mock_head = MagicMock()
        mock_repo.create_head.return_value = mock_head
        
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_path = Path(tmpdir)
            branch_name = service.create_branch_from_findings(repo_path)
            
            # Should start with 'codex-improvements-'
            self.assertTrue(branch_name.startswith("codex-improvements-"))
    
    @patch('github_integration.pr_service.Github')
    @patch('github_integration.pr_service.Repo')
    def test_commit_findings(self, mock_repo_class, mock_github):
        """Test committing changes from findings."""
        service = GitHubPRService(github_token=self.mock_token)
        
        mock_repo = MagicMock()
        mock_repo_class.return_value = mock_repo
        mock_repo.is_dirty.return_value = True
        mock_commit = MagicMock()
        mock_commit.hexsha = "abc123def456"
        mock_repo.index.commit.return_value = mock_commit
        
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_path = Path(tmpdir)
            commit_sha = service.commit_findings(
                repo_path,
                self.sample_findings,
                commit_message="Test commit"
            )
            
            self.assertEqual(commit_sha, "abc123def456")
            mock_repo.git.add.assert_called_once_with(A=True)
            mock_repo.index.commit.assert_called_once_with("Test commit")
    
    @patch('github_integration.pr_service.Github')
    @patch('github_integration.pr_service.Repo')
    def test_commit_no_changes(self, mock_repo_class, mock_github):
        """Test committing when there are no changes."""
        service = GitHubPRService(github_token=self.mock_token)
        
        mock_repo = MagicMock()
        mock_repo_class.return_value = mock_repo
        mock_repo.is_dirty.return_value = False
        mock_repo.head.commit.hexsha = "existing123"
        
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_path = Path(tmpdir)
            commit_sha = service.commit_findings(repo_path, self.sample_findings)
            
            # Should return existing commit
            self.assertEqual(commit_sha, "existing123")
            mock_repo.index.commit.assert_not_called()
    
    @patch('github_integration.pr_service.Github')
    def test_generate_commit_message(self, mock_github):
        """Test commit message generation."""
        service = GitHubPRService(github_token=self.mock_token)
        
        message = service._generate_commit_message(self.sample_findings)
        
        self.assertIn("2 agents", message)
        self.assertIn("3 shards", message)
        self.assertIn("Critic", message)
        self.assertIn("Security", message)
    
    @patch('github_integration.pr_service.Github')
    @patch('github_integration.pr_service.Repo')
    def test_push_branch(self, mock_repo_class, mock_github):
        """Test pushing branch to remote."""
        service = GitHubPRService(github_token=self.mock_token)
        
        mock_repo = MagicMock()
        mock_repo_class.return_value = mock_repo
        mock_remote = MagicMock()
        mock_repo.remote.return_value = mock_remote
        
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_path = Path(tmpdir)
            success = service.push_branch(repo_path, "test-branch")
            
            self.assertTrue(success)
            mock_repo.remote.assert_called_once_with("origin")
            mock_remote.push.assert_called_once_with("test-branch")
    
    @patch('github_integration.pr_service.Github')
    def test_create_pull_request(self, mock_github_class):
        """Test creating a pull request via GitHub API."""
        mock_github = MagicMock()
        mock_github_class.return_value = mock_github
        
        service = GitHubPRService(github_token=self.mock_token)
        
        # Mock repository and PR
        mock_repo = MagicMock()
        mock_github.get_repo.return_value = mock_repo
        
        mock_pr = MagicMock()
        mock_pr.number = 42
        mock_pr.html_url = "https://github.com/owner/repo/pull/42"
        mock_pr.title = "Test PR"
        mock_pr.state = "open"
        mock_pr.created_at = Mock()
        mock_pr.created_at.isoformat.return_value = "2025-01-01T00:00:00"
        
        mock_repo.create_pull.return_value = mock_pr
        
        # Create PR
        pr_info = service.create_pull_request(
            repo_owner="owner",
            repo_name="repo",
            branch_name="test-branch",
            base_branch="main",
            findings=self.sample_findings,
            title="Custom Title",
            body="Custom Body"
        )
        
        self.assertEqual(pr_info['pr_number'], 42)
        self.assertEqual(pr_info['pr_url'], "https://github.com/owner/repo/pull/42")
        self.assertEqual(pr_info['state'], "open")
        
        mock_github.get_repo.assert_called_once_with("owner/repo")
        mock_repo.create_pull.assert_called_once_with(
            title="Custom Title",
            body="Custom Body",
            head="test-branch",
            base="main"
        )
    
    @patch('github_integration.pr_service.Github')
    def test_generate_pr_title(self, mock_github):
        """Test PR title generation."""
        service = GitHubPRService(github_token=self.mock_token)
        
        title = service._generate_pr_title(self.sample_findings)
        
        self.assertIn("2", title)  # 2 agents
        self.assertIn("🤖", title)  # Robot emoji
    
    @patch('github_integration.pr_service.Github')
    def test_generate_pr_body(self, mock_github):
        """Test PR body generation."""
        service = GitHubPRService(github_token=self.mock_token)
        
        body = service._generate_pr_body(self.sample_findings)
        
        self.assertIn("2", body)  # 2 agents
        self.assertIn("3", body)  # 3 shards
        self.assertIn("Critic", body)
        self.assertIn("Security", body)
        self.assertIn("UnifiedAIToolbox", body)
    
    @patch('github_integration.pr_service.Github')
    def test_get_pr_status(self, mock_github_class):
        """Test getting PR status."""
        mock_github = MagicMock()
        mock_github_class.return_value = mock_github
        
        service = GitHubPRService(github_token=self.mock_token)
        
        # Mock repository and PR
        mock_repo = MagicMock()
        mock_github.get_repo.return_value = mock_repo
        
        mock_pr = MagicMock()
        mock_pr.number = 42
        mock_pr.state = "open"
        mock_pr.merged = False
        mock_pr.mergeable = True
        mock_pr.title = "Test PR"
        mock_pr.html_url = "https://github.com/owner/repo/pull/42"
        mock_pr.created_at = Mock()
        mock_pr.created_at.isoformat.return_value = "2025-01-01T00:00:00"
        mock_pr.updated_at = Mock()
        mock_pr.updated_at.isoformat.return_value = "2025-01-02T00:00:00"
        mock_pr.comments = 5
        mock_pr.commits = 2
        mock_pr.additions = 100
        mock_pr.deletions = 50
        
        mock_repo.get_pull.return_value = mock_pr
        
        # Get status
        status = service.get_pr_status("owner", "repo", 42)
        
        self.assertEqual(status['pr_number'], 42)
        self.assertEqual(status['state'], "open")
        self.assertFalse(status['merged'])
        self.assertEqual(status['comments'], 5)
        self.assertEqual(status['commits'], 2)
        
        mock_github.get_repo.assert_called_once_with("owner/repo")
        mock_repo.get_pull.assert_called_once_with(42)


if __name__ == '__main__':
    unittest.main()
