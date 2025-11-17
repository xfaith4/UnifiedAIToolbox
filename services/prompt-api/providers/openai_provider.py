"""OpenAI provider implementation."""

from typing import List, AsyncIterator, Optional
import tiktoken

from .base import (
    BaseProvider,
    Message,
    GenerateResponse,
    StreamChunk,
    ProviderError,
    RateLimitError,
    RetryConfig,
    RateLimiter,
)

try:
    from openai import AsyncOpenAI, OpenAIError, RateLimitError as OpenAIRateLimitError
except ImportError:
    # Allow module to be imported even if openai is not installed
    AsyncOpenAI = None
    OpenAIError = Exception
    OpenAIRateLimitError = Exception


# Pricing per 1M tokens (as of Nov 2024)
# https://openai.com/api/pricing/
OPENAI_PRICING = {
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "gpt-4o-mini": {"input": 0.150, "output": 0.600},
    "gpt-4-turbo": {"input": 10.00, "output": 30.00},
    "gpt-4": {"input": 30.00, "output": 60.00},
    "gpt-3.5-turbo": {"input": 0.50, "output": 1.50},
    "gpt-3.5-turbo-16k": {"input": 3.00, "output": 4.00},
}


class OpenAIProvider(BaseProvider):
    """OpenAI API provider for GPT models."""
    
    def __init__(
        self,
        api_key: str,
        api_base: Optional[str] = None,
        organization: Optional[str] = None,
        retry_config: Optional[RetryConfig] = None,
        rate_limiter: Optional[RateLimiter] = None,
    ):
        """Initialize OpenAI provider.
        
        Args:
            api_key: OpenAI API key
            api_base: Optional custom API base URL (for Azure OpenAI)
            organization: Optional organization ID
            retry_config: Retry configuration
            rate_limiter: Rate limiter configuration
        """
        super().__init__(api_key, retry_config, rate_limiter)
        
        if AsyncOpenAI is None:
            raise ImportError("openai package is required. Install with: pip install openai")
        
        self.client = AsyncOpenAI(
            api_key=api_key,
            base_url=api_base,
            organization=organization,
        )
    
    @property
    def provider_name(self) -> str:
        return "openai"
    
    async def generate(
        self,
        messages: List[Message],
        model: str,
        max_tokens: int = 1024,
        temperature: float = 0.2,
        **kwargs,
    ) -> GenerateResponse:
        """Generate text completion using OpenAI API."""
        
        async def _generate():
            try:
                # Convert messages to OpenAI format
                openai_messages = [
                    {"role": msg.role.value, "content": msg.content}
                    for msg in messages
                ]
                
                # Call OpenAI API
                response = await self.client.chat.completions.create(
                    model=model,
                    messages=openai_messages,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    **kwargs
                )
                
                # Extract response
                choice = response.choices[0]
                text = choice.message.content or ""
                
                # Calculate tokens and cost
                tokens_used = response.usage.total_tokens if response.usage else 0
                input_tokens = response.usage.prompt_tokens if response.usage else 0
                output_tokens = response.usage.completion_tokens if response.usage else 0
                
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
                        "finish_reason": choice.finish_reason,
                        "input_tokens": input_tokens,
                        "output_tokens": output_tokens,
                    }
                )
            
            except OpenAIRateLimitError as e:
                raise RateLimitError(f"OpenAI rate limit exceeded: {str(e)}")
            except OpenAIError as e:
                raise ProviderError(f"OpenAI API error: {str(e)}")
            except Exception as e:
                raise ProviderError(f"Unexpected error calling OpenAI: {str(e)}")
        
        return await self._retry_with_backoff(_generate)
    
    async def stream_generate(
        self,
        messages: List[Message],
        model: str,
        max_tokens: int = 1024,
        temperature: float = 0.2,
        **kwargs,
    ) -> AsyncIterator[StreamChunk]:
        """Stream text completion using OpenAI API."""
        
        try:
            # Convert messages to OpenAI format
            openai_messages = [
                {"role": msg.role.value, "content": msg.content}
                for msg in messages
            ]
            
            if self.rate_limiter:
                await self.rate_limiter.wait_if_needed()
            
            # Call OpenAI streaming API
            stream = await self.client.chat.completions.create(
                model=model,
                messages=openai_messages,
                max_tokens=max_tokens,
                temperature=temperature,
                stream=True,
                **kwargs
            )
            
            # Stream chunks
            async for chunk in stream:
                if chunk.choices:
                    delta = chunk.choices[0].delta
                    if delta.content:
                        is_final = chunk.choices[0].finish_reason is not None
                        yield StreamChunk(
                            text=delta.content,
                            is_final=is_final
                        )
        
        except OpenAIRateLimitError as e:
            raise RateLimitError(f"OpenAI rate limit exceeded: {str(e)}")
        except OpenAIError as e:
            raise ProviderError(f"OpenAI API error: {str(e)}")
        except Exception as e:
            raise ProviderError(f"Unexpected error streaming from OpenAI: {str(e)}")
    
    def count_tokens(self, messages: List[Message], model: str) -> int:
        """Count tokens using tiktoken."""
        try:
            # Get the encoding for the model
            encoding = tiktoken.encoding_for_model(model)
        except KeyError:
            # Fallback to cl100k_base encoding (used by gpt-4, gpt-3.5-turbo)
            encoding = tiktoken.get_encoding("cl100k_base")
        
        tokens = 0
        for message in messages:
            # Every message follows <|start|>{role}\n{content}<|end|>\n
            tokens += 4  # message overhead
            tokens += len(encoding.encode(message.role.value))
            tokens += len(encoding.encode(message.content))
        
        tokens += 2  # assistant reply overhead
        return tokens
    
    def calculate_cost(self, tokens_used: int, model: str, is_prompt: bool = False) -> float:
        """Calculate cost based on OpenAI pricing.
        
        Args:
            tokens_used: Number of tokens
            model: Model identifier
            is_prompt: Whether tokens are input (prompt) or output (completion)
        
        Returns:
            Cost in USD
        """
        # Normalize model name (remove version suffixes)
        base_model = model.split('-202')[0]  # Remove date suffixes like -20240806
        
        pricing = OPENAI_PRICING.get(base_model)
        if not pricing:
            # Default to gpt-4o-mini pricing if model not found
            pricing = OPENAI_PRICING["gpt-4o-mini"]
        
        rate_per_million = pricing["input"] if is_prompt else pricing["output"]
        return (tokens_used / 1_000_000) * rate_per_million
