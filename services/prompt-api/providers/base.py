"""Base provider interface for AI model integrations."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Dict, Any, Optional, AsyncIterator
import time
import asyncio
from enum import Enum


class ProviderError(Exception):
    """Base exception for provider errors."""
    pass


class RateLimitError(ProviderError):
    """Exception raised when rate limit is hit."""
    pass


class ModelRole(str, Enum):
    """Message roles for chat completions."""
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"


@dataclass
class Message:
    """Chat message structure."""
    role: ModelRole
    content: str


@dataclass
class GenerateResponse:
    """Response from text generation."""
    text: str
    model: str
    provider: str
    tokens_used: int
    cost: float
    raw_response: Optional[Dict[str, Any]] = None


@dataclass
class StreamChunk:
    """Streaming response chunk."""
    text: str
    is_final: bool = False


class RetryConfig:
    """Configuration for retry behavior."""
    
    def __init__(
        self,
        max_retries: int = 3,
        initial_delay: float = 1.0,
        max_delay: float = 60.0,
        exponential_base: float = 2.0,
    ):
        self.max_retries = max_retries
        self.initial_delay = initial_delay
        self.max_delay = max_delay
        self.exponential_base = exponential_base
    
    def get_delay(self, attempt: int) -> float:
        """Calculate delay for given attempt using exponential backoff."""
        delay = self.initial_delay * (self.exponential_base ** attempt)
        return min(delay, self.max_delay)


class RateLimiter:
    """Simple rate limiter for API calls."""
    
    def __init__(self, requests_per_minute: int = 60):
        self.requests_per_minute = requests_per_minute
        self.min_interval = 60.0 / requests_per_minute
        self.last_request_time = 0.0
    
    async def wait_if_needed(self):
        """Wait if necessary to respect rate limit."""
        now = time.time()
        time_since_last = now - self.last_request_time
        if time_since_last < self.min_interval:
            await asyncio.sleep(self.min_interval - time_since_last)
        self.last_request_time = time.time()


class BaseProvider(ABC):
    """Abstract base class for AI model providers."""
    
    def __init__(
        self,
        api_key: str,
        retry_config: Optional[RetryConfig] = None,
        rate_limiter: Optional[RateLimiter] = None,
    ):
        self.api_key = api_key
        self.retry_config = retry_config or RetryConfig()
        self.rate_limiter = rate_limiter
    
    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Name of the provider (e.g., 'openai', 'anthropic')."""
        pass
    
    @abstractmethod
    async def generate(
        self,
        messages: List[Message],
        model: str,
        max_tokens: int = 1024,
        temperature: float = 0.2,
        **kwargs,
    ) -> GenerateResponse:
        """Generate text completion from messages.
        
        Args:
            messages: List of conversation messages
            model: Model identifier
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature (0.0 to 2.0)
            **kwargs: Provider-specific parameters
        
        Returns:
            GenerateResponse with generated text and metadata
        
        Raises:
            ProviderError: On API errors
            RateLimitError: When rate limit is exceeded
        """
        pass
    
    @abstractmethod
    async def stream_generate(
        self,
        messages: List[Message],
        model: str,
        max_tokens: int = 1024,
        temperature: float = 0.2,
        **kwargs,
    ) -> AsyncIterator[StreamChunk]:
        """Stream text completion from messages.
        
        Args:
            messages: List of conversation messages
            model: Model identifier
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature (0.0 to 2.0)
            **kwargs: Provider-specific parameters
        
        Yields:
            StreamChunk objects with partial text
        
        Raises:
            ProviderError: On API errors
            RateLimitError: When rate limit is exceeded
        """
        pass
    
    @abstractmethod
    def count_tokens(self, messages: List[Message], model: str) -> int:
        """Estimate token count for messages.
        
        Args:
            messages: List of messages
            model: Model identifier for token counting
        
        Returns:
            Estimated token count
        """
        pass
    
    @abstractmethod
    def calculate_cost(self, tokens_used: int, model: str, is_prompt: bool = False) -> float:
        """Calculate cost for token usage.
        
        Args:
            tokens_used: Number of tokens
            model: Model identifier
            is_prompt: Whether tokens are input (prompt) or output (completion)
        
        Returns:
            Cost in USD
        """
        pass
    
    async def _retry_with_backoff(self, func, *args, **kwargs):
        """Execute function with retry and exponential backoff.
        
        Args:
            func: Async function to execute
            *args: Positional arguments for func
            **kwargs: Keyword arguments for func
        
        Returns:
            Result from func
        
        Raises:
            Exception from func after all retries exhausted
        """
        last_exception = None
        
        for attempt in range(self.retry_config.max_retries + 1):
            try:
                if self.rate_limiter:
                    await self.rate_limiter.wait_if_needed()
                return await func(*args, **kwargs)
            except RateLimitError as e:
                last_exception = e
                if attempt < self.retry_config.max_retries:
                    delay = self.retry_config.get_delay(attempt)
                    await asyncio.sleep(delay)
                    continue
                raise
            except ProviderError as e:
                last_exception = e
                if attempt < self.retry_config.max_retries:
                    delay = self.retry_config.get_delay(attempt)
                    await asyncio.sleep(delay)
                    continue
                raise
            except Exception as e:
                # Non-provider errors should not be retried
                raise
        
        # Should not reach here, but just in case
        if last_exception:
            raise last_exception
        raise ProviderError("Retry exhausted without exception")
