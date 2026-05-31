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


def test_alias_resolution_from_config():
    """Alias names should resolve to configured model pricing."""
    calculator = ModelCostCalculator()

    alias_config = calculator.get_model_config("openai_balanced")
    direct_config = calculator.get_model_config("gpt-5.4")

    assert alias_config is not None
    assert direct_config is not None
    assert alias_config["input_price_per_million"] == direct_config["input_price_per_million"]
    assert alias_config["output_price_per_million"] == direct_config["output_price_per_million"]


def test_provider_resolution_uses_model_metadata():
    """Provider should come from model metadata (with fallback behavior still available)."""
    calculator = ModelCostCalculator()

    assert calculator.get_provider("gpt-5.4") == "openai"
    assert calculator.get_provider("claude-opus-4-8") == "anthropic"


def test_cached_input_pricing_supported():
    """Cached input tokens are a subset of input tokens, priced at the cached rate.

    gpt-5.4: input 2.5 / cached 0.25 / output 15.0 per million tokens.
    With every input token cached, the uncached portion is zero, so cost is
    cached-input + output only: (1M * 0.25) + (1M * 15.0) = 15.25.
    """
    calculator = ModelCostCalculator()

    impact = calculator.calculate_impact(
        model="gpt-5.4",
        tokens_input=1_000_000,
        tokens_output=1_000_000,
        tokens_cached_input=1_000_000,
    )

    assert abs(impact.cost_usd - 15.25) < 0.000001


def test_cached_input_is_subset_of_input():
    """Uncached input + cached input + output should each be priced correctly.

    gpt-5.4: input 2.5 / cached 0.25 / output 15.0 per million tokens.
    1,000,000 input tokens of which 400,000 are cached -> 600,000 uncached.
        uncached: 0.6 * 2.5  = 1.50
        cached:   0.4 * 0.25 = 0.10
        output:   1.0 * 15.0 = 15.00
        total                = 16.60
    """
    calculator = ModelCostCalculator()

    impact = calculator.calculate_impact(
        model="gpt-5.4",
        tokens_input=1_000_000,
        tokens_output=1_000_000,
        tokens_cached_input=400_000,
    )

    assert abs(impact.cost_usd - 16.60) < 0.000001


def test_cached_input_cannot_exceed_input_without_overbilling():
    """A cached count larger than the input total must clamp, never overbill.

    gpt-5.4: input 2.5 / cached 0.25 per million tokens, no output.
    Reporting 2,000,000 cached against 1,000,000 input must price exactly
    1,000,000 cached tokens (0.25), and must never exceed the cost of pricing
    all input at the full uncached rate (2.5).
    """
    calculator = ModelCostCalculator()

    impact = calculator.calculate_impact(
        model="gpt-5.4",
        tokens_input=1_000_000,
        tokens_output=0,
        tokens_cached_input=2_000_000,
    )

    full_input_cost = calculator.calculate_impact(
        model="gpt-5.4",
        tokens_input=1_000_000,
        tokens_output=0,
    ).cost_usd

    assert abs(impact.cost_usd - 0.25) < 0.000001
    assert impact.cost_usd <= full_input_cost


def test_calls_without_cached_data_behave_as_before():
    """Calls that omit cached token data must price exactly as the legacy path.

    Passing no cached argument, passing None, and passing 0 must all yield the
    same cost, and that cost must equal full input + output pricing with no
    cached discount applied.
    """
    calculator = ModelCostCalculator()

    omitted = calculator.calculate_impact("gpt-5.4", 1_000_000, 1_000_000)
    explicit_none = calculator.calculate_impact(
        "gpt-5.4", 1_000_000, 1_000_000, tokens_cached_input=None
    )
    explicit_zero = calculator.calculate_impact(
        "gpt-5.4", 1_000_000, 1_000_000, tokens_cached_input=0
    )

    # (1M * 2.5) + (1M * 15.0) = 17.5, with no cached discount.
    assert abs(omitted.cost_usd - 17.5) < 0.000001
    assert omitted.cost_usd == explicit_none.cost_usd == explicit_zero.cost_usd

    # Legacy model without a cached rate is unaffected too.
    legacy = calculator.calculate_impact("gpt-4o-mini", 1000, 500)
    assert abs(legacy.cost_usd - 0.00045) < 0.000001
