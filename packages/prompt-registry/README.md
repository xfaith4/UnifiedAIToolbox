# Prompt Registry

A Python package for managing prompt specifications in the UnifiedAIToolbox.

## Features

- Load prompt specifications from YAML files
- Search and find prompts by ID
- List all available prompts
- Support for prompt versioning

## Installation

```bash
# From the repo root
pip install -e packages/prompt-registry
```

## Usage

```python
from prompt_registry import list_prompts, find_prompt_by_id, load_prompt

# List all prompts
prompts = list_prompts()
for prompt in prompts:
    print(f"{prompt.id} (v{prompt.version})")

# Find a specific prompt
prompt = find_prompt_by_id("analytics.divisions.performance.summary")
if prompt:
    print(prompt.to_ui_payload())

# Load a prompt from a specific file
prompt = load_prompt("/path/to/prompt.yaml")
```

## Prompt YAML Format

```yaml
id: example.prompt
version: 1.0.0
title: Example Prompt
description: An example prompt for demonstration

blocks:
  system: You are a helpful assistant.
  instructions: |
    Please help the user with their request.

variables:
  user_input:
    type: string
    required: true

integrations:
  orchestration:
    review_policy: standard
```
