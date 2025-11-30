"""
Prompt Registry Package

Provides centralized management of prompt specifications for the UnifiedAIToolbox.
"""
from .prompt_registry import (
    PromptSpec,
    find_prompt_by_id,
    list_prompts,
    load_prompt,
)

__all__ = [
    "PromptSpec",
    "find_prompt_by_id",
    "list_prompts",
    "load_prompt",
]
