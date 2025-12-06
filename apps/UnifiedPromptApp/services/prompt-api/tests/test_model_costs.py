"""
Tests for model cost and environmental impact calculations.
"""
import pathlib
import json
import tempfile
from model_costs import ModelCostCalculator, ModelImpact, calculate_impact


def test_load_config():
    """Test loading model costs configuration."""
    calculator = ModelCostCalculator()
    
    # Check that config loaded
    assert calculator._config is not None
    assert "models" in calculator._config
    
    # Check some expected models
    models = calculator.get_all_models()
    assert "gpt-4o-mini" in models
    assert "gpt-4o" in models


def test_get_model_config():
    """Test retrieving model configuration."""
    calculator = ModelCostCalculator()
    
    # Exact match
    config = calculator.get_model_config("gpt-4o-mini")
    assert config is not None
    assert config["input_price_per_million"] == 0.15
    assert config["output_price_per_million"] == 0.60
    assert "kwh_per_million_tokens" in config
    assert "liters_per_million_tokens" in config
    
    # Partial match (model with version suffix)
    config = calculator.get_model_config("gpt-4o-mini-2024-07-18")
    assert config is not None
    assert config["input_price_per_million"] == 0.15
    
    # Unknown model
    config = calculator.get_model_config("unknown-model")
    assert config is None


def test_calculate_impact_basic():
    """Test basic cost and impact calculation."""
    calculator = ModelCostCalculator()
    
    # Test with gpt-4o-mini
    impact = calculator.calculate_impact("gpt-4o-mini", 1000, 500)
    
    # Cost calculation: (1000/1M * 0.15) + (500/1M * 0.60) = 0.00015 + 0.0003 = 0.00045
    assert abs(impact.cost_usd - 0.00045) < 0.000001
    
    # Energy: (1500/1M * 0.5) = 0.00075
    assert abs(impact.kwh_estimated - 0.00075) < 0.000001
    
    # Water: (1500/1M * 5.0) = 0.0075
    assert abs(impact.water_liters_estimated - 0.0075) < 0.000001
    
    assert impact.model == "gpt-4o-mini"
    assert impact.tokens_input == 1000
    assert impact.tokens_output == 500


def test_calculate_impact_different_models():
    """Test calculations for different models."""
    calculator = ModelCostCalculator()
    
    # gpt-4o (more expensive)
    impact = calculator.calculate_impact("gpt-4o", 1000, 1000)
    # (1000/1M * 2.5) + (1000/1M * 10.0) = 0.0025 + 0.01 = 0.0125
    assert abs(impact.cost_usd - 0.0125) < 0.000001
    
    # gpt-3.5-turbo (cheaper)
    impact = calculator.calculate_impact("gpt-3.5-turbo", 1000, 1000)
    # (1000/1M * 0.5) + (1000/1M * 1.5) = 0.0005 + 0.0015 = 0.002
    assert abs(impact.cost_usd - 0.002) < 0.000001


def test_calculate_impact_unknown_model():
    """Test handling of unknown models."""
    calculator = ModelCostCalculator()
    
    impact = calculator.calculate_impact("totally-unknown-model", 1000, 500)
    
    # Should return zero impact without crashing
    assert impact.cost_usd == 0.0
    assert impact.kwh_estimated == 0.0
    assert impact.water_liters_estimated == 0.0
    assert impact.model == "totally-unknown-model"
    assert impact.tokens_input == 1000
    assert impact.tokens_output == 500


def test_calculate_impact_none_tokens():
    """Test handling of None token values."""
    calculator = ModelCostCalculator()
    
    impact = calculator.calculate_impact("gpt-4o-mini", None, None)
    
    # Should handle None gracefully
    assert impact.cost_usd == 0.0
    assert impact.kwh_estimated == 0.0
    assert impact.water_liters_estimated == 0.0
    assert impact.tokens_input == 0
    assert impact.tokens_output == 0


def test_impact_to_dict():
    """Test ModelImpact to_dict conversion."""
    impact = ModelImpact(
        cost_usd=0.00123456789,
        kwh_estimated=0.00098765432,
        water_liters_estimated=0.012345678,
        model="gpt-4o-mini",
        tokens_input=1000,
        tokens_output=500
    )
    
    result = impact.to_dict()
    
    assert result["cost_usd"] == 0.001235  # Rounded to 6 decimals
    assert result["kwh_estimated"] == 0.000988
    assert result["water_liters_estimated"] == 0.012346
    assert result["model"] == "gpt-4o-mini"
    assert result["tokens_input"] == 1000
    assert result["tokens_output"] == 500
    assert result["total_tokens"] == 1500


def test_global_calculate_function():
    """Test convenience function using global calculator."""
    impact = calculate_impact("gpt-4o-mini", 1000, 500)
    
    assert impact.cost_usd > 0
    assert impact.kwh_estimated > 0
    assert impact.water_liters_estimated > 0


def test_custom_config_path():
    """Test loading from custom config path."""
    # Create a temporary config file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        config = {
            "models": {
                "test-model": {
                    "input_price_per_million": 1.0,
                    "output_price_per_million": 2.0,
                    "kwh_per_million_tokens": 0.1,
                    "liters_per_million_tokens": 1.0
                }
            }
        }
        json.dump(config, f)
        config_path = pathlib.Path(f.name)
    
    try:
        calculator = ModelCostCalculator(config_path)
        
        impact = calculator.calculate_impact("test-model", 1000000, 1000000)
        assert abs(impact.cost_usd - 3.0) < 0.000001  # (1M/1M * 1.0) + (1M/1M * 2.0)
        assert abs(impact.kwh_estimated - 0.2) < 0.000001  # (2M/1M * 0.1)
        assert abs(impact.water_liters_estimated - 2.0) < 0.000001  # (2M/1M * 1.0)
    finally:
        config_path.unlink()


def test_reload_config():
    """Test config reloading."""
    calculator = ModelCostCalculator()
    initial_models = calculator.get_all_models()
    
    # Reload should work without error
    calculator.reload_config()
    reloaded_models = calculator.get_all_models()
    
    assert initial_models == reloaded_models
