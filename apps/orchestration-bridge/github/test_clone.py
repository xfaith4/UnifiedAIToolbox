"""Tests for GitHub cloning service."""

import unittest
from unittest.mock import Mock, patch, MagicMock
from pathlib import Path
import tempfile
import shutil
from clone import GitHubCloner, CloneStatus, CloneProgress


class TestGitHubCloner(unittest.TestCase):
    """Test cases for GitHubCloner."""

    def setUp(self):
        """Set up test fixtures."""
        self.temp_dir = tempfile.mkdtemp()
        self.cloner = GitHubCloner(token=None, base_clone_dir=self.temp_dir)

    def tearDown(self):
        """Clean up test fixtures."""
        if Path(self.temp_dir).exists():
            shutil.rmtree(self.temp_dir)

    @patch('clone.Github')
    def test_search_repositories(self, mock_github):
        """Test repository search."""
        # Mock repository object
        mock_repo = Mock()
        mock_repo.full_name = "test/repo"
        mock_repo.name = "repo"
        mock_repo.owner.login = "test"
        mock_repo.description = "Test repository"
        mock_repo.html_url = "https://github.com/test/repo"
        mock_repo.clone_url = "https://github.com/test/repo.git"
        mock_repo.stargazers_count = 100
        mock_repo.forks_count = 10
        mock_repo.language = "Python"
        mock_repo.size = 1024
        mock_repo.updated_at = None
        mock_repo.default_branch = "main"

        # Mock search results
        mock_github_instance = Mock()
        mock_github_instance.search_repositories.return_value = [mock_repo]
        mock_github.return_value = mock_github_instance

        # Create new cloner with mock
        cloner = GitHubCloner(token=None, base_clone_dir=self.temp_dir)
        cloner.github = mock_github_instance

        # Test search
        results = cloner.search_repositories("test", max_results=1)

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['full_name'], "test/repo")
        self.assertEqual(results[0]['name'], "repo")
        self.assertEqual(results[0]['stars'], 100)

    @patch('clone.Github')
    def test_get_repository_info(self, mock_github):
        """Test getting repository info."""
        # Mock repository
        mock_repo = Mock()
        mock_repo.full_name = "test/repo"
        mock_repo.name = "repo"
        mock_repo.owner.login = "test"
        mock_repo.description = "Test repo"
        mock_repo.html_url = "https://github.com/test/repo"
        mock_repo.clone_url = "https://github.com/test/repo.git"
        mock_repo.stargazers_count = 50
        mock_repo.forks_count = 5
        mock_repo.language = "JavaScript"
        mock_repo.size = 2048
        mock_repo.updated_at = None
        mock_repo.default_branch = "main"
        mock_repo.get_topics.return_value = ["test", "example"]
        mock_repo.license = None

        # Mock branches
        mock_branch = Mock()
        mock_branch.name = "main"
        mock_repo.get_branches.return_value = [mock_branch]

        # Mock GitHub instance
        mock_github_instance = Mock()
        mock_github_instance.get_repo.return_value = mock_repo
        mock_github.return_value = mock_github_instance

        cloner = GitHubCloner(token=None, base_clone_dir=self.temp_dir)
        cloner.github = mock_github_instance

        # Test get info
        info = cloner.get_repository_info("test", "repo")

        self.assertEqual(info['full_name'], "test/repo")
        self.assertEqual(info['branches'], ["main"])
        self.assertEqual(info['topics'], ["test", "example"])

    def test_clone_repository_creates_progress(self):
        """Test that clone_repository creates a progress entry."""
        # This test just verifies the progress tracking is set up
        with patch('clone.threading.Thread'):
            clone_id = self.cloner.clone_repository("https://github.com/test/repo")

            self.assertIsNotNone(clone_id)
            progress = self.cloner.get_progress(clone_id)
            self.assertIsNotNone(progress)
            self.assertEqual(progress.repo_url, "https://github.com/test/repo")
            self.assertEqual(progress.status, CloneStatus.PENDING)

    def test_list_clones(self):
        """Test listing all clones."""
        # Create some mock progress entries
        with patch('clone.threading.Thread'):
            clone_id1 = self.cloner.clone_repository("https://github.com/test/repo1")
            clone_id2 = self.cloner.clone_repository("https://github.com/test/repo2")

            clones = self.cloner.list_clones()

            self.assertEqual(len(clones), 2)
            repo_urls = [c.repo_url for c in clones]
            self.assertIn("https://github.com/test/repo1", repo_urls)
            self.assertIn("https://github.com/test/repo2", repo_urls)

    def test_cleanup_clone(self):
        """Test cleanup of a clone."""
        # Create a mock clone directory
        mock_clone_path = Path(self.temp_dir) / "test_repo"
        mock_clone_path.mkdir()

        # Create a mock progress entry
        progress = CloneProgress(
            repo_url="https://github.com/test/repo",
            status=CloneStatus.COMPLETED,
            clone_path=str(mock_clone_path)
        )
        clone_id = "test_clone_id"
        self.cloner._clones[clone_id] = progress

        # Test cleanup
        success = self.cloner.cleanup_clone(clone_id)

        self.assertTrue(success)
        self.assertFalse(mock_clone_path.exists())
        self.assertIsNone(self.cloner.get_progress(clone_id))

    def test_cleanup_all(self):
        """Test cleanup of all clones."""
        # Create multiple mock clone directories
        mock_clone_path1 = Path(self.temp_dir) / "test_repo1"
        mock_clone_path2 = Path(self.temp_dir) / "test_repo2"
        mock_clone_path1.mkdir()
        mock_clone_path2.mkdir()

        # Create mock progress entries
        self.cloner._clones["clone1"] = CloneProgress(
            repo_url="https://github.com/test/repo1",
            status=CloneStatus.COMPLETED,
            clone_path=str(mock_clone_path1)
        )
        self.cloner._clones["clone2"] = CloneProgress(
            repo_url="https://github.com/test/repo2",
            status=CloneStatus.COMPLETED,
            clone_path=str(mock_clone_path2)
        )

        # Test cleanup all
        count = self.cloner.cleanup_all()

        self.assertEqual(count, 2)
        self.assertEqual(len(self.cloner.list_clones()), 0)

    def test_get_file_tree_not_found(self):
        """Test getting file tree for non-existent clone."""
        tree = self.cloner.get_file_tree("nonexistent_id")
        self.assertIsNone(tree)

    @patch('clone.git.Repo')
    def test_get_branches(self, mock_repo_class):
        """Test getting branches from a cloned repo."""
        # Create mock clone path
        mock_clone_path = Path(self.temp_dir) / "test_repo"
        mock_clone_path.mkdir()

        # Create mock progress
        progress = CloneProgress(
            repo_url="https://github.com/test/repo",
            status=CloneStatus.COMPLETED,
            clone_path=str(mock_clone_path),
            branches=["main", "develop"]
        )
        clone_id = "test_clone_id"
        self.cloner._clones[clone_id] = progress

        # Mock git.Repo
        mock_ref1 = Mock()
        mock_ref1.name = "origin/main"
        mock_ref2 = Mock()
        mock_ref2.name = "origin/develop"

        mock_repo = Mock()
        mock_repo.remote.return_value.refs = [mock_ref1, mock_ref2]
        mock_repo_class.return_value = mock_repo

        # Test get branches
        branches = self.cloner.get_branches(clone_id)

        self.assertIn("main", branches)
        self.assertIn("develop", branches)


if __name__ == '__main__':
    unittest.main()
