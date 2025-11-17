"""Anthropic (Claude) provider implementation."""

from typing import List, AsyncIterator, Optional

from .base import (
    BaseProvider,
    Message,
    GenerateResponse,
    StreamChunk,
    ProviderError,
    RateLimitError,
    RetryConfig,
    RateLimiter,
    ModelRole,
)

try:
    from anthropic import AsyncAnthropic, APIError, RateLimitError as AnthropicRateLimitError
except ImportError:
    # Allow module to be imported even if anthropic is not installed
    AsyncAnthropic = None
    APIError = Exception
    AnthropicRateLimitError = Exception


# Pricing per 1M tokens (as of Nov 2024)
# https://www.anthropic.com/pricing
ANTHROPIC_PRICING = {
    "claude-3-5-sonnet-20241022": {"input": 3.00, "output": 15.00},
    "claude-3-5-sonnet-20240620": {"input": 3.00, "output": 15.00},
    "claude-3-opus-20240229": {"input": 15.00, "output": 75.00},
    "claude-3-sonnet-20240229": {"input": 3.00, "output": 15.00},
    "claude-3-haiku-20240307": {"input": 0.25, "output": 1.25},
}


class AnthropicProvider(BaseProvider):
    """Anthropic API provider for Claude models."""
    
    def __init__(
        self,
        api_key: str,
        retry_config: Optional[RetryConfig] = None,
        rate_limiter: Optional[RateLimiter] = None,
    ):
        """Initialize Anthropic provider.
        
        Args:
            api_key: Anthropic API key
            retry_config: Retry configuration
            rate_limiter: Rate limiter configuration
        """
        super().__init__(api_key, retry_config, rate_limiter)
        
        if AsyncAnthropic is None:
            raise ImportError("anthropic package is required. Install with: pip install anthropic")
        
        self.client = AsyncAnthropic(api_key=api_key)
    
    @property
    def provider_name(self) -> str:
        return "anthropic"
    
    async def generate(
        self,
        messages: List[Message],
        model: str,
        max_tokens: int = 1024,
        temperature: float = 0.2,
        **kwargs,
    ) -> GenerateResponse:
        """Generate text completion using Anthropic API."""
        
        async def _generate():
            try:
                # Anthropic requires system message separately
                system_message = None
                conversation_messages = []
                
                for msg in messages:
                    if msg.role == ModelRole.SYSTEM:
                        system_message = msg.content
                    else:
                        conversation_messages.append({
                            "role": msg.role.value,
                            "content": msg.content
                        })
                
                # Call Anthropic API
                response = await self.client.messages.create(
                    model=model,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    system=system_message,
                    messages=conversation_messages,
                    **kwargs
                )
                
                # Extract response
                text = ""
                for block in response.content:
                    if hasattr(block, 'text'):
                        text += block.text
                
                # Calculate tokens and cost
                input_tokens = response.usage.input_tokens
                output_tokens = response.usage.output_tokens
                tokens_used = input_tokens + output_tokens
                
                cost = (
                    self.calculate_cost(input_tokens, model, is_prompt=True) +
                    self.calculate_cost(output_tokens, model, is_prompt=False)
                )
                
                return GenerateResponse(
                    text=text,
                    model=model,
                    provider=self.provider_name,
                    tokens_used=tokens_used,
                    cost=cost,
                    raw_response={
                        "id": response.id,
                        "model": response.model,
                        "stop_reason": response.stop_reason,
                        "input_tokens": input_tokens,
                        "output_tokens": output_tokens,
                    }
                )
            
            except AnthropicRateLimitError as e:
                raise RateLimitError(f"Anthropic rate limit exceeded: {str(e)}")
            except APIError as e:
                raise ProviderError(f"Anthropic API error: {str(e)}")
            except Exception as e:
                raise ProviderError(f"Unexpected error calling Anthropic: {str(e)}")
        
        return await self._retry_with_backoff(_generate)
    
    async def stream_generate(
        self,
        messages: List[Message],
        model: str,
        max_tokens: int = 1024,
        temperature: float = 0.2,
        **kwargs,
    ) -> AsyncIterator[StreamChunk]:
        """Stream text completion using Anthropic API."""
        
        try:
            # Anthropic requires system message separately
            system_message = None
            conversation_messages = []
            
            for msg in messages:
                if msg.role == ModelRole.SYSTEM:
                    system_message = msg.content
                else:
                    conversation_messages.append({
                        "role": msg.role.value,
                        "content": msg.content
                    })
            
            if self.rate_limiter:
                await self.rate_limiter.wait_if_needed()
            
            # Call Anthropic streaming API
            async with self.client.messages.stream(
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system_message,
                messages=conversation_messages,
                **kwargs
            ) as stream:
                async for text in stream.text_stream:
                    yield StreamChunk(text=text, is_final=False)
                
                # Final chunk
                yield StreamChunk(text="", is_final=True)
        
        except AnthropicRateLimitError as e:
            raise RateLimitError(f"Anthropic rate limit exceeded: {str(e)}")
        except APIError as e:
            raise ProviderError(f"Anthropic API error: {str(e)}")
        except Exception as e:
            raise ProviderError(f"Unexpected error streaming from Anthropic: {str(e)}")
    
    def count_tokens(self, messages: List[Message], model: str) -> int:
        """Estimate token count for Anthropic models.
        
        Note: This is a rough approximation. Anthropic's token counting
        is model-specific and complex. For accurate counts, use their
        token counting API.
        """
        total_chars = sum(len(m.content) for m in messages)
        # Rough approximation: 1 token ≈ 3.5 characters for Claude
        return int(total_chars / 3.5)
    
    def calculate_cost(self, tokens_used: int, model: str, is_prompt: bool = False) -> float:
        """Calculate cost based on Anthropic pricing.
        
        Args:
            tokens_used: Number of tokens
            model: Model identifier
            is_prompt: Whether tokens are input (prompt) or output (completion)
        
        Returns:
            Cost in USD
        """
        pricing = ANTHROPIC_PRICING.get(model)
        if not pricing:
            # Default to claude-3-haiku pricing if model not found
            pricing = ANTHROPIC_PRICING["claude-3-haiku-20240307"]
        
        rate_per_million = pricing["input"] if is_prompt else pricing["output"]
        return (tokens_used / 1_000_000) * rate_per_million
