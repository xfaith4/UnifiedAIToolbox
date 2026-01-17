"""
Integration example demonstrating the PromptOps workflow end-to-end.

This example shows:
1. Creating a simulated orchestration run with traces
2. Running post-run review to generate patches
3. Applying patches through gates
4. Activating a new version

This is a demonstration script, not a full test.
"""

import json
import tempfile
import shutil
from pathlib import Path
from datetime import datetime, timezone

# Import PromptOps modules
from orchestrator_logger import OrchestratorLogger
from stack_validator import StackValidator
from prompt_reviewer import PromptReviewer
from prompt_versioning import PromptRegistry
from prompt_gates import PromptGates, EvalCase


def create_example_run():
    """Create an example orchestration run with issues."""
    print("=" * 60)
    print("STEP 1: Creating Example Orchestration Run")
    print("=" * 60)
    
    # Create temporary artifacts directory
    artifacts_root = Path("./test_promptops_artifacts")
    artifacts_root.mkdir(exist_ok=True)
    
    # Initialize logger
    logger = OrchestratorLogger(artifacts_root)
    run_id = logger.run_id
    
    print(f"Run ID: {run_id}")
    print(f"Run directory: {logger.run_dir}")
    
    # Log run metadata
    logger.log_run_metadata(
        orchestrator_version="1.5.0",
        prompt_library_hash="abc123def456",
        user_goal="Build a task management REST API with React frontend",
        context_payload={"language": "Python", "frontend": "React"},
        definition_of_done=[
            "API endpoints created",
            "React frontend created",
            "Tests pass"
        ]
    )
    
    # Create stack lock
    validator = StackValidator(logger.run_dir)
    validator.create_stack_lock(
        run_id=run_id,
        frontend="React",
        backend="Python/FastAPI",
        db="PostgreSQL",
        package_manager="npm"
    )
    
    # Simulate agent steps with schema failure
    logger.log_step(
        step_id="step_001",
        agent_id="Engineer",
        model="gpt-4o",
        prompt_text="You are an engineer. Build the API.",
        input_payload={"task": "Create API"},
        raw_output="I will create the API using FastAPI...",  # Non-JSON output
        parsed_output=None,  # Failed to parse
        schema_validation={"passed": False, "errors": ["Output is not valid JSON"]},
        timing_ms=2500.0
    )
    
    logger.log_step(
        step_id="step_002",
        agent_id="Engineer",
        model="gpt-4o",
        prompt_text="You are an engineer. Create frontend.",
        input_payload={"task": "Create frontend"},
        raw_output='{"framework": "React", "files": ["App.jsx", "index.html"]}',
        parsed_output={"framework": "React", "files": ["App.jsx", "index.html"]},
        schema_validation={"passed": True, "errors": []},
        timing_ms=1800.0
    )
    
    # Log decision
    logger.log_decision(
        decision_id="dec_001",
        decision_type="stack_choice",
        chosen="Python/FastAPI",
        rationale="Modern, fast, good for APIs",
        confidence=0.9,
        reversible=True,
        validation_plan="Test API endpoints",
        alternatives=["Node.js/Express", "Django"]
    )
    
    # Simulate stack conflict
    logger.log_conflict(
        conflict_id="conf_001",
        artifacts_involved=["frontend/component.vue", "stack_lock.json"],
        conflict_summary="Vue component generated when React was locked",
        resolution="Regenerated with React constraint",
        reason="Stack lock violation",
        followup_action="Validate all frontend files"
    )
    
    # Log artifact manifest
    logger.log_artifact_manifest(
        files=[
            {"path": "api/main.py", "sha256": "abc"*16, "size_bytes": 1234},
            {"path": "frontend/App.jsx", "sha256": "def"*16, "size_bytes": 567}
        ],
        detected_stacks={"frontend": "React", "backend": "Python", "db": "PostgreSQL"},
        entrypoints_found=["api/main.py", "frontend/index.html"],
        warnings=[]
    )
    
    # Log verification (with failures)
    logger.log_verification(
        lint_result={"passed": True, "output": "All files pass linting"},
        build_result={"passed": False, "output": "Build failed: missing dependency"},
        unit_test_result={"passed": False, "output": "2 tests failed"}
    )
    
    print(f"\nCreated example run with:")
    print(f"  - 2 steps (1 schema failure)")
    print(f"  - 1 decision")
    print(f"  - 1 conflict (stack violation)")
    print(f"  - Verification failures")
    
    return logger.run_dir, artifacts_root


def review_run(run_dir):
    """Review the run and generate patch plan."""
    print("\n" + "=" * 60)
    print("STEP 2: Reviewing Run and Generating Patches")
    print("=" * 60)
    
    reviewer = PromptReviewer(run_dir)
    plan = reviewer.review_run()
    
    print(f"\nRun Diagnosis:")
    print(f"  Root causes: {len(plan.run_diagnosis.root_causes)}")
    for cause in plan.run_diagnosis.root_causes:
        print(f"    - {cause.type}: {cause.impact}")
        print(f"      Evidence: {', '.join(cause.evidence[:3])}")
    
    print(f"\n  Metrics:")
    for key, value in plan.run_diagnosis.metrics.items():
        print(f"    - {key}: {value}")
    
    print(f"\nProposed Patches: {len(plan.patches)}")
    for i, patch in enumerate(plan.patches, 1):
        print(f"  {i}. Target: {patch.target}")
        print(f"     Change: {patch.change_type}")
        print(f"     Reason: {patch.reason}")
        print(f"     Risk: {patch.risk}")
    
    # Save patch plan
    plan_path = run_dir / "PromptPatchPlan.json"
    reviewer.save_patch_plan(plan, plan_path)
    print(f"\nSaved patch plan to: {plan_path}")
    
    return plan


def apply_patches_with_gates(plan, prompts_dir):
    """Apply patches and validate through gates."""
    print("\n" + "=" * 60)
    print("STEP 3: Applying Patches and Running Gates")
    print("=" * 60)
    
    # Initialize registry
    registry = PromptRegistry(prompts_dir)
    
    # Load active library
    active_lib = registry.load_active_library()
    if not active_lib:
        print("WARNING: No active library found. Using example library.")
        active_lib = {
            "agents": [
                {
                    "id": "Engineer",
                    "name": "Engineer",
                    "prompt": "You are an engineer. Build software.",
                    "constraints": ["Follow best practices", "Write clean code"],
                    "io_contract": {
                        "output_schema": {
                            "type": "object",
                            "properties": {
                                "result": {"type": "string"}
                            }
                        }
                    }
                }
            ]
        }
    
    # Apply patches to create candidate
    candidate = active_lib
    applied = 0
    for patch in plan.patches:
        # Find agent index
        agent_id = patch.target.get("agent_id")
        agent_idx = None
        for i, agent in enumerate(candidate.get("agents", [])):
            if agent.get("id") == agent_id:
                agent_idx = i
                break
        
        if agent_idx is None:
            print(f"  SKIPPED patch for {agent_id}: Agent not found")
            continue
        
        # Adjust patch paths to include agent index
        from prompt_versioning import PromptPatch, PatchOperation
        adjusted_operations = []
        for op in patch.patch:
            adjusted_op = PatchOperation(
                op=op.op,
                path=f"/agents/{agent_idx}{op.path}",
                value=op.value
            )
            adjusted_operations.append(adjusted_op)
        
        ppatch = PromptPatch(
            target=patch.target,
            change_type=patch.change_type,
            patch=adjusted_operations,
            reason=patch.reason,
            risk=patch.risk,
            tests_required=patch.tests_required
        )
        
        success, candidate, errors = registry.apply_patch(candidate, ppatch)
        if success:
            applied += 1
        else:
            print(f"  FAILED to apply patch for {agent_id}: {errors}")
    
    print(f"\nApplied {applied}/{len(plan.patches)} patches")
    
    # Run through gates
    print("\nRunning validation gates...")
    evals_dir = prompts_dir / "evals"
    gates = PromptGates(evals_dir)
    
    # Determine risk level
    risk_level = "low"
    if any(p.risk == "high" for p in plan.patches):
        risk_level = "high"
    elif any(p.risk == "medium" for p in plan.patches):
        risk_level = "medium"
    
    decision, gate_results, eval_results = gates.validate_candidate(candidate, risk_level)
    
    print(f"\nGate Results: {decision.gates_passed}/{decision.gates_total} passed")
    for gate in gate_results:
        status = "✓ PASS" if gate.passed else "✗ FAIL"
        print(f"  {status} {gate.gate_name}")
        if gate.details and not gate.passed:
            print(f"    {gate.details}")
    
    print(f"\nDecision: {decision.action}")
    print(f"Reason: {decision.reason}")
    print(f"Approved for auto-apply: {decision.approved}")
    
    return candidate, decision


def activate_candidate(candidate, prompts_dir):
    """Activate the candidate library."""
    print("\n" + "=" * 60)
    print("STEP 4: Activating Candidate Library")
    print("=" * 60)
    
    registry = PromptRegistry(prompts_dir)
    
    # Create version
    version_id, version_path = registry.create_version(
        candidate,
        description="Applied PromptOps patches - fix schema failures",
        created_by="promptops_demo"
    )
    
    print(f"\nCreated version: {version_id}")
    print(f"Version path: {version_path}")
    
    # Activate
    success = registry.activate_version(version_id)
    if success:
        print(f"✓ Activated version {version_id}")
        
        # Add changelog entry
        registry.add_changelog_entry(
            version_id,
            "Demo: Fixed schema validation failures",
            [
                "Added OUTPUT JSON constraint to Engineer agent",
                "Improved stack consistency enforcement"
            ]
        )
        print("✓ Updated changelog")
    else:
        print("✗ Failed to activate version")
    
    # Show active hash
    active_hash = registry.get_active_hash()
    print(f"\nActive library hash: {active_hash[:16] if active_hash else 'N/A'}...")
    
    return version_id


def main():
    """Run the complete PromptOps demo."""
    print("\n")
    print("╔" + "=" * 58 + "╗")
    print("║" + " " * 12 + "PromptOps Integration Demo" + " " * 20 + "║")
    print("╚" + "=" * 58 + "╝")
    print()
    
    try:
        # Create temporary prompts directory
        prompts_dir = Path("./test_promptops_prompts")
        prompts_dir.mkdir(exist_ok=True)
        (prompts_dir / "versions").mkdir(exist_ok=True)
        (prompts_dir / "candidates").mkdir(exist_ok=True)
        (prompts_dir / "evals").mkdir(exist_ok=True)
        
        # Initialize changelog
        changelog_path = prompts_dir / "changelog.md"
        if not changelog_path.exists():
            changelog_path.write_text("# Prompt Library Changelog\n\n")
        
        # Step 1: Create example run
        run_dir, artifacts_root = create_example_run()
        
        # Step 2: Review run
        plan = review_run(run_dir)
        
        # Step 3: Apply patches and validate
        candidate, decision = apply_patches_with_gates(plan, prompts_dir)
        
        # Step 4: Activate if approved
        if decision.approved:
            version_id = activate_candidate(candidate, prompts_dir)
        else:
            print("\n" + "=" * 60)
            print("Candidate NOT auto-applied (requires manual approval)")
            print("=" * 60)
        
        print("\n" + "=" * 60)
        print("DEMO COMPLETE!")
        print("=" * 60)
        print(f"\nArtifacts created:")
        print(f"  - Run traces: {artifacts_root}")
        print(f"  - Prompt versions: {prompts_dir}")
        print(f"\nYou can inspect the generated files to see the full workflow.")
        
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0


if __name__ == "__main__":
    exit(main())
