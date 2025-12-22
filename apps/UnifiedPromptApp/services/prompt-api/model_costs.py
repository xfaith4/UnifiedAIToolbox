"""
Model cost and environmental impact calculator.

Loads configuration from config/model_costs.json and provides utilities
to calculate USD cost, energy consumption (kWh), and water usage (liters)
for AI model API calls.
"""

import json
import pathlib
from typing import Optional, Dict, Any, Tuple
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
        
        # Try exact match first
        if model_name in models:
            return models[model_name]
        
        # Try partial match (e.g., "gpt-4o-mini-2024-07-18" matches "gpt-4o-mini")
        for key, config in models.items():
            if model_name.startswith(key):
                return config
        
        return None
    
    def calculate_impact(
        self,
        model: str,
        tokens_input: Optional[int],
        tokens_output: Optional[int],
        agent_name: Optional[str] = None
    ) -> ModelImpact:
        """
        Calculate cost and environmental impact for a model API call.
        
        Args:
            model: Model name
            tokens_input: Number of input/prompt tokens
            tokens_output: Number of output/completion tokens
            agent_name: Optional agent name for tracking
            
        Returns:
            ModelImpact with calculated values
        """
        tokens_input = tokens_input or 0
        tokens_output = tokens_output or 0
        
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
        input_price_per_million = config.get("input_price_per_million", 0.0)
        output_price_per_million = config.get("output_price_per_million", 0.0)
        
        cost_usd = (
            (tokens_input / 1_000_000) * input_price_per_million +
            (tokens_output / 1_000_000) * output_price_per_million
        )
        
        # Calculate energy consumption (kWh)
        kwh_per_million = config.get("kwh_per_million_tokens", 0.0)
        total_tokens = tokens_input + tokens_output
        kwh_estimated = (total_tokens / 1_000_000) * kwh_per_million
        
        # Calculate water usage (liters)
        liters_per_million = config.get("liters_per_million_tokens", 0.0)
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
    agent_name: Optional[str] = None
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
        model, tokens_input, tokens_output, agent_name
    )
