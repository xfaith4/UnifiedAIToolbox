"""
Unit tests for GitHub integration services.
"""

import pytest
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch
import sys
import subprocess
import json

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from github_integration.clone_service import GitHubCloneService, RepositoryCloneError, CloneProgress
from github_integration.codex_service import CodexSwarmService, CodexRunStatus
from github_integration.repo_intake_service import RepoIntakeService, RepoIntakeError
from github_integration.supervisor_planner import SupervisorPlanner, SupervisorPlannerError
from github_integration.task_executor import TaskExecutor, TaskExecutionError
from github_integration.merge_coordinator import MergeCoordinator, MergeCoordinatorError
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


class TestRepoIntakeService:
    """Tests for repository intake generation."""

    @patch('github_integration.repo_intake_service.GitHubCloneService')
    def test_repo_intake_generates_artifacts(self, mock_clone_service):
        """Intake should write artifacts and prune heavy dirs."""
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_dir = Path(tmpdir) / "repo"
            repo_dir.mkdir()
            (repo_dir / "README.md").write_text("# sample", encoding="utf-8")
            (repo_dir / "package.json").write_text('{"scripts": {"test": "jest"}}', encoding="utf-8")
            heavy_dir = repo_dir / "node_modules"
            heavy_dir.mkdir()

            mock_instance = Mock()
            mock_instance.clone_repository.return_value = repo_dir
            # Use real tree to ensure pruning removes heavy dirs
            mock_instance.get_file_tree.side_effect = lambda path, max_depth=5: {
                "name": "repo",
                "type": "directory",
                "children": [
                    {"name": "README.md", "type": "file"},
                    {"name": "package.json", "type": "file"},
                    {"name": "node_modules", "type": "directory", "children": []},
                ],
            }
            mock_clone_service.return_value = mock_instance

            service = RepoIntakeService(runs_dir=Path(tmpdir) / "runs")
            intake = service.run_intake("https://example.com/repo", run_id="run-1")

            assert (Path(tmpdir) / "runs" / "run-1" / "intake.json").exists()
            assert intake["file_tree"]["children"]
            assert all(child["name"] != "node_modules" for child in intake["file_tree"]["children"])
            assert any(signal["type"] == "node" for signal in intake["build_signals"])

    @patch('github_integration.repo_intake_service.GitHubCloneService')
    def test_repo_intake_handles_errors(self, mock_clone_service):
        """Errors should surface as RepoIntakeError."""
        mock_instance = Mock()
        mock_instance.clone_repository.side_effect = RepositoryCloneError("nope")
        mock_clone_service.return_value = mock_instance

        service = RepoIntakeService(runs_dir=Path(tempfile.gettempdir()) / "runs")
        with pytest.raises(RepoIntakeError):
            service.run_intake("bad/repo", run_id="run-err")


class TestSupervisorPlanner:
    """Tests for supervisor planner."""

    def test_generate_taskgraph(self):
        """Planner should write taskgraph artifacts."""
        with tempfile.TemporaryDirectory() as tmpdir:
            runs_dir = Path(tmpdir) / "runs"
            runs_dir.mkdir()
            planner = SupervisorPlanner(runs_dir=runs_dir)

            intake = {"build_signals": [{"type": "node", "commands": ["npm test"]}]}
            constraints = {"allowed_paths": ["src"], "max_parallel": 2, "risk_posture": "standard"}
            graph = planner.generate_taskgraph(
                run_id="run1",
                intake=intake,
                user_goal="Add feature X",
                constraints=constraints,
            )

            assert (runs_dir / "run1" / "taskgraph.json").exists()
            assert graph["tasks"]
            assert all("branch" in t for t in graph["tasks"])

    def test_generate_taskgraph_requires_inputs(self):
        planner = SupervisorPlanner(runs_dir=Path(tempfile.gettempdir()) / "runs")
        with pytest.raises(SupervisorPlannerError):
            planner.generate_taskgraph(run_id="", intake={}, user_goal="goal", constraints={})


class DummyCodexService:
    """Stub CodexSwarmService for task execution tests."""

    def __init__(self):
        self.runs = {}

    async def start_codex_run(
        self,
        repo_path: Path,
        model: str = "gpt-4",
        max_parallel: int = 3,
        run_id: str | None = None,
        goal: str | None = None,
    ) -> str:
        run_id = run_id or "run"
        self.runs[run_id] = {"repo_path": str(repo_path), "status": CodexRunStatus.PENDING}
        return run_id

    async def execute_codex_run(self, run_id: str):
        # Simulate a single progress message
        repo_path = Path(self.runs[run_id]["repo_path"])
        # Simulate a change outside allowed scope to test violations
        (repo_path / "outside.txt").write_text("change", encoding="utf-8")
        self.runs[run_id]["status"] = CodexRunStatus.COMPLETED
        yield {"run_id": run_id, "status": CodexRunStatus.COMPLETED}

    def get_run_status(self, run_id: str):
        return {"run_id": run_id, "status": self.runs.get(run_id, {}).get("status")}

    def get_findings(self, run_id: str):
        return [{"id": "1", "agent_role": "analyst", "shard": "0", "log_excerpt": "done"}]


class TestTaskExecutor:
    """Tests for task executor."""

    def _init_repo(self, tmpdir: str) -> Path:
        repo_path = Path(tmpdir) / "repo"
        repo_path.mkdir()
        (repo_path / "README.md").write_text("hello", encoding="utf-8")
        subprocess.run(["git", "-C", str(repo_path), "init"], check=True, stdout=subprocess.PIPE, text=True)
        subprocess.run(["git", "-C", str(repo_path), "add", "."], check=True, stdout=subprocess.PIPE, text=True)
        subprocess.run(["git", "-C", str(repo_path), "commit", "-m", "init"], check=True, stdout=subprocess.PIPE, text=True)
        return repo_path

    def _write_taskgraph(self, runs_dir: Path, run_id: str, repo_path: Path, allow: str) -> Path:
        tg = {
            "tasks": [
                {
                    "id": "task1",
                    "title": "Test Task",
                    "rationale": "test",
                    "file_scope": [allow],
                    "conflict_group": "g1",
                    "dependencies": [],
                    "validation": ["echo ok"],
                }
            ]
        }
        tg_path = runs_dir / run_id / "taskgraph.json"
        tg_path.parent.mkdir(parents=True, exist_ok=True)
        tg_path.write_text(json.dumps(tg), encoding="utf-8")
        return tg_path

    def test_execute_taskgraph_happy_path(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_path = self._init_repo(tmpdir)
            runs_dir = Path(tmpdir) / "runs"
            tg_path = self._write_taskgraph(runs_dir, "run1", repo_path, ".")

            executor = TaskExecutor(runs_dir=runs_dir, codex_service=DummyCodexService())
            result = executor.execute_taskgraph(repo_path=repo_path, run_id="run1", taskgraph_path=tg_path)

            assert result["tasks"][0]["status"] == "completed"
            diff_file = Path(result["tasks"][0]["artifacts"]["diff"])
            assert diff_file.exists()

    def test_execute_taskgraph_scope_violation(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_path = self._init_repo(tmpdir)
            runs_dir = Path(tmpdir) / "runs"
            tg_path = self._write_taskgraph(runs_dir, "run1", repo_path, "src")

            # Add change outside allowed scope
            (repo_path / "outside.txt").write_text("bad", encoding="utf-8")
            subprocess.run(["git", "-C", str(repo_path), "add", "outside.txt"], check=True, stdout=subprocess.PIPE, text=True)
            subprocess.run(["git", "-C", str(repo_path), "commit", "-m", "outside"], check=True, stdout=subprocess.PIPE, text=True)

            executor = TaskExecutor(runs_dir=runs_dir, codex_service=DummyCodexService())
            result = executor.execute_taskgraph(repo_path=repo_path, run_id="run1", taskgraph_path=tg_path)

            assert result["tasks"][0]["status"] == "failed"
            violation = result["tasks"][0]["artifacts"]["violation"]
            assert violation is not None


class TestMergeCoordinator:
    """Tests for merge coordinator."""

    def _init_repo(self, tmpdir: str) -> Path:
        repo_path = Path(tmpdir) / "repo"
        repo_path.mkdir()
        (repo_path / "README.md").write_text("hello", encoding="utf-8")
        subprocess.run(["git", "-C", str(repo_path), "init"], check=True, stdout=subprocess.PIPE, text=True)
        subprocess.run(["git", "-C", str(repo_path), "add", "."], check=True, stdout=subprocess.PIPE, text=True)
        subprocess.run(["git", "-C", str(repo_path), "commit", "-m", "init"], check=True, stdout=subprocess.PIPE, text=True)
        return repo_path

    def _write_taskgraph(self, runs_dir: Path, run_id: str, branch: str) -> Path:
        tg = {
            "tasks": [
                {
                    "id": "task1",
                    "title": "Test merge",
                    "rationale": "test",
                    "branch": branch,
                    "validation": ["echo ok"],
                }
            ]
        }
        tg_path = runs_dir / run_id / "taskgraph.json"
        tg_path.parent.mkdir(parents=True, exist_ok=True)
        tg_path.write_text(json.dumps(tg), encoding="utf-8")
        return tg_path

    def test_merge_and_validation(self, monkeypatch):
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_path = self._init_repo(tmpdir)
            runs_dir = Path(tmpdir) / "runs"
            # create feature branch
            subprocess.run(["git", "-C", str(repo_path), "checkout", "-b", "feature/task1"], check=True, stdout=subprocess.PIPE, text=True)
            (repo_path / "README.md").write_text("hello world", encoding="utf-8")
            subprocess.run(["git", "-C", str(repo_path), "commit", "-am", "update"], check=True, stdout=subprocess.PIPE, text=True)
            subprocess.run(["git", "-C", str(repo_path), "checkout", "master"], check=True, stdout=subprocess.PIPE, text=True)

            tg_path = self._write_taskgraph(runs_dir, "run1", "feature/task1")

            mc = MergeCoordinator(runs_dir=runs_dir, github_token="token")
            # stub PR creation to avoid network
            def fake_pr(*args, **kwargs):
                return {"pr_number": 1, "pr_url": "http://example.com/pr/1"}
            monkeypatch.setattr("github_integration.merge_coordinator.GitHubPRService.create_pr_from_branch", lambda *a, **k: fake_pr())

            result = mc.merge_taskgraph(
                repo_path=repo_path,
                run_id="run1",
                repo_owner="owner",
                repo_name="repo",
                base_branch="master",
                taskgraph_path=tg_path,
            )

            assert result["status"] == "merged"
            assert result["pr"]["pr_number"] == 1


class TestRepoIntakeService:
    """Tests for repository intake generation."""

    @patch('github_integration.repo_intake_service.GitHubCloneService')
    def test_repo_intake_generates_artifacts(self, mock_clone_service):
        """Intake should write artifacts and prune heavy dirs."""
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_dir = Path(tmpdir) / "repo"
            repo_dir.mkdir()
            (repo_dir / "README.md").write_text("# sample", encoding="utf-8")
            (repo_dir / "package.json").write_text('{"scripts": {"test": "jest"}}', encoding="utf-8")
            heavy_dir = repo_dir / "node_modules"
            heavy_dir.mkdir()

            mock_instance = Mock()
            mock_instance.clone_repository.return_value = repo_dir
            # Use real tree to ensure pruning removes heavy dirs
            mock_instance.get_file_tree.side_effect = lambda path, max_depth=5: {
                "name": "repo",
                "type": "directory",
                "children": [
                    {"name": "README.md", "type": "file"},
                    {"name": "package.json", "type": "file"},
                    {"name": "node_modules", "type": "directory", "children": []},
                ],
            }
            mock_clone_service.return_value = mock_instance

            service = RepoIntakeService(runs_dir=Path(tmpdir) / "runs")
            intake = service.run_intake("https://example.com/repo", run_id="run-1")

            assert (Path(tmpdir) / "runs" / "run-1" / "intake.json").exists()
            assert intake["file_tree"]["children"]
            assert all(child["name"] != "node_modules" for child in intake["file_tree"]["children"])
            assert any(signal["type"] == "node" for signal in intake["build_signals"])

    @patch('github_integration.repo_intake_service.GitHubCloneService')
    def test_repo_intake_handles_errors(self, mock_clone_service):
        """Errors should surface as RepoIntakeError."""
        mock_instance = Mock()
        mock_instance.clone_repository.side_effect = RepositoryCloneError("nope")
        mock_clone_service.return_value = mock_instance

        service = RepoIntakeService(runs_dir=Path(tempfile.gettempdir()) / "runs")
        with pytest.raises(RepoIntakeError):
            service.run_intake("bad/repo", run_id="run-err")


class TestSupervisorPlanner:
    """Tests for supervisor planner."""

    def test_generate_taskgraph(self):
        """Planner should write taskgraph artifacts."""
        with tempfile.TemporaryDirectory() as tmpdir:
            runs_dir = Path(tmpdir) / "runs"
            runs_dir.mkdir()
            planner = SupervisorPlanner(runs_dir=runs_dir)

            intake = {"build_signals": [{"type": "node", "commands": ["npm test"]}]}
            constraints = {"allowed_paths": ["src"], "max_parallel": 2, "risk_posture": "standard"}
            graph = planner.generate_taskgraph(
                run_id="run1",
                intake=intake,
                user_goal="Add feature X",
                constraints=constraints,
            )

            assert (runs_dir / "run1" / "taskgraph.json").exists()
            assert graph["tasks"]

    def test_generate_taskgraph_requires_inputs(self):
        planner = SupervisorPlanner(runs_dir=Path(tempfile.gettempdir()) / "runs")
        with pytest.raises(SupervisorPlannerError):
            planner.generate_taskgraph(run_id="", intake={}, user_goal="goal", constraints={})


class DummyCodexService:
    """Stub CodexSwarmService for task execution tests."""

    def __init__(self):
        self.runs = {}

    async def start_codex_run(
        self,
        repo_path: Path,
        model: str = "gpt-4",
        max_parallel: int = 3,
        run_id: str | None = None,
        goal: str | None = None,
    ) -> str:
        run_id = run_id or "run"
        self.runs[run_id] = {"repo_path": str(repo_path), "status": CodexRunStatus.PENDING}
        return run_id

    async def execute_codex_run(self, run_id: str):
        # Simulate a single progress message
        repo_path = Path(self.runs[run_id]["repo_path"])
        # Simulate a change outside allowed scope to test violations
        (repo_path / "outside.txt").write_text("change", encoding="utf-8")
        self.runs[run_id]["status"] = CodexRunStatus.COMPLETED
        yield {"run_id": run_id, "status": CodexRunStatus.COMPLETED}

    def get_run_status(self, run_id: str):
        return {"run_id": run_id, "status": self.runs.get(run_id, {}).get("status")}

    def get_findings(self, run_id: str):
        return [{"id": "1", "agent_role": "analyst", "shard": "0", "log_excerpt": "done"}]


class TestTaskExecutor:
    """Tests for task executor."""

    def _init_repo(self, tmpdir: str) -> Path:
        repo_path = Path(tmpdir) / "repo"
        repo_path.mkdir()
        (repo_path / "README.md").write_text("hello", encoding="utf-8")
        subprocess.run(["git", "-C", str(repo_path), "init"], check=True, stdout=subprocess.PIPE, text=True)
        subprocess.run(["git", "-C", str(repo_path), "add", "."], check=True, stdout=subprocess.PIPE, text=True)
        subprocess.run(["git", "-C", str(repo_path), "commit", "-m", "init"], check=True, stdout=subprocess.PIPE, text=True)
        return repo_path

    def _write_taskgraph(self, runs_dir: Path, run_id: str, repo_path: Path, allow: str) -> Path:
        tg = {
            "tasks": [
                {
                    "id": "task1",
                    "title": "Test Task",
                    "rationale": "test",
                    "file_scope": [allow],
                    "conflict_group": "g1",
                    "dependencies": [],
                    "validation": ["echo ok"],
                }
            ]
        }
        tg_path = runs_dir / run_id / "taskgraph.json"
        tg_path.parent.mkdir(parents=True, exist_ok=True)
        tg_path.write_text(json.dumps(tg), encoding="utf-8")
        return tg_path

    def test_execute_taskgraph_happy_path(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_path = self._init_repo(tmpdir)
            runs_dir = Path(tmpdir) / "runs"
            tg_path = self._write_taskgraph(runs_dir, "run1", repo_path, ".")

            executor = TaskExecutor(runs_dir=runs_dir, codex_service=DummyCodexService())
            result = executor.execute_taskgraph(repo_path=repo_path, run_id="run1", taskgraph_path=tg_path)

            assert result["tasks"][0]["status"] == "completed"
            diff_file = Path(result["tasks"][0]["artifacts"]["diff"])
            assert diff_file.exists()

    def test_execute_taskgraph_scope_violation(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_path = self._init_repo(tmpdir)
            runs_dir = Path(tmpdir) / "runs"
            tg_path = self._write_taskgraph(runs_dir, "run1", repo_path, "src")

            # Add change outside allowed scope
            (repo_path / "outside.txt").write_text("bad", encoding="utf-8")
            subprocess.run(["git", "-C", str(repo_path), "add", "outside.txt"], check=True, stdout=subprocess.PIPE, text=True)
            subprocess.run(["git", "-C", str(repo_path), "commit", "-m", "outside"], check=True, stdout=subprocess.PIPE, text=True)

            executor = TaskExecutor(runs_dir=runs_dir, codex_service=DummyCodexService())
            result = executor.execute_taskgraph(repo_path=repo_path, run_id="run1", taskgraph_path=tg_path)

            assert result["tasks"][0]["status"] == "failed"
            violation = result["tasks"][0]["artifacts"]["violation"]
            assert violation is not None


class TestRepoIntakeService:
    """Tests for repository intake generation."""

    @patch('github_integration.repo_intake_service.GitHubCloneService')
    def test_repo_intake_generates_artifacts(self, mock_clone_service):
        """Intake should write artifacts and prune heavy dirs."""
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_dir = Path(tmpdir) / "repo"
            repo_dir.mkdir()
            (repo_dir / "README.md").write_text("# sample", encoding="utf-8")
            (repo_dir / "package.json").write_text('{"scripts": {"test": "jest"}}', encoding="utf-8")
            heavy_dir = repo_dir / "node_modules"
            heavy_dir.mkdir()

            mock_instance = Mock()
            mock_instance.clone_repository.return_value = repo_dir
            # Use real tree to ensure pruning removes heavy dirs
            mock_instance.get_file_tree.side_effect = lambda path, max_depth=5: {
                "name": "repo",
                "type": "directory",
                "children": [
                    {"name": "README.md", "type": "file"},
                    {"name": "package.json", "type": "file"},
                    {"name": "node_modules", "type": "directory", "children": []},
                ],
            }
            mock_clone_service.return_value = mock_instance

            service = RepoIntakeService(runs_dir=Path(tmpdir) / "runs")
            intake = service.run_intake("https://example.com/repo", run_id="run-1")

            assert (Path(tmpdir) / "runs" / "run-1" / "intake.json").exists()
            assert intake["file_tree"]["children"]
            assert all(child["name"] != "node_modules" for child in intake["file_tree"]["children"])
            assert any(signal["type"] == "node" for signal in intake["build_signals"])

    @patch('github_integration.repo_intake_service.GitHubCloneService')
    def test_repo_intake_handles_errors(self, mock_clone_service):
        """Errors should surface as RepoIntakeError."""
        mock_instance = Mock()
        mock_instance.clone_repository.side_effect = RepositoryCloneError("nope")
        mock_clone_service.return_value = mock_instance

        service = RepoIntakeService(runs_dir=Path(tempfile.gettempdir()) / "runs")
        with pytest.raises(RepoIntakeError):
            service.run_intake("bad/repo", run_id="run-err")


class TestSupervisorPlanner:
    """Tests for supervisor planner."""

    def test_generate_taskgraph(self):
        """Planner should write taskgraph artifacts."""
        with tempfile.TemporaryDirectory() as tmpdir:
            runs_dir = Path(tmpdir) / "runs"
            runs_dir.mkdir()
            planner = SupervisorPlanner(runs_dir=runs_dir)

            intake = {"build_signals": [{"type": "node", "commands": ["npm test"]}]}
            constraints = {"allowed_paths": ["src"], "max_parallel": 2, "risk_posture": "standard"}
            graph = planner.generate_taskgraph(
                run_id="run1",
                intake=intake,
                user_goal="Add feature X",
                constraints=constraints,
            )

            assert (runs_dir / "run1" / "taskgraph.json").exists()
            assert graph["tasks"]

    def test_generate_taskgraph_requires_inputs(self):
        planner = SupervisorPlanner(runs_dir=Path(tempfile.gettempdir()) / "runs")
        with pytest.raises(SupervisorPlannerError):
            planner.generate_taskgraph(run_id="", intake={}, user_goal="goal", constraints={})


class TestRepoIntakeService:
    """Tests for repository intake generation."""

    @patch('github_integration.repo_intake_service.GitHubCloneService')
    def test_repo_intake_generates_artifacts(self, mock_clone_service):
        """Intake should write artifacts and prune heavy dirs."""
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_dir = Path(tmpdir) / "repo"
            repo_dir.mkdir()
            (repo_dir / "README.md").write_text("# sample", encoding="utf-8")
            (repo_dir / "package.json").write_text('{"scripts": {"test": "jest"}}', encoding="utf-8")
            heavy_dir = repo_dir / "node_modules"
            heavy_dir.mkdir()

            mock_instance = Mock()
            mock_instance.clone_repository.return_value = repo_dir
            # Use real tree to ensure pruning removes heavy dirs
            mock_instance.get_file_tree.side_effect = lambda path, max_depth=5: {
                "name": "repo",
                "type": "directory",
                "children": [
                    {"name": "README.md", "type": "file"},
                    {"name": "package.json", "type": "file"},
                    {"name": "node_modules", "type": "directory", "children": []},
                ],
            }
            mock_clone_service.return_value = mock_instance

            service = RepoIntakeService(runs_dir=Path(tmpdir) / "runs")
            intake = service.run_intake("https://example.com/repo", run_id="run-1")

            assert (Path(tmpdir) / "runs" / "run-1" / "intake.json").exists()
            assert intake["file_tree"]["children"]
            assert all(child["name"] != "node_modules" for child in intake["file_tree"]["children"])
            assert any(signal["type"] == "node" for signal in intake["build_signals"])

    @patch('github_integration.repo_intake_service.GitHubCloneService')
    def test_repo_intake_handles_errors(self, mock_clone_service):
        """Errors should surface as RepoIntakeError."""
        mock_instance = Mock()
        mock_instance.clone_repository.side_effect = RepositoryCloneError("nope")
        mock_clone_service.return_value = mock_instance

        service = RepoIntakeService(runs_dir=Path(tempfile.gettempdir()) / "runs")
        with pytest.raises(RepoIntakeError):
            service.run_intake("bad/repo", run_id="run-err")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
