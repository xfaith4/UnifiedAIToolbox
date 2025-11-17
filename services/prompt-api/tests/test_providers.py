"""Tests for AI provider implementations."""

import pytest
from unittest.mock import AsyncMock, Mock, patch
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from providers import (
    MockProvider,
    Message,
    ModelRole,
    ProviderError,
    RateLimitError,
)


class TestMockProvider:
    """Tests for MockProvider."""
    
    @pytest.fixture
    def provider(self):
        return MockProvider(api_key="mock-key")
    
    @pytest.mark.asyncio
    async def test_provider_name(self, provider):
        assert provider.provider_name == "mock"
    
    @pytest.mark.asyncio
    async def test_generate_basic(self, provider):
        messages = [
            Message(role=ModelRole.SYSTEM, content="You are a helpful assistant."),
            Message(role=ModelRole.USER, content="Say hello!")
        ]
        
        response = await provider.generate(messages, model="gpt-4o-mini")
        
        assert response.provider == "mock"
        assert response.model == "gpt-4o-mini"
        assert "Simulated" in response.text
        assert response.tokens_used > 0
        assert response.cost == 0.0
        assert response.raw_response is not None
    
    @pytest.mark.asyncio
    async def test_generate_with_params(self, provider):
        messages = [
            Message(role=ModelRole.USER, content="Test message")
        ]
        
        response = await provider.generate(
            messages,
            model="gpt-4",
            max_tokens=500,
            temperature=0.7
        )
        
        assert "500" in response.text
        assert "0.7" in response.text
    
    @pytest.mark.asyncio
    async def test_stream_generate(self, provider):
        messages = [
            Message(role=ModelRole.USER, content="Stream test")
        ]
        
        chunks = []
        async for chunk in provider.stream_generate(messages, model="gpt-4o"):
            chunks.append(chunk)
        
        assert len(chunks) > 0
        assert chunks[-1].is_final
        
        # Reconstruct full text
        full_text = "".join(chunk.text for chunk in chunks)
        assert "Simulated" in full_text
    
    def test_count_tokens(self, provider):
        messages = [
            Message(role=ModelRole.SYSTEM, content="You are a helpful assistant."),
            Message(role=ModelRole.USER, content="Hello, world!")
        ]
        
        tokens = provider.count_tokens(messages, model="gpt-4")
        assert tokens > 0
        assert isinstance(tokens, int)
    
    def test_calculate_cost(self, provider):
        cost = provider.calculate_cost(1000, model="gpt-4")
        assert cost == 0.0  # Mock provider always returns 0 cost


class TestProviderRetry:
    """Tests for retry logic."""
    
    @pytest.mark.asyncio
    async def test_retry_on_provider_error(self):
        """Test that provider errors trigger retry."""
        provider = MockProvider(api_key="test-key")
        
        call_count = 0
        
        async def failing_func():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise ProviderError("Temporary error")
            return "Success"
        
        result = await provider._retry_with_backoff(failing_func)
        assert result == "Success"
        assert call_count == 3
    
    @pytest.mark.asyncio
    async def test_retry_exhausted(self):
        """Test that retries eventually fail."""
        provider = MockProvider(api_key="test-key")
        
        async def always_fails():
            raise ProviderError("Persistent error")
        
        with pytest.raises(ProviderError):
            await provider._retry_with_backoff(always_fails)
    
    @pytest.mark.asyncio
    async def test_no_retry_on_non_provider_error(self):
        """Test that non-provider errors don't trigger retry."""
        provider = MockProvider(api_key="test-key")
        
        call_count = 0
        
        async def fails_with_value_error():
            nonlocal call_count
            call_count += 1
            raise ValueError("Not a provider error")
        
        with pytest.raises(ValueError):
            await provider._retry_with_backoff(fails_with_value_error)
        
        # Should only be called once (no retries)
        assert call_count == 1


# Integration tests for OpenAI and Anthropic would require API keys
# and would be better suited for a separate integration test suite
# that runs with real credentials in a controlled environment

class TestOpenAIProvider:
    """Basic tests for OpenAI provider (without real API calls)."""
    
    def test_import_openai_provider(self):
        """Test that OpenAI provider can be imported."""
        try:
            from providers import OpenAIProvider
            assert OpenAIProvider is not None
        except ImportError:
            pytest.skip("OpenAI SDK not installed")
    
    def test_openai_pricing_coverage(self):
        """Test that common models have pricing configured."""
        try:
            from providers.openai_provider import OPENAI_PRICING
            
            # Check common models
            assert "gpt-4o" in OPENAI_PRICING
            assert "gpt-4o-mini" in OPENAI_PRICING
            assert "gpt-3.5-turbo" in OPENAI_PRICING
            
            # Check pricing structure
            for model, pricing in OPENAI_PRICING.items():
                assert "input" in pricing
                assert "output" in pricing
                assert pricing["input"] > 0
                assert pricing["output"] > 0
        except ImportError:
            pytest.skip("OpenAI provider not available")


class TestAnthropicProvider:
    """Basic tests for Anthropic provider (without real API calls)."""
    
    def test_import_anthropic_provider(self):
        """Test that Anthropic provider can be imported."""
        try:
            from providers import AnthropicProvider
            assert AnthropicProvider is not None
        except ImportError:
            pytest.skip("Anthropic SDK not installed")
    
    def test_anthropic_pricing_coverage(self):
        """Test that common Claude models have pricing configured."""
        try:
            from providers.anthropic_provider import ANTHROPIC_PRICING
            
            # Check common models
            assert "claude-3-haiku-20240307" in ANTHROPIC_PRICING
            assert "claude-3-sonnet-20240229" in ANTHROPIC_PRICING
            assert "claude-3-opus-20240229" in ANTHROPIC_PRICING
            
            # Check pricing structure
            for model, pricing in ANTHROPIC_PRICING.items():
                assert "input" in pricing
                assert "output" in pricing
                assert pricing["input"] > 0
                assert pricing["output"] > 0
        except ImportError:
            pytest.skip("Anthropic provider not available")
