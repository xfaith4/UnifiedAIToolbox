"""Mock provider for testing without real API calls."""

from typing import List, AsyncIterator
import asyncio

from .base import (
    BaseProvider,
    Message,
    GenerateResponse,
    StreamChunk,
    ModelRole,
)


class MockProvider(BaseProvider):
    """Mock provider that simulates API responses without actual API calls."""
    
    @property
    def provider_name(self) -> str:
        return "mock"
    
    async def generate(
        self,
        messages: List[Message],
        model: str,
        max_tokens: int = 1024,
        temperature: float = 0.2,
        **kwargs,
    ) -> GenerateResponse:
        """Generate simulated response."""
        # Simulate some processing time
        await asyncio.sleep(0.1)
        
        # Build simulated response from messages
        system_msg = next((m.content for m in messages if m.role == ModelRole.SYSTEM), "")
        user_msg = next((m.content for m in messages if m.role == ModelRole.USER), "")
        
        system_preview = system_msg[:100] + "..." if len(system_msg) > 100 else system_msg
        user_preview = user_msg[:100] + "..." if len(user_msg) > 100 else user_msg
        
        simulated_text = f"""[Simulated {self.provider_name} completion]
Model: {model}
System: {system_preview}
User: {user_preview}

This is a simulated response. In production, this would be replaced by actual AI-generated content.
Tokens requested: {max_tokens}
Temperature: {temperature}"""
        
        # Simulate token usage (rough estimate)
        tokens_used = len(simulated_text.split()) * 2  # rough token estimate
        
        return GenerateResponse(
            text=simulated_text,
            model=model,
            provider=self.provider_name,
            tokens_used=tokens_used,
            cost=self.calculate_cost(tokens_used, model),
            raw_response={
                "provider": self.provider_name,
                "model": model,
                "simulated": True,
            }
        )
    
    async def stream_generate(
        self,
        messages: List[Message],
        model: str,
        max_tokens: int = 1024,
        temperature: float = 0.2,
        **kwargs,
    ) -> AsyncIterator[StreamChunk]:
        """Stream simulated response in chunks."""
        # Generate full response
        response = await self.generate(messages, model, max_tokens, temperature, **kwargs)
        
        # Split into words for streaming simulation
        words = response.text.split()
        
        # Stream word by word with small delays
        for i, word in enumerate(words):
            await asyncio.sleep(0.05)  # Simulate streaming delay
            is_final = (i == len(words) - 1)
            yield StreamChunk(
                text=word + (" " if not is_final else ""),
                is_final=is_final
            )
    
    def count_tokens(self, messages: List[Message], model: str) -> int:
        """Estimate token count (simplified)."""
        total_chars = sum(len(m.content) for m in messages)
        # Rough approximation: 1 token ≈ 4 characters
        return total_chars // 4
    
    def calculate_cost(self, tokens_used: int, model: str, is_prompt: bool = False) -> float:
        """Calculate simulated cost (always zero for mock)."""
        return 0.0
