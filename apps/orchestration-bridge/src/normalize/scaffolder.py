"""
Scaffolder for ensuring minimal frontend/backend project structure.

Creates missing scaffolding files required for basic build/run.
"""

import json
from pathlib import Path
from typing import List, Tuple, Set


def detect_imports_in_python_files(backend_dir: Path) -> Set[str]:
    """
    Detect imports in Python files to infer dependencies.
    
    Args:
        backend_dir: Path to backend directory
        
    Returns:
        Set of imported package names
    """
    imports = set()
    
    for py_file in backend_dir.rglob("*.py"):
        try:
            content = py_file.read_text(encoding="utf-8", errors="replace")
            lines = content.splitlines()
            
            for line in lines:
                line = line.strip()
                # Match "import package" or "from package import ..."
                if line.startswith("import "):
                    parts = line.split()
                    if len(parts) >= 2:
                        pkg = parts[1].split(".")[0]
                        imports.add(pkg)
                elif line.startswith("from "):
                    parts = line.split()
                    if len(parts) >= 2:
                        pkg = parts[1].split(".")[0]
                        imports.add(pkg)
        except Exception:
            continue
    
    return imports


def create_backend_requirements(backend_dir: Path, imports: Set[str]) -> str:
    """
    Create requirements.txt content based on detected imports.
    
    Args:
        backend_dir: Path to backend directory
        imports: Set of imported package names
        
    Returns:
        Content for requirements.txt
    """
    # Map common imports to package names
    package_map = {
        "fastapi": "fastapi>=0.115.0",
        "uvicorn": "uvicorn>=0.30.0",
        "pydantic": "pydantic>=2.0.0",
        "requests": "requests>=2.32.0",
        "httpx": "httpx>=0.27.0",
        "pytest": "pytest>=8.0.0",
        "sqlalchemy": "sqlalchemy>=2.0.0",
        "psycopg2": "psycopg2-binary>=2.9.0",
        "pymongo": "pymongo>=4.0.0",
        "redis": "redis>=5.0.0",
        "celery": "celery>=5.4.0",
        "pandas": "pandas>=2.0.0",
        "numpy": "numpy>=1.26.0",
        "flask": "flask>=3.0.0",
        "django": "django>=5.0.0",
    }
    
    packages = []
    for imp in sorted(imports):
        if imp in package_map:
            packages.append(package_map[imp])
    
    # Add common defaults if FastAPI detected
    if "fastapi" in imports:
        defaults = [
            "fastapi>=0.115.0",
            "uvicorn>=0.30.0",
            "pydantic>=2.0.0",
            "pytest>=8.0.0",
        ]
        for pkg in defaults:
            if pkg not in packages:
                packages.append(pkg)
    
    if not packages:
        # Minimal default
        packages = ["pytest>=8.0.0"]
    
    return "\n".join(packages) + "\n"


def ensure_backend_scaffolding(base_dir: Path) -> List[Tuple[str, str]]:
    """
    Ensure backend has minimal scaffolding.
    
    Args:
        base_dir: Base directory of repository
        
    Returns:
        List of tuples (created_path, reason)
    """
    created = []
    backend_dir = base_dir / "backend"
    
    if not backend_dir.exists():
        return created
    
    # Check if there are Python files
    py_files = list(backend_dir.rglob("*.py"))
    if not py_files:
        return created
    
    # Create requirements.txt if missing
    requirements_file = backend_dir / "requirements.txt"
    if not requirements_file.exists():
        imports = detect_imports_in_python_files(backend_dir)
        content = create_backend_requirements(backend_dir, imports)
        requirements_file.write_text(content, encoding="utf-8")
        created.append(("backend/requirements.txt", "inferred from imports"))
    
    # Ensure package folders have __init__.py
    for py_file in py_files:
        # Check parent directories up to backend_dir
        current = py_file.parent
        while current != backend_dir and current.is_relative_to(backend_dir):
            init_file = current / "__init__.py"
            if not init_file.exists():
                # Create empty __init__.py
                init_file.touch()
                rel_path = init_file.relative_to(base_dir)
                created.append((str(rel_path), "package marker"))
            current = current.parent
    
    return created


def create_package_json(frontend_dir: Path, has_tests: bool = False) -> str:
    """
    Create minimal package.json content.
    
    Args:
        frontend_dir: Path to frontend directory
        has_tests: Whether test files exist
        
    Returns:
        JSON content for package.json
    """
    pkg = {
        "name": "frontend",
        "version": "0.1.0",
        "type": "module",
        "scripts": {
            "dev": "vite",
            "build": "vite build",
            "preview": "vite preview",
        },
        "dependencies": {
            "react": "^18.3.0",
            "react-dom": "^18.3.0",
        },
        "devDependencies": {
            "@vitejs/plugin-react": "^4.3.0",
            "vite": "^5.4.0",
            "typescript": "^5.5.0",
            "@types/react": "^18.3.0",
            "@types/react-dom": "^18.3.0",
        }
    }
    
    if has_tests:
        pkg["scripts"]["test"] = "playwright test"
        pkg["scripts"]["test:e2e"] = "playwright test"
        pkg["devDependencies"]["@playwright/test"] = "^1.47.0"
    
    return json.dumps(pkg, indent=2) + "\n"


def create_vite_config() -> str:
    """Create minimal vite.config.ts content."""
    return """import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
"""


def create_tsconfig() -> str:
    """Create minimal tsconfig.json content."""
    config = {
        "compilerOptions": {
            "target": "ES2020",
            "useDefineForClassFields": True,
            "lib": ["ES2020", "DOM", "DOM.Iterable"],
            "module": "ESNext",
            "skipLibCheck": True,
            "moduleResolution": "bundler",
            "allowImportingTsExtensions": True,
            "resolveJsonModule": True,
            "isolatedModules": True,
            "noEmit": True,
            "jsx": "react-jsx",
            "strict": True,
            "noUnusedLocals": True,
            "noUnusedParameters": True,
            "noFallthroughCasesInSwitch": True
        },
        "include": ["src"],
        "references": [{"path": "./tsconfig.node.json"}]
    }
    return json.dumps(config, indent=2) + "\n"


def create_index_html() -> str:
    """Create minimal index.html content."""
    return """<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite + React + TS</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
"""


def ensure_frontend_scaffolding(base_dir: Path) -> List[Tuple[str, str]]:
    """
    Ensure frontend has minimal scaffolding.
    
    Args:
        base_dir: Base directory of repository
        
    Returns:
        List of tuples (created_path, reason)
    """
    created = []
    frontend_dir = base_dir / "frontend"
    
    if not frontend_dir.exists():
        return created
    
    # Check if there's a src directory with React/TS files
    src_dir = frontend_dir / "src"
    if not src_dir.exists():
        return created
    
    ts_files = list(src_dir.rglob("*.ts")) + list(src_dir.rglob("*.tsx"))
    if not ts_files:
        return created
    
    # Check for test files
    has_tests = any(
        "test" in str(f).lower() or "spec" in str(f).lower()
        for f in frontend_dir.rglob("*.ts")
    )
    
    # Create package.json if missing
    package_json = frontend_dir / "package.json"
    if not package_json.exists():
        content = create_package_json(frontend_dir, has_tests)
        package_json.write_text(content, encoding="utf-8")
        created.append(("frontend/package.json", "Vite + React + TS setup"))
    
    # Create vite.config.ts if missing
    vite_config = frontend_dir / "vite.config.ts"
    if not vite_config.exists() and not (frontend_dir / "vite.config.js").exists():
        vite_config.write_text(create_vite_config(), encoding="utf-8")
        created.append(("frontend/vite.config.ts", "Vite configuration"))
    
    # Create tsconfig.json if missing
    tsconfig = frontend_dir / "tsconfig.json"
    if not tsconfig.exists():
        tsconfig.write_text(create_tsconfig(), encoding="utf-8")
        created.append(("frontend/tsconfig.json", "TypeScript configuration"))
    
    # Create index.html if missing
    index_html = frontend_dir / "index.html"
    if not index_html.exists():
        index_html.write_text(create_index_html(), encoding="utf-8")
        created.append(("frontend/index.html", "HTML entry point"))
    
    return created
