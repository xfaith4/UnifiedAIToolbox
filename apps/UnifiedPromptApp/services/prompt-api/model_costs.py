"""
Model cost and environmental impact calculator.

Loads configuration from config/model_costs.json and provides utilities
to calculate USD cost, energy consumption (kWh), and water usage (liters)
for AI model API calls.
"""

import json
import pathlib
from typing import Optional, Dict, Any
from dataclasses import dataclass


@dataclass
class ModelImpact:
    """Environmental and cost impact for a model API call."""
    cost_usd: float
    kwh_estimated: float
    water_liters_estimated: float
    model: str
    tokens_input: int
    tokens_output: int

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API responses."""
        return {
            "cost_usd": round(self.cost_usd, 6),
            "kwh_estimated": round(self.kwh_estimated, 6),
            "water_liters_estimated": round(self.water_liters_estimated, 6),
            "model": self.model,
            "tokens_input": self.tokens_input,
            "tokens_output": self.tokens_output,
            "total_tokens": self.tokens_input + self.tokens_output
        }


class ModelCostCalculator:
    """
    Calculator for model costs and environmental impact.

    Loads pricing and intensity factors from config/model_costs.json
    and provides methods to calculate impact per API call.
    """

    def __init__(self, config_path: Optional[pathlib.Path] = None):
        """
        Initialize calculator with model cost configuration.

        Args:
            config_path: Path to model_costs.json. If None, uses default location.
        """
        if config_path is None:
            base_dir = pathlib.Path(__file__).parent
            config_path = base_dir / "config" / "model_costs.json"

        self.config_path = config_path
        self._config: Optional[Dict[str, Any]] = None
        self._load_config()

    def _load_config(self) -> None:
        """Load configuration from JSON file."""
        try:
            with open(self.config_path, 'r', encoding='utf-8') as f:
                self._config = json.load(f)
        except FileNotFoundError:
            print(f"Warning: Model costs config not found at {self.config_path}")
            self._config = {"models": {}}
        except json.JSONDecodeError as e:
            print(f"Warning: Invalid JSON in model costs config: {e}")
            self._config = {"models": {}}

    @staticmethod
    def _as_float(value: Any, default: float = 0.0) -> float:
        """Safely coerce numeric config values to float."""
        try:
            return float(value)
        except (TypeError, ValueError):
            return default

    def _resolve_model_name(self, model_name: str) -> str:
        """
        Resolve aliases and suffix variants to a configured model key.

        Resolution order:
        1. Exact model key in models
        2. Exact alias in aliases map
        3. Prefix match against model keys (e.g. model-with-version)
        """
        if not self._config:
            return model_name

        models = self._config.get("models", {})
        aliases = self._config.get("aliases", {})

        if model_name in models:
            return model_name

        alias_target = aliases.get(model_name)
        if isinstance(alias_target, str) and alias_target in models:
            return alias_target

        for key in models.keys():
            if model_name.startswith(key):
                return key

        return model_name

    def get_model_config(self, model_name: str) -> Optional[Dict[str, Any]]:
        """
        Get configuration for a specific model.

        Args:
            model_name: Name of the model (e.g., "gpt-4o-mini")

        Returns:
            Model configuration dict or None if not found
        """
        if not self._config:
            return None

        models = self._config.get("models", {})
        resolved_name = self._resolve_model_name(model_name)
        return models.get(resolved_name)

    def get_provider(self, model_name: str) -> str:
        """
        Resolve provider from model metadata, with a conservative fallback.
        """
        config = self.get_model_config(model_name)
        provider = (config or {}).get("provider")
        if isinstance(provider, str) and provider.strip():
            return provider.strip().lower()

        normalized = (model_name or "").lower()
        if normalized.startswith("claude"):
            return "anthropic"
        if normalized.startswith("gpt") or normalized.startswith("o"):
            return "openai"
        return "unknown"

    def calculate_impact(
        self,
        model: str,
        tokens_input: Optional[int],
        tokens_output: Optional[int],
        agent_name: Optional[str] = None,
        tokens_cached_input: Optional[int] = None,
    ) -> ModelImpact:
        """
        Calculate cost and environmental impact for a model API call.

        Args:
            model: Model name
            tokens_input: Total number of input/prompt tokens (cached + uncached)
            tokens_output: Number of output/completion tokens
            agent_name: Optional agent name for tracking
            tokens_cached_input: Portion of tokens_input served from the prompt
                cache. Treated as a subset of tokens_input and priced at the
                cached rate; clamped so it can never exceed tokens_input.

        Returns:
            ModelImpact with calculated values
        """
        tokens_input = tokens_input or 0
        tokens_output = tokens_output or 0
        tokens_cached_input = tokens_cached_input or 0

        # Cached input tokens are a *subset* of the reported input tokens, not
        # additional tokens billed on top of them. Clamp to the input total so
        # bad or rounded provider data cannot push billed input above the
        # actual input count (which would overbill the uncached portion twice).
        cached_input = min(tokens_cached_input, tokens_input)
        uncached_input = tokens_input - cached_input

        config = self.get_model_config(model)

        if not config:
            # Unknown model - return zero impact with warning
            print(f"Warning: No cost config for model '{model}', using zero impact")
            return ModelImpact(
                cost_usd=0.0,
                kwh_estimated=0.0,
                water_liters_estimated=0.0,
                model=model,
                tokens_input=tokens_input,
                tokens_output=tokens_output
            )

        # Calculate cost in USD
        input_price_per_million = self._as_float(config.get("input_price_per_million"), 0.0)
        output_price_per_million = self._as_float(config.get("output_price_per_million"), 0.0)
        cached_input_price_per_million = self._as_float(
            config.get("cached_input_price_per_million"),
            input_price_per_million,
        )

        cost_usd = (
            (uncached_input / 1_000_000) * input_price_per_million +
            (cached_input / 1_000_000) * cached_input_price_per_million +
            (tokens_output / 1_000_000) * output_price_per_million
        )

        # Calculate energy consumption (kWh)
        kwh_per_million = self._as_float(config.get("kwh_per_million_tokens"), 0.0)
        total_tokens = tokens_input + tokens_output
        kwh_estimated = (total_tokens / 1_000_000) * kwh_per_million

        # Calculate water usage (liters)
        liters_per_million = self._as_float(config.get("liters_per_million_tokens"), 0.0)
        water_liters_estimated = (total_tokens / 1_000_000) * liters_per_million

        return ModelImpact(
            cost_usd=cost_usd,
            kwh_estimated=kwh_estimated,
            water_liters_estimated=water_liters_estimated,
            model=model,
            tokens_input=tokens_input,
            tokens_output=tokens_output
        )

    def get_all_models(self) -> list[str]:
        """Get list of all supported model names."""
        if not self._config:
            return []
        return list(self._config.get("models", {}).keys())

    def reload_config(self) -> None:
        """Reload configuration from file."""
        self._load_config()


# Global instance for easy access
_calculator: Optional[ModelCostCalculator] = None


def get_calculator() -> ModelCostCalculator:
    """Get or create global calculator instance."""
    global _calculator
    if _calculator is None:
        _calculator = ModelCostCalculator()
    return _calculator


def calculate_impact(
    model: str,
    tokens_input: Optional[int],
    tokens_output: Optional[int],
    agent_name: Optional[str] = None,
    tokens_cached_input: Optional[int] = None,
) -> ModelImpact:
    """
    Convenience function to calculate impact using global calculator.

    Args:
        model: Model name
        tokens_input: Number of input tokens
        tokens_output: Number of output tokens
        agent_name: Optional agent name

    Returns:
        ModelImpact with calculated values
    """
    return get_calculator().calculate_impact(
        model, tokens_input, tokens_output, agent_name, tokens_cached_input
    )
