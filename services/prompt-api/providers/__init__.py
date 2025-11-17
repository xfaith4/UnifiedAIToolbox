"""Provider abstraction layer for AI model integrations."""

from .base import BaseProvider, ProviderError, RateLimitError, Message, ModelRole, GenerateResponse, StreamChunk
from .mock import MockProvider

# Import providers with graceful fallback if dependencies not installed
try:
    from .openai_provider import OpenAIProvider
except ImportError:
    OpenAIProvider = None  # type: ignore

try:
    from .anthropic_provider import AnthropicProvider
except ImportError:
    AnthropicProvider = None  # type: ignore

__all__ = [
    "BaseProvider",
    "ProviderError",
    "RateLimitError",
    "Message",
    "ModelRole",
    "GenerateResponse",
    "StreamChunk",
    "MockProvider",
    "OpenAIProvider",
    "AnthropicProvider",
]
