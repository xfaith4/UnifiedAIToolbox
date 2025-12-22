"""Repository intake workflow for orchestration bridge.

Generates deterministic intake artifacts (JSON + Markdown) for a given
repository by cloning it into an isolated workspace, summarizing the file
tree, and detecting build/run/test entry points.
"""

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from github import GithubException

from github_integration.clone_service import GitHubCloneService, RepositoryCloneError


class RepoIntakeError(Exception):
    """Raised when intake generation fails."""


@dataclass
class IntakeArtifacts:
    """Paths to generated intake artifacts."""

    json_path: Path
    markdown_path: Path
    clone_path: Path


class RepoIntakeService:
    """Service for producing repository intake reports."""

    HEAVY_DIRS = {
        "node_modules",
        "dist",
        "build",
        "venv",
        ".venv",
        "bin",
        "obj",
        "__pycache__",
    }

    def __init__(
        self,
        github_token: Optional[str] = None,
        runs_dir: Optional[Path] = None,
    ):
        """
        Initialize the intake service.

        Args:
            github_token: GitHub PAT for authenticated clone access.
            runs_dir: Base directory for intake artifacts (defaults to bridge runs dir).
        """
        base_dir = runs_dir or Path(__file__).parent.parent / "runs"
        self.runs_dir = Path(base_dir)
        self.runs_dir.mkdir(parents=True, exist_ok=True)
        self.github_token = github_token

    def run_intake(
        self,
        repo_url: str,
        run_id: str,
        branch: Optional[str] = None,
        clone_path: Optional[Path] = None,
    ) -> Dict[str, Any]:
        """
        Execute the intake workflow and return the structured report.

        Args:
            repo_url: Repository URL or owner/repo slug.
            run_id: Workspace/run identifier for artifact storage.
            branch: Optional branch to checkout.
            clone_path: Optional pre-cloned repository path to reuse.

        Returns:
            Intake report data.

        Raises:
            RepoIntakeError: On clone or processing failures.
        """
        run_dir = self.runs_dir / run_id
        run_dir.mkdir(parents=True, exist_ok=True)

        try:
            clone_service = GitHubCloneService(
                github_token=self.github_token,
                clone_base_dir=run_dir,
            )

            if clone_path is None:
                clone_path = clone_service.clone_repository(
                    repo_url=repo_url,
                    branch=branch,
                    clone_id=run_id,
                )

            raw_tree = clone_service.get_file_tree(clone_path, max_depth=5)
            file_tree = self._prune_heavy_dirs(raw_tree)
            build_signals = self._detect_build_signals(clone_path)

            intake = {
                "run_id": run_id,
                "repo_url": repo_url,
                "branch": branch,
                "clone_path": str(clone_path),
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "file_tree": file_tree,
                "build_signals": build_signals,
            }

            artifacts = self._write_artifacts(run_dir, intake)
            intake["artifacts"] = {
                "intake_json": str(artifacts.json_path),
                "intake_markdown": str(artifacts.markdown_path),
            }

            return intake
        except (GithubException, RepositoryCloneError) as exc:
            raise RepoIntakeError(str(exc)) from exc
        except Exception as exc:
            raise RepoIntakeError(f"Failed to generate intake: {exc}") from exc

    def _write_artifacts(self, run_dir: Path, intake: Dict[str, Any]) -> IntakeArtifacts:
        json_path = run_dir / "intake.json"
        md_path = run_dir / "intake.md"

        json_path.write_text(json.dumps(intake, indent=2), encoding="utf-8")
        md_path.write_text(self._render_markdown(intake), encoding="utf-8")

        return IntakeArtifacts(
            json_path=json_path,
            markdown_path=md_path,
            clone_path=Path(intake["clone_path"]),
        )

    def _render_markdown(self, intake: Dict[str, Any]) -> str:
        lines = [
            f"# Intake Report for {intake.get('repo_url')}",
            "",
            f"- Run ID: `{intake.get('run_id')}`",
            f"- Branch: `{intake.get('branch') or 'default'}`",
            f"- Generated At: {intake.get('generated_at')}",
            "",
            "## Build / Run / Test Signals",
        ]

        signals = intake.get("build_signals") or []
        if signals:
            for signal in signals:
                commands = signal.get("commands") or []
                lines.append(f"- **{signal.get('type')}** ({signal.get('path')})")
                if commands:
                    for cmd in commands:
                        lines.append(f"  - `{cmd}`")
                elif signal.get("details"):
                    lines.append(f"  - {signal['details']}")
        else:
            lines.append("- None detected")

        lines.append("")
        lines.append("## File Tree (truncated)")
        lines.append("```json")
        lines.append(json.dumps(intake.get("file_tree"), indent=2))
        lines.append("```")

        return "\n".join(lines)

    def _prune_heavy_dirs(self, tree: Dict[str, Any]) -> Dict[str, Any]:
        """Remove heavy directories from a file tree dictionary."""
        if tree.get("type") != "directory":
            return tree

        children = tree.get("children", [])
        pruned_children: List[Dict[str, Any]] = []
        for child in children:
            name = child.get("name")
            if name in self.HEAVY_DIRS:
                continue
            pruned_children.append(self._prune_heavy_dirs(child))

        tree = dict(tree)
        tree["children"] = pruned_children
        return tree

    def _detect_build_signals(self, repo_path: Path) -> List[Dict[str, Any]]:
        """Detect build/run/test entry points."""
        signals: List[Dict[str, Any]] = []

        # README
        for readme_name in ("README.md", "README"):
            readme_path = repo_path / readme_name
            if readme_path.exists():
                signals.append(
                    {
                        "type": "readme",
                        "path": str(readme_path.relative_to(repo_path)),
                        "details": "Review README for setup and run instructions.",
                    }
                )
                break

        # Node
        pkg = repo_path / "package.json"
        if pkg.exists():
            commands = ["npm install"]
            try:
                pkg_data = json.loads(pkg.read_text(encoding="utf-8"))
                scripts = pkg_data.get("scripts") or {}
                for key in ("build", "test", "start", "dev"):
                    if key in scripts:
                        commands.append(f"npm run {key}")
            except Exception:
                commands.append("npm test (if defined)")

            signals.append(
                {
                    "type": "node",
                    "path": str(pkg.relative_to(repo_path)),
                    "commands": commands,
                }
            )

        # Python
        req = repo_path / "requirements.txt"
        pyproject = repo_path / "pyproject.toml"
        if req.exists():
            signals.append(
                {
                    "type": "python",
                    "path": str(req.relative_to(repo_path)),
                    "commands": ["python -m venv .venv && source .venv/bin/activate", "pip install -r requirements.txt"],
                }
            )
        if pyproject.exists():
            signals.append(
                {
                    "type": "python",
                    "path": str(pyproject.relative_to(repo_path)),
                    "commands": ["python -m venv .venv && source .venv/bin/activate", "pip install ."],
                }
            )

        # Makefile
        makefile = repo_path / "Makefile"
        if makefile.exists():
            signals.append(
                {
                    "type": "make",
                    "path": str(makefile.relative_to(repo_path)),
                    "commands": ["make build (if defined)", "make test (if defined)"],
                }
            )

        return signals
