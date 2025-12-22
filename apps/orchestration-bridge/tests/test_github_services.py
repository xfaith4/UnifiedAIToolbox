"""
Unit tests for GitHub integration services.
"""

import pytest
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch
import sys

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from github_integration.clone_service import GitHubCloneService, RepositoryCloneError, CloneProgress
from github_integration.codex_service import CodexSwarmService, CodexRunStatus
from github import GithubException


class TestCloneProgress:
    """Tests for CloneProgress class."""
    
    def test_progress_callback(self):
        """Test that progress callback is called with correct data."""
        called_with = []
        
        def callback(data):
            called_with.append(data)
        
        progress = CloneProgress(callback=callback)
        progress.update(progress.RECEIVING, 50, 100, "Receiving objects")
        
        assert len(called_with) == 1
        assert called_with[0]['current'] == 50
        assert called_with[0]['total'] == 100
        assert called_with[0]['percent'] == 50
        assert 'Receiving' in called_with[0]['stage']
    
    def test_stage_names(self):
        """Test stage name mapping."""
        progress = CloneProgress()
        
        assert 'Receiving' in progress._get_stage_name(progress.RECEIVING)
        assert 'Counting' in progress._get_stage_name(progress.COUNTING)
        assert 'Resolving' in progress._get_stage_name(progress.RESOLVING)


class TestGitHubCloneService:
    """Tests for GitHubCloneService class."""
    
    def test_initialization(self):
        """Test service initialization."""
        with tempfile.TemporaryDirectory() as tmpdir:
            service = GitHubCloneService(clone_base_dir=Path(tmpdir))
            assert service.clone_base_dir.exists()
            assert service.clone_base_dir == Path(tmpdir)
    
    def test_initialization_with_token(self):
        """Test initialization with GitHub token."""
        with tempfile.TemporaryDirectory() as tmpdir:
            service = GitHubCloneService(
                github_token="test_token",
                clone_base_dir=Path(tmpdir)
            )
            assert service.github_token == "test_token"
    
    @patch('shared.github_core.Github')
    def test_get_repo_metadata_success(self, mock_github):
        """Test successful repository metadata fetching."""
        # Setup mock
        mock_repo = Mock()
        mock_repo.full_name = "owner/repo"
        mock_repo.name = "repo"
        mock_repo.owner.login = "owner"
        mock_repo.description = "Test repo"
        mock_repo.stargazers_count = 100
        mock_repo.forks_count = 50
        mock_repo.language = "Python"
        mock_repo.size = 1024
        mock_repo.default_branch = "main"
        mock_repo.clone_url = "https://github.com/owner/repo.git"
        mock_repo.ssh_url = "git@github.com:owner/repo.git"
        mock_repo.html_url = "https://github.com/owner/repo"
        mock_repo.created_at = None
        mock_repo.updated_at = None
        mock_repo.open_issues_count = 5
        mock_repo.private = False
        mock_repo.archived = False
        mock_repo.get_topics.return_value = ["python", "testing"]
        
        mock_github_instance = Mock()
        mock_github_instance.get_repo.return_value = mock_repo
        mock_github.return_value = mock_github_instance
        
        with tempfile.TemporaryDirectory() as tmpdir:
            service = GitHubCloneService(
                github_token="test_token",
                clone_base_dir=Path(tmpdir)
            )
            service.github_client = mock_github_instance
            
            metadata = service.get_repo_metadata("owner", "repo")
            
            assert metadata['full_name'] == "owner/repo"
            assert metadata['stars'] == 100
            assert metadata['language'] == "Python"
            assert "python" in metadata['topics']
    
    @patch('shared.github_core.Github')
    def test_get_repo_metadata_no_token(self, mock_github):
        """Test metadata fetch without token raises error."""
        with tempfile.TemporaryDirectory() as tmpdir:
            service = GitHubCloneService(clone_base_dir=Path(tmpdir))
            service.github_client = None
            
            with pytest.raises(RepositoryCloneError, match="token required"):
                service.get_repo_metadata("owner", "repo")
    
    def test_file_tree_generation(self):
        """Test file tree generation."""
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_dir = Path(tmpdir) / "test_repo"
            repo_dir.mkdir()
            
            # Create test structure
            (repo_dir / "file1.txt").write_text("test")
            (repo_dir / "dir1").mkdir()
            (repo_dir / "dir1" / "file2.txt").write_text("test")
            
            service = GitHubCloneService(clone_base_dir=Path(tmpdir))
            tree = service.get_file_tree(repo_dir, max_depth=2)
            
            assert tree['name'] == "test_repo"
            assert tree['type'] == "directory"
            assert len(tree['children']) >= 2
    
    def test_list_accessible_repos_requires_token(self):
        """Listing repositories should require authentication."""
        with tempfile.TemporaryDirectory() as tmpdir:
            service = GitHubCloneService(clone_base_dir=Path(tmpdir))
            service.github_client = None
            
            with pytest.raises(RepositoryCloneError, match="token required"):
                service.list_accessible_repos()
    
    def test_list_accessible_repos_success(self):
        """Test listing accessible repositories."""
        with tempfile.TemporaryDirectory() as tmpdir:
            service = GitHubCloneService(
                github_token="token",
                clone_base_dir=Path(tmpdir)
            )
            
            mock_repo = Mock()
            mock_repo.id = 1
            mock_repo.full_name = "owner/repo"
            mock_repo.name = "repo"
            mock_repo.owner.login = "owner"
            mock_repo.description = "Test repo"
            mock_repo.html_url = "https://github.com/owner/repo"
            mock_repo.clone_url = "https://github.com/owner/repo.git"
            mock_repo.default_branch = "main"
            mock_repo.private = True
            mock_repo.archived = False
            mock_repo.updated_at = None
            
            mock_core = Mock(remaining=10, reset=0)
            mock_client = Mock()
            mock_client.get_rate_limit.return_value = Mock(core=mock_core)
            mock_user = Mock()
            mock_user.get_repos.return_value = [mock_repo]
            mock_client.get_user.return_value = mock_user
            
            service.github_client = mock_client
            
            repos = service.list_accessible_repos()
            
            assert len(repos) == 1
            assert repos[0]['full_name'] == "owner/repo"
            assert repos[0]['private'] is True
            mock_user.get_repos.assert_called_once_with(
                visibility="all",
                affiliation="owner,collaborator,organization_member"
            )
    
    def test_list_accessible_repos_permission_error(self):
        """Test permission error when listing repositories."""
        with tempfile.TemporaryDirectory() as tmpdir:
            service = GitHubCloneService(
                github_token="token",
                clone_base_dir=Path(tmpdir)
            )
            
            mock_core = Mock(remaining=10, reset=0)
            mock_client = Mock()
            mock_client.get_rate_limit.return_value = Mock(core=mock_core)
            mock_client.get_user.side_effect = GithubException(
                status=403,
                data={"message": "Resource not accessible by integration"},
                headers=None
            )
            
            service.github_client = mock_client
            
            with pytest.raises(RepositoryCloneError, match="missing repository access"):
                service.list_accessible_repos()


class TestCodexSwarmService:
    """Tests for CodexSwarmService class."""
    
    def test_initialization(self):
        """Test service initialization."""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create a dummy script file
            script_path = Path(tmpdir) / "Orchestrate-Codex.ps1"
            script_path.write_text("# dummy script")
            
            service = CodexSwarmService(
                codex_script_path=script_path,
                output_dir=Path(tmpdir) / "runs"
            )
            
            assert service.codex_script_path.exists()
            assert service.output_dir.exists()
    
    def test_initialization_missing_script(self):
        """Test initialization fails with missing script."""
        with tempfile.TemporaryDirectory() as tmpdir:
            with pytest.raises(FileNotFoundError):
                CodexSwarmService(
                    codex_script_path=Path(tmpdir) / "nonexistent.ps1"
                )
    
    def test_start_codex_run(self):
        """Test starting a Codex run."""
        import asyncio
        
        async def run_test():
            with tempfile.TemporaryDirectory() as tmpdir:
                script_path = Path(tmpdir) / "Orchestrate-Codex.ps1"
                script_path.write_text("# dummy script")
                repo_path = Path(tmpdir) / "repo"
                repo_path.mkdir()
                
                service = CodexSwarmService(
                    codex_script_path=script_path,
                    output_dir=Path(tmpdir) / "runs"
                )
                
                # Mock PowerShell check
                with patch.object(service, '_check_powershell_available', return_value=True):
                    run_id = await service.start_codex_run(repo_path)
                    
                    assert run_id in service.active_runs
                    assert service.active_runs[run_id]['status'] == CodexRunStatus.PENDING
                    assert service.active_runs[run_id]['repo_path'] == str(repo_path)
        
        asyncio.run(run_test())
    
    def test_get_run_status(self):
        """Test getting run status."""
        with tempfile.TemporaryDirectory() as tmpdir:
            script_path = Path(tmpdir) / "Orchestrate-Codex.ps1"
            script_path.write_text("# dummy script")
            
            service = CodexSwarmService(
                codex_script_path=script_path,
                output_dir=Path(tmpdir) / "runs"
            )
            
            # Add a mock run
            service.active_runs["test-run"] = {
                'run_id': 'test-run',
                'status': CodexRunStatus.COMPLETED
            }
            
            status = service.get_run_status("test-run")
            assert status is not None
            assert status['run_id'] == "test-run"
            assert status['status'] == CodexRunStatus.COMPLETED


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
