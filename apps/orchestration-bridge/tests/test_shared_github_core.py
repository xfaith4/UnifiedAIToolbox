"""
Unit tests for shared GitHub utilities.
"""

import pytest
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch

from shared.github_core import (
    build_file_tree,
    list_repo_branches,
    switch_repo_branch,
    cleanup_repository,
    get_authenticated_clone_url,
    parse_repo_url,
    GitHubClientMixin,
    FileTreeMixin,
    CloneUrlMixin,
)


class TestBuildFileTree:
    """Tests for build_file_tree function."""
    
    def test_basic_file_tree(self):
        """Test basic file tree generation."""
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_dir = Path(tmpdir) / "test_repo"
            repo_dir.mkdir()
            
            # Create test structure
            (repo_dir / "file1.txt").write_text("test content")
            (repo_dir / "dir1").mkdir()
            (repo_dir / "dir1" / "file2.txt").write_text("nested content")
            
            tree = build_file_tree(repo_dir, max_depth=3)
            
            assert tree['name'] == "test_repo"
            assert tree['type'] == "directory"
            assert len(tree['children']) >= 2
    
    def test_file_tree_respects_max_depth(self):
        """Test that max_depth is respected."""
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_dir = Path(tmpdir) / "deep_repo"
            repo_dir.mkdir()
            
            # Create deep structure
            deep_path = repo_dir / "level1" / "level2" / "level3" / "level4"
            deep_path.mkdir(parents=True)
            (deep_path / "deep_file.txt").write_text("deep content")
            
            tree = build_file_tree(repo_dir, max_depth=2)
            
            # level3 should be truncated
            level1 = next(c for c in tree['children'] if c['name'] == 'level1')
            level2 = next(c for c in level1['children'] if c['name'] == 'level2')
            assert level2.get('truncated') == True
    
    def test_file_tree_skips_hidden(self):
        """Test that hidden files are skipped."""
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_dir = Path(tmpdir) / "repo_with_hidden"
            repo_dir.mkdir()
            
            (repo_dir / "visible.txt").write_text("visible")
            (repo_dir / ".hidden").write_text("hidden")
            (repo_dir / ".git").mkdir()
            
            tree = build_file_tree(repo_dir, skip_hidden=True)
            
            names = [c['name'] for c in tree['children']]
            assert "visible.txt" in names
            assert ".hidden" not in names
            assert ".git" not in names
    
    def test_file_tree_allows_github_dir(self):
        """Test that .github directory is allowed when specified."""
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_dir = Path(tmpdir) / "repo_with_github"
            repo_dir.mkdir()
            
            (repo_dir / ".github").mkdir()
            (repo_dir / ".github" / "workflows").mkdir()
            
            tree = build_file_tree(repo_dir, skip_hidden=True, allow_github_dir=True)
            
            names = [c['name'] for c in tree['children']]
            assert ".github" in names


class TestAuthenticatedCloneUrl:
    """Tests for get_authenticated_clone_url function."""
    
    def test_github_url_with_token(self):
        """Test GitHub URL authentication."""
        url = "https://github.com/owner/repo.git"
        token = "test_token"
        
        result = get_authenticated_clone_url(url, token)
        
        assert result == "https://test_token@github.com/owner/repo.git"
    
    def test_other_https_url_with_token(self):
        """Test non-GitHub HTTPS URL authentication."""
        url = "https://gitlab.com/owner/repo.git"
        token = "test_token"
        
        result = get_authenticated_clone_url(url, token)
        
        assert result == "https://test_token@gitlab.com/owner/repo.git"
    
    def test_url_without_token(self):
        """Test URL is unchanged without token."""
        url = "https://github.com/owner/repo.git"
        
        result = get_authenticated_clone_url(url, None)
        
        assert result == url


class TestParseRepoUrl:
    """Tests for parse_repo_url function."""
    
    def test_parse_https_url(self):
        """Test parsing HTTPS URL."""
        url = "https://github.com/owner/repo.git"
        
        owner, repo = parse_repo_url(url)
        
        assert owner == "owner"
        assert repo == "repo"
    
    def test_parse_short_format(self):
        """Test parsing owner/repo format."""
        url = "owner/repo"
        
        owner, repo = parse_repo_url(url)
        
        assert owner == "owner"
        assert repo == "repo"
    
    def test_parse_url_without_git_extension(self):
        """Test parsing URL without .git extension."""
        url = "https://github.com/owner/repo"
        
        owner, repo = parse_repo_url(url)
        
        assert owner == "owner"
        assert repo == "repo"


class TestMixins:
    """Tests for mixin classes."""
    
    def test_clone_url_mixin(self):
        """Test CloneUrlMixin functionality."""
        class TestClass(CloneUrlMixin):
            pass
        
        obj = TestClass()
        
        auth_url = obj._get_auth_url("https://github.com/owner/repo", "token")
        assert "token@" in auth_url
        
        owner, repo = obj._parse_repo_url("owner/repo")
        assert owner == "owner"
        assert repo == "repo"
    
    def test_file_tree_mixin(self):
        """Test FileTreeMixin functionality."""
        class TestClass(FileTreeMixin):
            pass
        
        obj = TestClass()
        
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_dir = Path(tmpdir) / "test"
            repo_dir.mkdir()
            (repo_dir / "file.txt").write_text("test")
            
            tree = obj._build_file_tree(repo_dir)
            assert tree['name'] == "test"


class TestCleanupRepository:
    """Tests for cleanup_repository function."""
    
    def test_cleanup_existing_directory(self):
        """Test cleanup of existing directory."""
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_dir = Path(tmpdir) / "repo_to_delete"
            repo_dir.mkdir()
            (repo_dir / "file.txt").write_text("content")
            
            result = cleanup_repository(repo_dir)
            
            assert result == True
            assert not repo_dir.exists()
    
    def test_cleanup_nonexistent_directory(self):
        """Test cleanup of non-existent directory."""
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_dir = Path(tmpdir) / "does_not_exist"
            
            result = cleanup_repository(repo_dir)
            
            assert result == False


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
