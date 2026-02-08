```python
# tests/test_phi_math.py
from __future__ import annotations

import math

import pytest

from phi_explorer.core import phi_math


def test_constants_basic_values() -> None:
    assert math.isfinite(phi_math.SQRT5)
    assert math.isfinite(phi_math.PHI)
    assert math.isfinite(phi_math.INV_PHI)

    assert phi_math.SQRT5 == pytest.approx(math.sqrt(5.0), rel=0.0, abs=0.0)
    assert phi_math.PHI == pytest.approx((1.0 + math.sqrt(5.0)) / 2.0, rel=0.0, abs=0.0)
    assert phi_math.INV_PHI == pytest.approx(1.0 / phi_math.PHI, rel=0.0, abs=0.0)


def test_phi_identities() -> None:
    p = phi_math.PHI
    invp = phi_math.INV_PHI

    # φ² = φ + 1
    assert p * p == pytest.approx(p + 1.0, rel=0.0, abs=1e-15)

    # 1/φ = φ − 1
    assert invp == pytest.approx(p - 1.0, rel=0.0, abs=1e-15)

    # φ * (1/φ) = 1
    assert p * invp == pytest.approx(1.0, rel=0.0, abs=1e-15)


def test_phi_functions_return_constants() -> None:
    assert phi_math.phi() == phi_math.PHI
    assert phi_math.inv_phi() == phi_math.INV_PHI


def test_compute_phi_relations_happy_path() -> None:
    a = 2.5
    mul, div = phi_math.compute_phi_relations(a)
    assert mul == pytest.approx(a * phi_math.PHI)
    assert div == pytest.approx(a * phi_math.INV_PHI)

    a2 = -3.0
    mul2, div2 = phi_math.compute_phi_relations(a2)
    assert mul2 == pytest.approx(a2 * phi_math.PHI)
    assert div2 == pytest.approx(a2 * phi_math.INV_PHI)


@pytest.mark.parametrize("bad", [float("nan"), float("inf"), float("-inf")])
def test_compute_phi_relations_rejects_non_finite(bad: float) -> None:
    with pytest.raises(ValueError):
        phi_math.compute_phi_relations(bad)


def test_golden_sections_sum_and_ratio() -> None:
    length = 10.0
    longer, shorter = phi_math.golden_sections(length)

    # Must sum to total length
    assert longer + shorter == pytest.approx(length, rel=0.0, abs=1e-12)

    # longer/shorter = φ
    assert (longer / shorter) == pytest.approx(phi_math.PHI, rel=1e-12, abs=0.0)

    # Equivalent formula: longer = length/φ = length * 1/φ
    assert longer == pytest.approx(length * phi_math.INV_PHI, rel=0.0, abs=1e-12)


@pytest.mark.parametrize("bad", [float("nan"), float("inf"), float("-inf")])
def test_golden_sections_rejects_non_finite(bad: float) -> None:
    with pytest.raises(ValueError):
        phi_math.golden_sections(bad)


def test_phi_power_integer_and_negative() -> None:
    assert phi_math.phi_power(0) == pytest.approx(1.0)
    assert phi_math.phi_power(1) == pytest.approx(phi_math.PHI)
    assert phi_math.phi_power(2) == pytest.approx(phi_math.PHI**2)

    # Negative power
    assert phi_math.phi_power(-1) == pytest.approx(1.0 / phi_math.PHI)
    assert phi_math.phi_power(-2) == pytest.approx(1.0 / (phi_math.PHI**2))


def test_phi_power_rejects_non_int() -> None:
    with pytest.raises(TypeError):
        phi_math.phi_power(1.5)  # type: ignore[arg-type]


def test_isclose_phi_ratio_basic_and_edges() -> None:
    p = phi_math.PHI

    assert phi_math.isclose_phi_ratio(2.0 * p, 2.0)
    assert phi_math.isclose_phi_ratio(p, 1.0)

    # y == 0 should be False
    assert phi_math.isclose_phi_ratio(1.0, 0.0) is False

    # Non-finite should be False
    assert phi_math.isclose_phi_ratio(float("inf"), 1.0) is False
    assert phi_math.isclose_phi_ratio(1.0, float("nan")) is False

    # Tolerance behavior
    assert phi_math.isclose_phi_ratio(p * (1.0 + 1e-10), 1.0, rel_tol=1e-9)
    assert not phi_math.isclose_phi_ratio(p * (1.0 + 1e-6), 1.0, rel_tol=1e-9)


def test_continued_fraction_phi_terms() -> None:
    assert phi_math.continued_fraction_phi_terms(0) == []
    assert phi_math.continued_fraction_phi_terms(-5) == []
    assert phi_math.continued_fraction_phi_terms(1) == [1]
    assert phi_math.continued_fraction_phi_terms(5) == [1, 1, 1, 1, 1]


def test_fibonacci_ratio_approx_constraints() -> None:
    with pytest.raises(ValueError):
        phi_math.fibonacci_ratio_approx(0)
    with pytest.raises(ValueError):
        phi_math.fibonacci_ratio_approx(-1)


def test_fibonacci_ratio_approx_converges_toward_phi() -> None:
    # Early term is exactly 1 (F2/F1)
    assert phi_math.fibonacci_ratio_approx(1) == pytest.approx(1.0)

    # Later terms should be close to φ
    approx_10 = phi_math.fibonacci_ratio_approx(10)
    approx_20 = phi_math.fibonacci_ratio_approx(20)

    assert approx_10 == pytest.approx(phi_math.PHI, rel=2e-3)  # fairly loose
    assert approx_20 == pytest.approx(phi_math.PHI, rel=2e-5)  # tighter


def test_reference_formulas_text_contains_key_lines_and_formatting() -> None:
    txt = phi_math.reference_formulas_text(decimals=10)

    assert "Golden Ratio (φ) Quick Reference" in txt
    assert "φ = (1 + √5) / 2 ≈" in txt
    assert "1/φ = φ − 1 ≈" in txt
    assert "φ² = φ + 1" in txt
    assert "limₙ→∞ Fₙ₊₁ / Fₙ = φ" in txt

    # Check decimal formatting roughly: should include 10 digits after decimal for φ line
    # Example snippet contains something like "≈ 1.6180339887"
    assert f"{phi_math.PHI:.10f}" in txt
```