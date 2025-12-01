"""
API client for interacting with the Prompt API service.

This module provides a client for making HTTP requests to the Prompt API,
with built-in retry logic, error handling, and request/response validation.
"""
import json
import logging
from typing import Any, Dict, List, Optional, Union, TypeVar, Type
from datetime import datetime
from pathlib import Path
import time

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from pydantic import BaseModel, ValidationError, HttpUrl

from ..config import settings
from ..models import PromptSpec, RunManifest, ReviewResult, TelemetryData

# Type variable for generic model parsing
T = TypeVar('T', bound=BaseModel)

logger = logging.getLogger(__name__)

class APIClientError(Exception):
    """Base exception for API client errors."""
    pass

class APIValidationError(APIClientError):
    """Raised when API response validation fails."""
    pass

class APIConnectionError(APIClientError):
    """Raised when there are connection issues with the API."""
    pass

class PromptAPIClient:
    """Client for interacting with the Prompt API.
    
    This client handles all HTTP requests to the Prompt API, including:
    - Authentication
    - Request/response serialization/deserialization
    - Error handling
    - Retry logic
    - Rate limiting
    """
    
    def __init__(self, base_url: Optional[str] = None, api_key: Optional[str] = None):
        """Initialize the API client.
        
        Args:
            base_url: Base URL of the Prompt API. Defaults to settings.prompt_api_url.
            api_key: API key for authentication. Defaults to None (no authentication).
        """
        self.base_url = (base_url or settings.prompt_api_url).rstrip('/')
        self.api_key = api_key or os.environ.get("PROMPT_API_KEY")
        self.session = self._create_session()
    
    def _create_session(self) -> requests.Session:
        """Create and configure a requests session with retry logic."""
        session = requests.Session()
        
        # Configure retry strategy
        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["HEAD", "GET", "PUT", "DELETE", "OPTIONS", "TRACE", "POST"]
        )
        
        # Mount the retry adapter
        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        
        # Set default headers
        session.headers.update({
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": f"OrchestrationBridge/1.0.0"
        })
        
        # Add API key if provided
        if self.api_key:
            session.headers.update({"Authorization": f"Bearer {self.api_key}"})
        
        return session
    
    def _request(
        self, 
        method: str, 
        endpoint: str, 
        params: Optional[Dict[str, Any]] = None,
        json_data: Optional[Dict[str, Any]] = None,
        model: Optional[Type[T]] = None
    ) -> Union[Dict[str, Any], T, None]:
        """Make an HTTP request to the API.
        
        Args:
            method: HTTP method (GET, POST, PUT, DELETE, etc.)
            endpoint: API endpoint (without base URL)
            params: Query parameters
            json_data: Request body as JSON-serializable dict
            model: Pydantic model to validate and parse response into
            
        Returns:
            Parsed response data or model instance if successful
            
        Raises:
            APIConnectionError: If there are connection issues
            APIValidationError: If response validation fails
            APIClientError: For other API-related errors
        """
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        logger.debug(f"Making {method} request to {url}")
        
        try:
            response = self.session.request(
                method=method,
                url=url,
                params=params,
                json=json_data,
                timeout=settings.api_timeout
            )
            response.raise_for_status()
            
            # Handle 204 No Content
            if response.status_code == 204:
                return None
                
            # Parse JSON response
            try:
                data = response.json()
            except ValueError as e:
                raise APIValidationError(f"Invalid JSON response: {e}")
            
            # Parse into model if provided
            if model is not None:
                try:
                    if isinstance(data, list):
                        return [model.parse_obj(item) for item in data]
                    return model.parse_obj(data)
                except ValidationError as e:
                    raise APIValidationError(f"Response validation failed: {e}")
            
            return data
            
        except requests.exceptions.RequestException as e:
            error_msg = f"API request failed: {str(e)}"
            if hasattr(e, 'response') and e.response is not None:
                try:
                    error_detail = e.response.json().get('detail', e.response.text)
                    error_msg = f"{error_msg} - {error_detail}"
                except:
                    error_msg = f"{error_msg} - {e.response.text}"
            
            logger.error(error_msg)
            raise APIConnectionError(error_msg) from e
    
    # Prompt Operations
    
    def get_prompt(self, prompt_id: str) -> Optional[PromptSpec]:
        """Get a prompt by ID."""
        try:
            data = self._request("GET", f"/prompts/{prompt_id}")
            if data:
                return PromptSpec.parse_obj(data)
            return None
        except APIClientError as e:
            if "not found" in str(e).lower():
                return None
            raise
    
    def list_prompts(self, **filters) -> List[PromptSpec]:
        """List prompts with optional filtering."""
        data = self._request("GET", "/prompts", params=filters)
        return [PromptSpec.parse_obj(item) for item in data]
    
    def update_prompt(self, prompt_id: str, data: Dict[str, Any]) -> PromptSpec:
        """Update a prompt."""
        response = self._request("PUT", f"/prompts/{prompt_id}", json_data=data)
        return PromptSpec.parse_obj(response)
    
    # Run Operations
    
    def create_run(self, run_data: Dict[str, Any]) -> RunManifest:
        """Create a new run."""
        response = self._request("POST", "/runs", json_data=run_data)
        return RunManifest.parse_obj(response)
    
    def get_run(self, run_id: str) -> Optional[RunManifest]:
        """Get a run by ID."""
        try:
            data = self._request("GET", f"/runs/{run_id}")
            if data:
                return RunManifest.parse_obj(data)
            return None
        except APIClientError as e:
            if "not found" in str(e).lower():
                return None
            raise
    
    def update_run_status(self, run_id: str, status: str, **updates) -> RunManifest:
        """Update a run's status."""
        data = {"status": status, **updates}
        response = self._request("PATCH", f"/runs/{run_id}", json_data=data)
        return RunManifest.parse_obj(response)
    
    # Review Operations
    
    def create_review(self, prompt_id: str, review_data: Dict[str, Any]) -> ReviewResult:
        """Create a review for a prompt."""
        response = self._request(
            "POST", 
            f"/prompts/{prompt_id}/reviews", 
            json_data=review_data
        )
        return ReviewResult.parse_obj(response)
    
    def list_reviews(self, prompt_id: str) -> List[ReviewResult]:
        """List reviews for a prompt."""
        data = self._request("GET", f"/prompts/{prompt_id}/reviews")
        return [ReviewResult.parse_obj(item) for item in data]
    
    # Telemetry Operations
    
    def send_telemetry(self, telemetry_data: Union[Dict[str, Any], TelemetryData]) -> bool:
        """Send telemetry data to the API."""
        if isinstance(telemetry_data, TelemetryData):
            telemetry_data = telemetry_data.dict()
            
        try:
            self._request("POST", "/telemetry", json_data=telemetry_data)
            return True
        except APIClientError:
            logger.warning("Failed to send telemetry data", exc_info=True)
            return False
