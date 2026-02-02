"""
Main artifact normalizer orchestrator.

Coordinates all normalization steps on a generated artifact directory.
"""

import os
import shutil
import zipfile
import tempfile
from pathlib import Path
from typing import Optional, List, Dict, Any

from . import transform_logger
from . import code_fence_stripper
from . import blob_splitter
from . import orphan_handler
from . import scaffolder
from . import compose_fixer
from . import validators


class ArtifactNormalizer:
    """
    Normalizes generated artifacts into runnable, correctly structured repositories.
    """
    
    def __init__(
        self,
        artifact_path: Path,
        normalize_enabled: bool = True,
        strict_mode: bool = False,
    ):
        """
        Initialize normalizer.
        
        Args:
            artifact_path: Path to artifact (ZIP file or directory)
            normalize_enabled: Whether normalization is enabled
            strict_mode: If True, fail on unresolved critical issues
        """
        self.artifact_path = Path(artifact_path)
        self.normalize_enabled = normalize_enabled
        self.strict_mode = strict_mode
        self.logger = transform_logger.TransformLogger()
        self.work_dir: Optional[Path] = None
    
    def normalize(self, output_path: Optional[Path] = None) -> Dict[str, Any]:
        """
        Normalize the artifact.
        
        Args:
            output_path: Path for normalized output (ZIP or directory)
            
        Returns:
            Dict with normalization results including:
            - success: bool
            - report: str (markdown)
            - transform_log: dict
            - validation_results: list
        """
        if not self.normalize_enabled:
            return {
                "success": True,
                "report": "Normalization disabled",
                "transform_log": {},
                "validation_results": []
            }
        
        # Step A: Load and index
        self.work_dir = self._prepare_workspace()
        if not self.work_dir:
            return {
                "success": False,
                "report": "Failed to prepare workspace",
                "transform_log": {},
                "validation_results": []
            }
        
        try:
            # Step B: Strip markdown fences
            self._strip_fences()
            
            # Step C: Detect and split bundled blobs
            self._split_blobs()
            
            # Step D: Handle orphan/weird filenames
            self._handle_orphans()
            
            # Step E: Ensure scaffolding
            self._ensure_scaffolding()
            
            # Step F: Fix compose files
            self._fix_compose()
            
            # Step G: Run validations
            all_passed, validation_results = validators.run_all_validations(self.work_dir)
            
            # Generate reports
            report_md = self.logger.generate_markdown_report()
            
            # Add validation results to report
            report_md += "\n## Validation Results\n\n"
            for result in validation_results:
                status = "✅ PASS" if result.passed else "❌ FAIL"
                report_md += f"### {status}: {result.name}\n"
                if result.message:
                    report_md += f"{result.message}\n"
                report_md += "\n"
            
            # Save reports in work_dir
            (self.work_dir / "normalization_report.md").write_text(report_md, encoding="utf-8")
            self.logger.save_to_file(self.work_dir / "normalize_log.json")
            
            # Step H: Repackage if needed
            if output_path:
                self._repackage(output_path)
            
            # Determine success
            if self.strict_mode and not all_passed:
                success = False
            else:
                success = True
            
            return {
                "success": success,
                "report": report_md,
                "transform_log": self.logger.get_summary(),
                "validation_results": [r.to_dict() for r in validation_results],
                "work_dir": str(self.work_dir) if self.work_dir else None
            }
            
        except Exception as e:
            return {
                "success": False,
                "report": f"Normalization failed: {e}",
                "transform_log": self.logger.get_summary(),
                "validation_results": [],
                "error": str(e)
            }
    
    def _prepare_workspace(self) -> Optional[Path]:
        """Prepare workspace directory from artifact."""
        # Create temp workspace
        temp_dir = Path(tempfile.mkdtemp(prefix="normalize_"))
        
        # If artifact is a ZIP, extract it
        if self.artifact_path.is_file() and self.artifact_path.suffix == ".zip":
            try:
                with zipfile.ZipFile(self.artifact_path, 'r') as zip_ref:
                    zip_ref.extractall(temp_dir)
                return temp_dir
            except Exception as e:
                print(f"Failed to extract ZIP: {e}")
                return None
        
        # If artifact is a directory, copy it
        elif self.artifact_path.is_dir():
            work_dir = temp_dir / "artifact"
            shutil.copytree(self.artifact_path, work_dir)
            return work_dir
        
        else:
            print(f"Unsupported artifact type: {self.artifact_path}")
            return None
    
    def _strip_fences(self):
        """Strip markdown code fences from code files."""
        if not self.work_dir:
            return
        
        for file_path in self.work_dir.rglob("*"):
            if not file_path.is_file():
                continue
            
            if code_fence_stripper.should_check_file(file_path):
                was_modified, error = code_fence_stripper.process_file(file_path)
                
                if was_modified:
                    rel_path = str(file_path.relative_to(self.work_dir))
                    self.logger.log(
                        action="strip_fence",
                        path_before=rel_path,
                        path_after=None,
                        reason="Removed markdown code fences"
                    )
                elif error:
                    print(f"Warning: {file_path}: {error}")
    
    def _split_blobs(self):
        """Detect and split bundled multi-file blobs."""
        if not self.work_dir:
            return
        
        for file_path in list(self.work_dir.rglob("*")):
            if not file_path.is_file():
                continue
            
            if blob_splitter.should_check_for_blob(file_path):
                was_split, extracted, error = blob_splitter.process_blob_file(
                    file_path, self.work_dir
                )
                
                if was_split:
                    rel_path = str(file_path.relative_to(self.work_dir))
                    self.logger.log(
                        action="split_blob",
                        path_before=rel_path,
                        path_after=", ".join(extracted),
                        reason=f"Split into {len(extracted)} files"
                    )
                elif error:
                    print(f"Warning: {file_path}: {error}")
    
    def _handle_orphans(self):
        """Handle orphan and weirdly-named files."""
        if not self.work_dir:
            return
        
        for file_path in list(self.work_dir.rglob("*")):
            if not file_path.is_file():
                continue
            
            was_relocated, new_path, reason = orphan_handler.process_orphan_file(
                file_path, self.work_dir
            )
            
            if was_relocated:
                rel_path_before = str(file_path.relative_to(self.work_dir))
                self.logger.log(
                    action="relocate_orphan",
                    path_before=rel_path_before,
                    path_after=new_path,
                    reason=reason
                )
    
    def _ensure_scaffolding(self):
        """Ensure minimal scaffolding exists."""
        if not self.work_dir:
            return
        
        # Backend scaffolding
        backend_created = scaffolder.ensure_backend_scaffolding(self.work_dir)
        for path, reason in backend_created:
            self.logger.log(
                action="create_scaffold",
                path_before="<missing>",
                path_after=path,
                reason=reason
            )
        
        # Frontend scaffolding
        frontend_created = scaffolder.ensure_frontend_scaffolding(self.work_dir)
        for path, reason in frontend_created:
            self.logger.log(
                action="create_scaffold",
                path_before="<missing>",
                path_after=path,
                reason=reason
            )
    
    def _fix_compose(self):
        """Fix docker-compose files."""
        if not self.work_dir:
            return
        
        compose_files = [
            "docker-compose.yml",
            "docker-compose.yaml",
            "compose.yml",
            "compose.yaml"
        ]
        
        for name in compose_files:
            compose_path = self.work_dir / name
            if compose_path.exists():
                was_fixed, extracted, error = compose_fixer.fix_compose_file(
                    compose_path, self.work_dir
                )
                
                if was_fixed:
                    self.logger.log(
                        action="fix_compose",
                        path_before=name,
                        path_after=name,
                        reason=f"Rewrote compose file, extracted {len(extracted)} Dockerfiles"
                    )
                elif error:
                    print(f"Warning: {compose_path}: {error}")
    
    def _repackage(self, output_path: Path):
        """Repackage normalized workspace to output."""
        if not self.work_dir:
            return
        
        output_path = Path(output_path)
        
        # If output is a ZIP
        if output_path.suffix == ".zip":
            with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for file_path in self.work_dir.rglob("*"):
                    if file_path.is_file():
                        arcname = file_path.relative_to(self.work_dir)
                        zipf.write(file_path, arcname)
        
        # If output is a directory
        elif output_path.is_dir() or not output_path.exists():
            if output_path.exists():
                shutil.rmtree(output_path)
            shutil.copytree(self.work_dir, output_path)
        
        else:
            print(f"Unsupported output type: {output_path}")
    
    def cleanup(self):
        """Clean up temporary workspace."""
        if self.work_dir and self.work_dir.exists():
            shutil.rmtree(self.work_dir, ignore_errors=True)
