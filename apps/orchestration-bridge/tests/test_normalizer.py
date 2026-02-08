"""
Tests for artifact normalization modules.
"""

import pytest
import tempfile
import shutil
from pathlib import Path

# Add src to path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from normalize import code_fence_stripper, blob_splitter, orphan_handler, scaffolder, compose_fixer


class TestCodeFenceStripper:
    """Tests for code_fence_stripper module."""
    
    def test_detect_fence_wrapped(self):
        """Test detection of fence-wrapped code."""
        text = """```python
def hello():
    print("Hello")
```"""
        assert code_fence_stripper.is_probably_code_fence_wrapped(text)
    
    def test_detect_not_fence_wrapped(self):
        """Test detection of non-fence-wrapped code."""
        text = """def hello():
    print("Hello")"""
        assert not code_fence_stripper.is_probably_code_fence_wrapped(text)
    
    def test_strip_fences(self):
        """Test stripping of code fences."""
        text = """```python
def hello():
    print("Hello")
```"""
        stripped, was_modified = code_fence_stripper.strip_code_fences(text)
        assert was_modified
        assert "```" not in stripped
        assert "def hello():" in stripped
    
    def test_strip_fences_with_language(self):
        """Test stripping fences with language identifier."""
        text = """```typescript
export function hello() {
    console.log("Hello");
}
```"""
        stripped, was_modified = code_fence_stripper.strip_code_fences(text)
        assert was_modified
        assert "```" not in stripped
        assert "export function hello()" in stripped
    
    def test_process_file(self, tmp_path):
        """Test processing a fenced Python file."""
        test_file = tmp_path / "test.py"
        test_file.write_text("""```python
def test():
    return True
```""")
        
        was_modified, error = code_fence_stripper.process_file(test_file)
        assert was_modified
        assert error is None
        
        content = test_file.read_text()
        assert "```" not in content
        assert "def test():" in content
    
    def test_process_html_file(self, tmp_path):
        """Test processing a fenced HTML file."""
        test_file = tmp_path / "index.html"
        test_file.write_text("""```html
<!DOCTYPE html>
<html>
<head>
    <title>Test</title>
</head>
<body>
    <h1>Hello World</h1>
</body>
</html>
```""")
        
        was_modified, error = code_fence_stripper.process_file(test_file)
        assert was_modified
        assert error is None
        
        content = test_file.read_text()
        assert "```" not in content
        assert "<!DOCTYPE html>" in content
        assert "<h1>Hello World</h1>" in content
    
    def test_process_css_file(self, tmp_path):
        """Test processing a fenced CSS file."""
        test_file = tmp_path / "styles.css"
        test_file.write_text("""```css
body {
    margin: 0;
    padding: 0;
}

h1 {
    color: blue;
}
```""")
        
        was_modified, error = code_fence_stripper.process_file(test_file)
        assert was_modified
        assert error is None
        
        content = test_file.read_text()
        assert "```" not in content
        assert "body {" in content
        assert "color: blue;" in content


class TestBlobSplitter:
    """Tests for blob_splitter module."""
    
    def test_detect_bundled_blob(self):
        """Test detection of bundled blob."""
        text = """File: backend/app.py
print("Backend")

File: frontend/index.ts
console.log("Frontend");"""
        assert blob_splitter.detect_bundled_blob(text)
    
    def test_detect_not_bundled_blob(self):
        """Test detection of non-bundled content."""
        text = """print("This is just normal code")"""
        assert not blob_splitter.detect_bundled_blob(text)
    
    def test_split_bundled_blob(self):
        """Test splitting of bundled blob."""
        text = """File: backend/app.py
print("Backend")

File: frontend/index.ts
console.log("Frontend");"""
        
        files = blob_splitter.split_bundled_blob(text)
        assert len(files) == 2
        
        paths = [path for path, _ in files]
        assert "backend/app.py" in paths
        assert "frontend/index.ts" in paths
        
        # Check content
        backend_content = next(content for path, content in files if "backend" in path)
        assert "Backend" in backend_content
    
    def test_process_blob_file(self, tmp_path):
        """Test processing a blob file."""
        blob_file = tmp_path / "blob.txt"
        blob_file.write_text("""File: test1.py
print("Test 1")

File: test2.py
print("Test 2")""")
        
        was_split, extracted, error = blob_splitter.process_blob_file(blob_file, tmp_path)
        assert was_split
        assert len(extracted) == 2
        assert error is None
        
        # Check that files were created
        assert (tmp_path / "test1.py").exists()
        assert (tmp_path / "test2.py").exists()


class TestOrphanHandler:
    """Tests for orphan_handler module."""
    
    def test_is_suspicious_short_name(self):
        """Test detection of suspicious short filename."""
        path = Path("s")
        assert orphan_handler.is_suspicious_filename(path)
    
    def test_is_suspicious_comma_name(self):
        """Test detection of filename with comma."""
        path = Path("watchlists, timeframes")
        assert orphan_handler.is_suspicious_filename(path)
    
    def test_is_not_suspicious_valid_name(self):
        """Test that valid filenames are not flagged."""
        path = Path("Dockerfile")
        assert not orphan_handler.is_suspicious_filename(path)
        
        path = Path("README.md")
        assert not orphan_handler.is_suspicious_filename(path)
    
    def test_infer_python_type(self):
        """Test inferring Python file type."""
        content = """import os
def main():
    pass"""
        ext = orphan_handler.infer_file_type(content)
        assert ext == ".py"
    
    def test_infer_typescript_type(self):
        """Test inferring TypeScript file type."""
        content = """export const myVar: string = "test";"""
        ext = orphan_handler.infer_file_type(content)
        assert ext in [".ts", ".tsx"]
    
    def test_sanitize_filename(self):
        """Test filename sanitization."""
        name = "test, file: name"
        sanitized = orphan_handler.sanitize_filename(name)
        assert "," not in sanitized
        assert ":" not in sanitized
        assert " " not in sanitized
    
    def test_classify_orphan_markdown(self, tmp_path):
        """Test classifying markdown orphan."""
        orphan_file = tmp_path / "notes"
        orphan_file.write_text("# Test Document\n\nThis is a markdown file.")
        
        suggested, reason = orphan_handler.classify_orphan(orphan_file)
        assert "docs" in suggested or "notes" in suggested
        assert "markdown" in reason.lower() or "documentation" in reason.lower()


class TestScaffolder:
    """Tests for scaffolder module."""
    
    def test_detect_imports(self, tmp_path):
        """Test detecting imports in Python files."""
        backend_dir = tmp_path / "backend"
        backend_dir.mkdir()
        
        (backend_dir / "app.py").write_text("""import fastapi
from pydantic import BaseModel""")
        
        imports = scaffolder.detect_imports_in_python_files(backend_dir)
        assert "fastapi" in imports
        assert "pydantic" in imports
    
    def test_create_backend_requirements(self, tmp_path):
        """Test creating requirements.txt."""
        backend_dir = tmp_path / "backend"
        imports = {"fastapi", "pydantic", "pytest"}
        
        content = scaffolder.create_backend_requirements(backend_dir, imports)
        assert "fastapi" in content
        assert "pydantic" in content
        assert "pytest" in content
    
    def test_ensure_backend_scaffolding(self, tmp_path):
        """Test ensuring backend scaffolding."""
        backend_dir = tmp_path / "backend"
        backend_dir.mkdir()
        
        # Create a Python file
        (backend_dir / "app.py").write_text("import fastapi")
        
        created = scaffolder.ensure_backend_scaffolding(tmp_path)
        
        # Should have created requirements.txt
        assert (backend_dir / "requirements.txt").exists()
        assert any("requirements.txt" in path for path, _ in created)
    
    def test_create_package_json(self, tmp_path):
        """Test creating package.json."""
        frontend_dir = tmp_path / "frontend"
        frontend_dir.mkdir()
        
        content = scaffolder.create_package_json(frontend_dir, has_tests=False)
        assert "vite" in content
        assert "react" in content
        assert '"dev"' in content
        assert '"build"' in content
    
    def test_ensure_frontend_scaffolding(self, tmp_path):
        """Test ensuring frontend scaffolding."""
        frontend_dir = tmp_path / "frontend"
        frontend_dir.mkdir()
        src_dir = frontend_dir / "src"
        src_dir.mkdir()
        
        # Create a TypeScript file
        (src_dir / "App.tsx").write_text("export function App() {}")
        
        created = scaffolder.ensure_frontend_scaffolding(tmp_path)
        
        # Should have created package.json, vite.config.ts, etc.
        assert (frontend_dir / "package.json").exists()
        assert any("package.json" in path for path, _ in created)


class TestComposeFixer:
    """Tests for compose_fixer module."""
    
    def test_is_valid_compose(self, tmp_path):
        """Test validation of valid compose file."""
        compose_file = tmp_path / "docker-compose.yml"
        compose_file.write_text("""services:
  web:
    image: nginx""")
        
        is_valid, error = compose_fixer.is_valid_compose_yaml(compose_file)
        assert is_valid
        assert error is None
    
    def test_is_invalid_compose_no_services(self, tmp_path):
        """Test validation of invalid compose file."""
        compose_file = tmp_path / "docker-compose.yml"
        compose_file.write_text("""version: '3'""")
        
        is_valid, error = compose_fixer.is_valid_compose_yaml(compose_file)
        assert not is_valid
        assert "services" in error.lower()
    
    def test_create_minimal_compose(self):
        """Test creating minimal compose file."""
        content = compose_fixer.create_minimal_compose(
            backend_exists=True,
            frontend_exists=True
        )
        assert "services:" in content
        assert "backend:" in content
        assert "frontend:" in content


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
