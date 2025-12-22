"""
GitHub Webhook Handler for Unified AI Toolbox

Handles incoming GitHub webhook events and triggers appropriate orchestration workflows.
Supports events like push, pull_request, workflow_run, etc.
"""

import hashlib
import hmac
import json
import logging
import os
import subprocess
import pathlib
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from enum import Enum

from fastapi import APIRouter, Request, HTTPException, Header, BackgroundTasks, status
from pydantic import BaseModel, Field

# Initialize logger
logger = logging.getLogger(__name__)

# Configuration
WEBHOOK_SECRET = os.environ.get("GITHUB_WEBHOOK_SECRET", "")
REPO_ROOT = pathlib.Path(__file__).parents[5].resolve()
ORCHESTRATOR_SCRIPT = REPO_ROOT / "Orchestration" / "MilestoneController.ps1"
REPO_ANALYSIS_SCRIPT = REPO_ROOT / "scripts" / "Run-RepoAnalysis.ps1"

# Router for webhook endpoints
router = APIRouter(prefix="/webhooks", tags=["webhooks"])


class WebhookEventType(str, Enum):
    """Supported GitHub webhook event types"""
    PUSH = "push"
    PULL_REQUEST = "pull_request"
    WORKFLOW_RUN = "workflow_run"
    ISSUES = "issues"
    ISSUE_COMMENT = "issue_comment"
    PULL_REQUEST_REVIEW = "pull_request_review"
    PULL_REQUEST_REVIEW_COMMENT = "pull_request_review_comment"
    RELEASE = "release"
    STATUS = "status"
    CHECK_RUN = "check_run"
    CHECK_SUITE = "check_suite"


class OrchestrationAction(str, Enum):
    """Actions that can be triggered by webhooks"""
    REPO_ANALYSIS = "repo_analysis"
    CODE_REVIEW = "code_review"
    SECURITY_SCAN = "security_scan"
    BUILD_ARTIFACTS = "build_artifacts"
    CUSTOM_ORCHESTRATION = "custom_orchestration"


class WebhookPayload(BaseModel):
    """Generic webhook payload model"""
    action: Optional[str] = None
    repository: Optional[Dict[str, Any]] = None
    sender: Optional[Dict[str, Any]] = None
    pull_request: Optional[Dict[str, Any]] = None
    workflow_run: Optional[Dict[str, Any]] = None
    issue: Optional[Dict[str, Any]] = None
    ref: Optional[str] = None
    before: Optional[str] = None
    after: Optional[str] = None
    commits: Optional[List[Dict[str, Any]]] = None


class WebhookResponse(BaseModel):
    """Response model for webhook processing"""
    received: bool = True
    event_type: str
    action: Optional[str] = None
    triggered_orchestrations: List[str] = Field(default_factory=list)
    message: str = "Webhook received and queued for processing"
    webhook_id: str


class OrchestrationTrigger(BaseModel):
    """Model for orchestration trigger configuration"""
    event_types: List[WebhookEventType]
    actions: Optional[List[str]] = None  # Specific actions within event type
    orchestration_action: OrchestrationAction
    script_path: Optional[pathlib.Path] = None
    script_args: Dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


# Default orchestration triggers configuration
DEFAULT_TRIGGERS: List[OrchestrationTrigger] = [
    # Trigger repo analysis on push to main
    OrchestrationTrigger(
        event_types=[WebhookEventType.PUSH],
        actions=None,  # Any push action
        orchestration_action=OrchestrationAction.REPO_ANALYSIS,
        script_path=REPO_ANALYSIS_SCRIPT,
        script_args={"AnalysisType": "quick"},
        enabled=True
    ),
    # Trigger code review on PR opened/updated
    OrchestrationTrigger(
        event_types=[WebhookEventType.PULL_REQUEST],
        actions=["opened", "synchronize", "reopened"],
        orchestration_action=OrchestrationAction.CODE_REVIEW,
        script_path=ORCHESTRATOR_SCRIPT,
        script_args={"Action": "review-pr"},
        enabled=True
    ),
    # Trigger security scan on PR opened
    OrchestrationTrigger(
        event_types=[WebhookEventType.PULL_REQUEST],
        actions=["opened"],
        orchestration_action=OrchestrationAction.SECURITY_SCAN,
        script_path=ORCHESTRATOR_SCRIPT,
        script_args={"Action": "security-scan"},
        enabled=True
    ),
]


def verify_signature(payload_body: bytes, signature_header: str, secret: str) -> bool:
    """
    Verify that the payload was sent from GitHub by validating SHA256.
    
    Args:
        payload_body: Raw request body bytes
        signature_header: X-Hub-Signature-256 header value
        secret: Webhook secret configured in GitHub
        
    Returns:
        True if signature is valid, False otherwise
    """
    if not secret:
        # If no secret configured, skip verification (development only)
        logger.warning("GitHub webhook secret not configured - skipping signature verification")
        return True
    
    if not signature_header:
        return False
    
    hash_algorithm, github_signature = signature_header.split('=')
    if hash_algorithm != 'sha256':
        return False
    
    # Calculate expected signature
    mac = hmac.new(secret.encode(), msg=payload_body, digestmod=hashlib.sha256)
    expected_signature = mac.hexdigest()
    
    # Use hmac.compare_digest to prevent timing attacks
    return hmac.compare_digest(expected_signature, github_signature)


def parse_webhook_payload(event_type: str, payload: Dict[str, Any]) -> WebhookPayload:
    """Parse the webhook payload based on event type"""
    try:
        return WebhookPayload(**payload)
    except Exception as e:
        logger.error(f"Failed to parse webhook payload: {e}")
        return WebhookPayload()


def should_trigger_orchestration(
    trigger: OrchestrationTrigger,
    event_type: str,
    action: Optional[str]
) -> bool:
    """
    Determine if an orchestration should be triggered based on the event.
    
    Args:
        trigger: Orchestration trigger configuration
        event_type: GitHub webhook event type
        action: Action within the event (e.g., "opened" for pull_request)
        
    Returns:
        True if orchestration should be triggered
    """
    if not trigger.enabled:
        return False
    
    # Check if event type matches
    if event_type not in [et.value for et in trigger.event_types]:
        return False
    
    # If specific actions are defined, check if current action matches
    if trigger.actions is not None and action is not None:
        if action not in trigger.actions:
            return False
    
    return True


def execute_orchestration(
    trigger: OrchestrationTrigger,
    webhook_payload: WebhookPayload,
    webhook_id: str
) -> str:
    """
    Execute the orchestration script in the background.
    
    Args:
        trigger: Orchestration trigger configuration
        webhook_payload: Parsed webhook payload
        webhook_id: Unique identifier for this webhook event
        
    Returns:
        Orchestration run ID or status message
    """
    try:
        if not trigger.script_path or not trigger.script_path.exists():
            logger.error(f"Orchestration script not found: {trigger.script_path}")
            return "error_script_not_found"
        
        # Build script arguments
        args = [
            "pwsh",
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-File", str(trigger.script_path)
        ]
        
        # Add script-specific arguments
        for key, value in trigger.script_args.items():
            args.extend([f"-{key}", str(value)])
        
        # Add webhook context
        args.extend([
            "-WebhookId", webhook_id,
            "-EventType", webhook_payload.action or "unknown"
        ])
        
        # Extract repository info if available
        if webhook_payload.repository:
            repo_name = webhook_payload.repository.get("full_name", "unknown")
            args.extend(["-Repository", repo_name])
        
        logger.info(f"Executing orchestration: {' '.join(args)}")
        
        # Execute in background (non-blocking)
        # In production, consider using a task queue like Celery or RQ
        # Note: For now, we capture stderr to a log file instead of DEVNULL
        log_dir = REPO_ROOT / "artifacts" / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        log_file = log_dir / f"orchestration_{webhook_id}.log"
        
        with open(log_file, 'w') as log:
            subprocess.Popen(
                args,
                cwd=str(REPO_ROOT),
                stdout=log,
                stderr=subprocess.STDOUT,
                start_new_session=True  # Detach from parent process
            )
        
        logger.info(f"Orchestration logs will be written to: {log_file}")
        return f"{trigger.orchestration_action.value}_{webhook_id}"
        
    except Exception as e:
        logger.error(f"Failed to execute orchestration: {e}")
        return f"error: {str(e)}"


@router.post("/github", response_model=WebhookResponse)
async def handle_github_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    x_github_event: str = Header(None),
    x_hub_signature_256: str = Header(None),
    x_github_delivery: str = Header(None)
):
    """
    Handle incoming GitHub webhook events.
    
    This endpoint:
    1. Verifies the webhook signature
    2. Parses the webhook payload
    3. Determines which orchestrations to trigger
    4. Queues orchestration tasks in the background
    5. Returns immediately with confirmation
    
    Headers:
        X-GitHub-Event: Type of GitHub event (e.g., "push", "pull_request")
        X-Hub-Signature-256: HMAC signature for payload verification
        X-GitHub-Delivery: Unique identifier for this delivery
        
    Returns:
        WebhookResponse with details about triggered orchestrations
    """
    # Read raw body for signature verification
    body = await request.body()
    
    # Verify signature if secret is configured
    if not verify_signature(body, x_hub_signature_256 or "", WEBHOOK_SECRET):
        logger.warning(f"Invalid webhook signature for delivery: {x_github_delivery}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature"
        )
    
    # Parse JSON payload
    try:
        payload_json = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload"
        )
    
    # Parse webhook payload
    webhook_payload = parse_webhook_payload(x_github_event or "unknown", payload_json)
    webhook_id = x_github_delivery or datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    
    logger.info(
        f"Received GitHub webhook: event={x_github_event}, "
        f"action={webhook_payload.action}, delivery={webhook_id}"
    )
    
    # Determine which orchestrations to trigger
    triggered_orchestrations = []
    
    for trigger in DEFAULT_TRIGGERS:
        if should_trigger_orchestration(trigger, x_github_event or "", webhook_payload.action):
            logger.info(
                f"Triggering orchestration: {trigger.orchestration_action.value} "
                f"for event: {x_github_event}"
            )
            
            # Queue orchestration execution in background
            run_id = execute_orchestration(trigger, webhook_payload, webhook_id)
            triggered_orchestrations.append(run_id)
    
    # Return response immediately
    return WebhookResponse(
        received=True,
        event_type=x_github_event or "unknown",
        action=webhook_payload.action,
        triggered_orchestrations=triggered_orchestrations,
        message=f"Webhook processed. Triggered {len(triggered_orchestrations)} orchestration(s).",
        webhook_id=webhook_id
    )


@router.get("/github/config", response_model=Dict[str, Any])
async def get_webhook_config():
    """
    Get current webhook configuration and status.
    
    Returns information about:
    - Configured webhook secret (masked)
    - Available orchestration triggers
    - Enabled/disabled status
    """
    return {
        "webhook_secret_configured": bool(WEBHOOK_SECRET),
        "orchestrator_script_exists": ORCHESTRATOR_SCRIPT.exists(),
        "repo_analysis_script_exists": REPO_ANALYSIS_SCRIPT.exists(),
        "triggers": [
            {
                "event_types": [et.value for et in t.event_types],
                "actions": t.actions,
                "orchestration_action": t.orchestration_action.value,
                "enabled": t.enabled,
                "script_exists": t.script_path.exists() if t.script_path else False
            }
            for t in DEFAULT_TRIGGERS
        ]
    }


@router.post("/github/test", response_model=WebhookResponse)
async def test_webhook(
    event_type: WebhookEventType = WebhookEventType.PUSH,
    action: Optional[str] = None
):
    """
    Test webhook processing without requiring an actual GitHub webhook.
    Useful for local development and testing.
    
    Args:
        event_type: Type of GitHub event to simulate
        action: Optional action within the event
        
    Returns:
        WebhookResponse showing which orchestrations would be triggered
    """
    # Create test payload
    test_payload = WebhookPayload(
        action=action,
        repository={
            "full_name": "xfaith4/UnifiedAIToolbox",
            "name": "UnifiedAIToolbox"
        },
        sender={
            "login": "test_user"
        }
    )
    
    webhook_id = f"test_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    
    # Determine which orchestrations would be triggered
    triggered_orchestrations = []
    
    for trigger in DEFAULT_TRIGGERS:
        if should_trigger_orchestration(trigger, event_type.value, action):
            triggered_orchestrations.append(
                f"{trigger.orchestration_action.value}_{webhook_id}_simulated"
            )
    
    return WebhookResponse(
        received=True,
        event_type=event_type.value,
        action=action,
        triggered_orchestrations=triggered_orchestrations,
        message=f"Test webhook processed. Would trigger {len(triggered_orchestrations)} orchestration(s).",
        webhook_id=webhook_id
    )


# Export router
__all__ = ["router"]
