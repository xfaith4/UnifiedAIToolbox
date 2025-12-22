"""
Unit tests for GitHub API endpoints.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from fastapi.testclient import TestClient
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Mock the GitHub services before importing app
sys.modules['github_integration'] = MagicMock()
sys.modules['github_integration.clone_service'] = MagicMock()
sys.modules['github_integration.pr_service'] = MagicMock()
sys.modules['github_integration.repo_intake_service'] = MagicMock()
sys.modules['github_integration.supervisor_planner'] = MagicMock()
sys.modules['shared'] = MagicMock()
sys.modules['shared.github_core'] = MagicMock()
sys.path.insert(0, str(Path(__file__).parent.parent))

# Mock the GitHub services before importing app
sys.modules['github_integration'] = MagicMock()
sys.modules['github_integration.clone_service'] = MagicMock()
sys.modules['github_integration.pr_service'] = MagicMock()
sys.modules['github_integration.repo_intake_service'] = MagicMock()
sys.modules['shared'] = MagicMock()
sys.modules['shared.github_core'] = MagicMock()

from github_api import router
from fastapi import FastAPI

app = FastAPI()
app.include_router(router)
client = TestClient(app)


class TestGitHubStatus:
    """Tests for GitHub status endpoint."""
    
    def test_status_endpoint(self):
        """Test GitHub status endpoint returns expected structure."""
        response = client.get("/github/status")
        assert response.status_code == 200
        
        data = response.json()
        assert "available" in data
        assert "authenticated" in data
        assert "message" in data


class TestRepoIntake:
    """Tests for repository intake endpoint."""

    @patch('github_api.GITHUB_AVAILABLE', True)
    @patch('github_api.RepoIntakeService')
    def test_repo_intake_success(self, mock_service_class):
        """Intake endpoint should return generated intake data."""
        mock_service = Mock()
        mock_service.run_intake.return_value = {"run_id": "r1", "repo_url": "https://example.com/repo"}
        mock_service_class.return_value = mock_service

        response = client.post(
            "/github/repos/intake",
            json={"repo_url": "https://example.com/repo", "run_id": "r1"},
            headers={"Authorization": "Bearer token"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["intake"]["run_id"] == "r1"
        mock_service.run_intake.assert_called_once()

    @patch('github_api.GITHUB_AVAILABLE', True)
    @patch('github_api.RepoIntakeService')
    def test_repo_intake_error(self, mock_service_class):
        """RepoIntakeError should surface as 400."""
        Err = type('IntakeErr', (Exception,), {})
        with patch('github_api.RepoIntakeError', new=Err):
            mock_service = Mock()
            mock_service.run_intake.side_effect = Err("fail")
            mock_service_class.return_value = mock_service

            response = client.post(
                "/github/repos/intake",
                json={"repo_url": "https://example.com/repo", "run_id": "r2"},
            )

            assert response.status_code == 400


class TestTaskGraph:
    """Tests for task graph generation endpoint."""

    @patch('github_api.GITHUB_AVAILABLE', True)
    @patch('github_api.SupervisorPlanner')
    def test_taskgraph_success(self, mock_planner_class):
        mock_planner = Mock()
        mock_planner.generate_taskgraph.return_value = {"tasks": []}
        mock_planner_class.return_value = mock_planner

        response = client.post(
            "/github/supervisor/taskgraph",
            json={
                "run_id": "r1",
                "user_goal": "Do work",
                "constraints": {"allowed_paths": ["src"], "max_parallel": 2, "risk_posture": "standard"},
                "intake": {"build_signals": []},
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert "taskgraph" in data
        mock_planner.generate_taskgraph.assert_called_once()

    @patch('github_api.GITHUB_AVAILABLE', True)
    @patch('github_api.SupervisorPlanner')
    def test_taskgraph_missing_intake_file(self, mock_planner_class):
        """Missing intake on disk should return 400."""
        mock_planner = Mock()
        mock_planner_class.return_value = mock_planner

        response = client.post(
            "/github/supervisor/taskgraph",
            json={
                "run_id": "missing",
                "user_goal": "Do work",
                "constraints": {},
            },
        )

        assert response.status_code == 400


class TestListAccessibleRepositories:
    """Tests for accessible repository listing endpoint."""
    
    @patch('github_api.GITHUB_AVAILABLE', True)
    @patch('github_api.GitHubCloneService')
    def test_list_accessible_repos_success(self, mock_service_class):
        """Token-based listing should return repositories."""
        mock_service = Mock()
        mock_service.list_accessible_repos.return_value = [{
            "id": 1,
            "full_name": "owner/repo",
            "name": "repo",
            "owner": "owner",
            "description": "Repo description",
            "html_url": "https://github.com/owner/repo",
            "private": True
        }]
        mock_service_class.return_value = mock_service
        
        response = client.get(
            "/github/repos",
            headers={"Authorization": "Bearer testtoken"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["full_name"] == "owner/repo"
        mock_service.list_accessible_repos.assert_called_once()
    
    @patch('github_api.GITHUB_AVAILABLE', True)
    def test_list_accessible_repos_missing_token(self):
        """Token is required for listing repositories."""
        response = client.get("/github/repos")
        assert response.status_code == 401
    
    @patch('github_api.GITHUB_AVAILABLE', True)
    @patch('github_api.GitHubCloneService')
    def test_list_accessible_repos_service_error(self, mock_service_class):
        """RepositoryCloneError should propagate as 400."""
        RepoErr = type('RepoErr', (Exception,), {})
        
        with patch('github_api.RepositoryCloneError', new=RepoErr):
            mock_service = Mock()
            mock_service.list_accessible_repos.side_effect = RepoErr("scope error")
            mock_service_class.return_value = mock_service
            
            response = client.get(
                "/github/repos",
                headers={"Authorization": "Bearer testtoken"}
            )
            
            assert response.status_code == 400


class TestGitHubAuth:
    """Tests for GitHub authentication endpoints."""
        assert "authenticated" in data
        assert "message" in data


class TestRepoIntake:
    """Tests for repository intake endpoint."""

    @patch('github_api.GITHUB_AVAILABLE', True)
    @patch('github_api.RepoIntakeService')
    def test_repo_intake_success(self, mock_service_class):
        """Intake endpoint should return generated intake data."""
        mock_service = Mock()
        mock_service.run_intake.return_value = {"run_id": "r1", "repo_url": "https://example.com/repo"}
        mock_service_class.return_value = mock_service

        response = client.post(
            "/github/repos/intake",
            json={"repo_url": "https://example.com/repo", "run_id": "r1"},
            headers={"Authorization": "Bearer token"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["intake"]["run_id"] == "r1"
        mock_service.run_intake.assert_called_once()

    @patch('github_api.GITHUB_AVAILABLE', True)
    @patch('github_api.RepoIntakeService')
    def test_repo_intake_error(self, mock_service_class):
        """RepoIntakeError should surface as 400."""
        Err = type('IntakeErr', (Exception,), {})
        with patch('github_api.RepoIntakeError', new=Err):
            mock_service = Mock()
            mock_service.run_intake.side_effect = Err("fail")
            mock_service_class.return_value = mock_service

            response = client.post(
                "/github/repos/intake",
                json={"repo_url": "https://example.com/repo", "run_id": "r2"},
            )

            assert response.status_code == 400


class TestListAccessibleRepositories:
    """Tests for accessible repository listing endpoint."""
    
    @patch('github_api.GITHUB_AVAILABLE', True)
    @patch('github_api.GitHubCloneService')
    def test_list_accessible_repos_success(self, mock_service_class):
        """Token-based listing should return repositories."""
        mock_service = Mock()
        mock_service.list_accessible_repos.return_value = [{
            "id": 1,
            "full_name": "owner/repo",
            "name": "repo",
            "owner": "owner",
            "description": "Repo description",
            "html_url": "https://github.com/owner/repo",
            "private": True
        }]
        mock_service_class.return_value = mock_service
        
        response = client.get(
            "/github/repos",
            headers={"Authorization": "Bearer testtoken"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["full_name"] == "owner/repo"
        mock_service.list_accessible_repos.assert_called_once()
    
    @patch('github_api.GITHUB_AVAILABLE', True)
    def test_list_accessible_repos_missing_token(self):
        """Token is required for listing repositories."""
        response = client.get("/github/repos")
        assert response.status_code == 401
    
    @patch('github_api.GITHUB_AVAILABLE', True)
    @patch('github_api.GitHubCloneService')
    def test_list_accessible_repos_service_error(self, mock_service_class):
        """RepositoryCloneError should propagate as 400."""
        RepoErr = type('RepoErr', (Exception,), {})
        
        with patch('github_api.RepositoryCloneError', new=RepoErr):
            mock_service = Mock()
            mock_service.list_accessible_repos.side_effect = RepoErr("scope error")
            mock_service_class.return_value = mock_service
            
            response = client.get(
                "/github/repos",
                headers={"Authorization": "Bearer testtoken"}
            )
            
            assert response.status_code == 400


class TestGitHubAuth:
    """Tests for GitHub authentication endpoints."""
    
    @patch('github_api.GITHUB_AVAILABLE', True)
    @patch('github.Github')
    def test_verify_auth_success(self, mock_github_class):
        """Test successful GitHub authentication verification."""
        # Setup mock
        mock_user = Mock()
        mock_user.login = "testuser"
        
        mock_gh_instance = Mock()
        mock_gh_instance.get_user.return_value = mock_user
        mock_github_class.return_value = mock_gh_instance
        
        response = client.post(
            "/github/auth/verify",
            json={"token": "test_token"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["authenticated"] is True
        assert data["username"] == "testuser"
    
    @patch('github_api.GITHUB_AVAILABLE', False)
    def test_verify_auth_unavailable(self):
        """Test authentication when GitHub integration is unavailable."""
        response = client.post(
            "/github/auth/verify",
            json={"token": "test_token"}
        )
        
        assert response.status_code == 503


class TestRepositoryMetadata:
    """Tests for repository metadata endpoint."""
    
    @patch('github_api.GITHUB_AVAILABLE', True)
    @patch('github_api.GitHubCloneService')
    def test_get_repo_metadata_success(self, mock_service_class):
        """Test successful repository metadata retrieval."""
        # Setup mock
        mock_service = Mock()
        mock_service.get_repo_metadata.return_value = {
            'full_name': 'owner/repo',
            'name': 'repo',
            'owner': 'owner',
            'description': 'Test repository',
            'clone_url': 'https://github.com/owner/repo.git',
            'html_url': 'https://github.com/owner/repo',
            'stars': 100,
            'forks': 50,
            'language': 'Python',
            'size': 1024,
            'default_branch': 'main',
            'topics': ['python', 'testing'],
            'private': False,
            'archived': False,
            'updated_at': '2023-01-01T00:00:00Z'
        }
        mock_service_class.return_value = mock_service
        
        response = client.get("/github/repos/owner/repo")
        
        assert response.status_code == 200
        data = response.json()
        assert data['full_name'] == 'owner/repo'
        assert data['stars'] == 100
        assert 'python' in data['topics']
    
    @patch('github_api.GITHUB_AVAILABLE', False)
    def test_get_repo_metadata_unavailable(self):
        """Test metadata retrieval when GitHub is unavailable."""
        response = client.get("/github/repos/owner/repo")
        assert response.status_code == 503


class TestRepositoryClone:
    """Tests for repository cloning endpoint."""
    
    @patch('github_api.GITHUB_AVAILABLE', True)
    @patch('github_api.GitHubCloneService')
    @patch('github_api.parse_repo_url')
    def test_clone_repo_success(self, mock_parse, mock_service_class):
        """Test successful repository cloning."""
        # Setup mocks
        mock_parse.return_value = ('owner', 'repo')
        
        mock_service = Mock()
        mock_service.clone_repository.return_value = Path('/tmp/clones/repo_12345')
        mock_service.get_file_tree.return_value = {
            'name': 'repo',
            'type': 'directory',
            'children': []
        }
        mock_service_class.return_value = mock_service
        
        response = client.post(
            "/github/repos/clone",
            json={"repo_url": "https://github.com/owner/repo"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert 'clone_id' in data
        assert 'repo_path' in data
        assert data['owner'] == 'owner'
        assert data['repo_name'] == 'repo'
    
    @patch('github_api.GITHUB_AVAILABLE', True)
    @patch('github_api.GitHubCloneService')
    @patch('github_api.parse_repo_url')
    def test_clone_repo_with_branch(self, mock_parse, mock_service_class):
        """Test cloning with specific branch."""
        mock_parse.return_value = ('owner', 'repo')
        
        mock_service = Mock()
        mock_service.clone_repository.return_value = Path('/tmp/clones/repo_12345')
        mock_service.get_file_tree.return_value = {'name': 'repo', 'type': 'directory', 'children': []}
        mock_service_class.return_value = mock_service
        
        response = client.post(
            "/github/repos/clone",
            json={
                "repo_url": "https://github.com/owner/repo",
                "branch": "develop"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data['branch'] == 'develop'


class TestPullRequests:
    """Tests for pull request endpoints."""
    
    @patch('github_api.GITHUB_AVAILABLE', True)
    @patch('github.Github')
    @patch.dict('os.environ', {'GITHUB_TOKEN': 'test_token'})
    def test_list_pull_requests(self, mock_github_class):
        """Test listing pull requests."""
        # Setup mocks
        mock_pr = Mock()
        mock_pr.number = 1
        mock_pr.title = "Test PR"
        mock_pr.state = "open"
        mock_pr.html_url = "https://github.com/owner/repo/pull/1"
        mock_pr.created_at = MagicMock()
        mock_pr.created_at.isoformat.return_value = "2023-01-01T00:00:00"
        mock_pr.updated_at = MagicMock()
        mock_pr.updated_at.isoformat.return_value = "2023-01-02T00:00:00"
        mock_pr.user.login = "testuser"
        mock_pr.base.ref = "main"
        mock_pr.head.ref = "feature"
        mock_pr.draft = False
        mock_pr.mergeable = True
        
        mock_repo = Mock()
        mock_repo.get_pulls.return_value = [mock_pr]
        
        mock_gh = Mock()
        mock_gh.get_repo.return_value = mock_repo
        mock_github_class.return_value = mock_gh
        
        response = client.get("/github/repos/owner/repo/pulls")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]['number'] == 1
        assert data[0]['title'] == "Test PR"
    
    @patch('github_api.GITHUB_AVAILABLE', True)
    def test_list_pull_requests_no_token(self):
        """Test listing PRs without token returns error."""
        response = client.get("/github/repos/owner/repo/pulls")
        assert response.status_code == 401


class TestIssues:
    """Tests for issue endpoints."""
    
    @patch('github_api.GITHUB_AVAILABLE', True)
    @patch('github.Github')
    @patch.dict('os.environ', {'GITHUB_TOKEN': 'test_token'})
    def test_list_issues(self, mock_github_class):
        """Test listing issues."""
        # Setup mocks
        mock_issue = Mock()
        mock_issue.number = 1
        mock_issue.title = "Test Issue"
        mock_issue.state = "open"
        mock_issue.html_url = "https://github.com/owner/repo/issues/1"
        mock_issue.created_at = MagicMock()
        mock_issue.created_at.isoformat.return_value = "2023-01-01T00:00:00"
        mock_issue.updated_at = MagicMock()
        mock_issue.updated_at.isoformat.return_value = "2023-01-02T00:00:00"
        mock_issue.user.login = "testuser"
        mock_issue.labels = []
        mock_issue.comments = 5
        mock_issue.pull_request = None  # Not a PR
        
        mock_repo = Mock()
        mock_repo.get_issues.return_value = [mock_issue]
        
        mock_gh = Mock()
        mock_gh.get_repo.return_value = mock_repo
        mock_github_class.return_value = mock_gh
        
        response = client.get("/github/repos/owner/repo/issues")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]['number'] == 1
        assert data[0]['title'] == "Test Issue"
        assert data[0]['comments'] == 5


class TestBranches:
    """Tests for branch endpoints."""
    
    @patch('github_api.GITHUB_AVAILABLE', True)
    @patch('github.Github')
    @patch.dict('os.environ', {'GITHUB_TOKEN': 'test_token'})
    def test_list_branches(self, mock_github_class):
        """Test listing branches."""
        # Setup mocks
        mock_branch1 = Mock()
        mock_branch1.name = "main"
        mock_branch2 = Mock()
        mock_branch2.name = "develop"
        
        mock_repo = Mock()
        mock_repo.get_branches.return_value = [mock_branch1, mock_branch2]
        
        mock_gh = Mock()
        mock_gh.get_repo.return_value = mock_repo
        mock_github_class.return_value = mock_gh
        
        response = client.get("/github/repos/owner/repo/branches")
        
        assert response.status_code == 200
        data = response.json()
        assert "branches" in data
        assert "main" in data["branches"]
        assert "develop" in data["branches"]


class TestOrchestrationIntegration:
    """Tests for orchestration integration endpoints."""
    
    @patch('github_api.GITHUB_AVAILABLE', True)
    @patch('github_api.GitHubCloneService')
    @patch('github_api.parse_repo_url')
    def test_run_orchestration_on_repo(self, mock_parse, mock_service_class):
        """Test running orchestration on a repository."""
        mock_parse.return_value = ('owner', 'repo')
        
        mock_service = Mock()
        mock_service.clone_repository.return_value = Path('/tmp/clones/orch_owner_repo_12345')
        mock_service_class.return_value = mock_service
        
        response = client.post(
            "/github/orchestration/run",
            json={
                "repo_url": "https://github.com/owner/repo",
                "create_pr": False
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert 'run_id' in data
        assert 'repo_path' in data
        assert data['status'] == 'cloned'
        assert 'orch_owner_repo' in data['run_id']
    
    @patch('github_api.GITHUB_AVAILABLE', True)
    @patch('github_api.GitHubPRService')
    @patch.dict('os.environ', {'GITHUB_TOKEN': 'test_token'})
    def test_upload_orchestration_results(self, mock_pr_service_class):
        """Test uploading orchestration results as PR."""
        # Setup mock
        mock_pr_service = Mock()
        mock_pr_service.create_pr_from_run.return_value = {
            'pr_number': 42,
            'pr_url': 'https://github.com/owner/repo/pull/42',
            'title': 'Test PR',
            'state': 'open',
            'branch_created': 'codex-improvements-12345',
            'base_branch': 'main',
            'commit_sha': 'abc123'
        }
        mock_pr_service_class.return_value = mock_pr_service
        
        # Create a temporary directory to simulate repo path
        import tempfile
        with tempfile.TemporaryDirectory() as tmpdir:
            response = client.post(
                "/github/orchestration/upload-results",
                json={
                    "repo_path": tmpdir,
                    "repo_owner": "owner",
                    "repo_name": "repo",
                    "base_branch": "main",
                    "findings": []
                }
            )
            
            assert response.status_code == 200
            data = response.json()
            assert data['pr_number'] == 42
            assert data['pr_url'] == 'https://github.com/owner/repo/pull/42'
    
    @patch('github_api.GITHUB_AVAILABLE', True)
    def test_upload_results_no_token(self):
        """Test uploading results without token returns error."""
        response = client.post(
            "/github/orchestration/upload-results",
            json={
                "repo_path": "/tmp/test",
                "repo_owner": "owner",
                "repo_name": "repo"
            }
        )
        
        assert response.status_code == 401


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
