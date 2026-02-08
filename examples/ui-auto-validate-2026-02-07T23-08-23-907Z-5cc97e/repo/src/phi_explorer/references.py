```python
# src/phi_explorer/references.py
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from phi_explorer.core.phi_math import INV_PHI, PHI, SQRT5


@dataclass(frozen=True)
class ApproximationRow:
    """
    One row of an approximation table for φ.

    Attributes:
        n: Index (interpretation depends on the method).
        label: Human-friendly label for the approximation.
        value: Numeric approximation to φ.
        abs_error: |value - φ|
    """

    n: int
    label: str
    value: float
    abs_error: float


# ----------------------------
# Continued fraction utilities
# ----------------------------

def continued_fraction_phi() -> str:
    """
    Canonical simple continued fraction for φ.
      φ = [1; 1, 1, 1, …]
    """
    return "φ = [1; 1, 1, 1, …]"


def continued_fraction_convergents_phi(count: int) -> list[tuple[int, int]]:
    """
    Return the first `count` convergents p/q of φ's simple continued fraction.

    For φ = [1; 1,1,1,...], the convergents are successive ratios of Fibonacci numbers:
      1/1, 2/1, 3/2, 5/3, 8/5, ...

    We return integer pairs (p, q). For count <= 0, returns [].

    Note:
        p/q = F_{n+1}/F_n with F_1=1, F_2=1 and n starting at 1.
    """
    if count <= 0:
        return []

    # Build Fibonacci iteratively: (F_n, F_{n+1})
    f_n, f_next = 1, 1  # F1, F2 -> first convergent = 1/1
    convergents: list[tuple[int, int]] = []
    for _ in range(count):
        convergents.append((f_next, f_n))
        f_n, f_next = f_next, f_n + f_next
    return convergents


def continued_fraction_convergent_values_phi(count: int) -> list[float]:
    """Convenience: convergents as floats (p/q)."""
    return [p / q for (p, q) in continued_fraction_convergents_phi(count)]


# ----------------------------
# Identities + short derivations
# ----------------------------

def identities_text() -> str:
    """
    Compact list of common identities involving φ.

    Includes the conjugate ψ = (1 - √5)/2 = -1/φ, which is useful in Binet's formula.
    """
    psi = (1.0 - SQRT5) / 2.0
    return "\n".join(
        [
            "Key identities:",
            "  φ = (1 + √5)/2",
            "  ψ = (1 − √5)/2 = −1/φ  (the conjugate root)",
            "  φ² = φ + 1",
            "  φ − 1 = 1/φ",
            "  φ + 1 = φ²",
            "  1/φ = φ − 1 ≈ 0.618…",
            f"  Numerically: φ ≈ {PHI:.15f},  ψ ≈ {psi:.15f}",
        ]
    )


def derivations_text() -> str:
    """
    Short derivations that are frequently cited in references/teaching.

    Covers:
      - φ as solution of x^2 = x + 1
      - Reciprocal identity 1/φ = φ − 1
      - Continued fraction fixed-point form φ = 1 + 1/φ
      - Fibonacci ratio limit intuition + Binet formula pointer
    """
    psi = (1.0 - SQRT5) / 2.0
    return "\n".join(
        [
            "Derivations (quick):",
            "",
            "1) From a self-similar golden rectangle:",
            "   Suppose the ratio satisfies x = 1 + 1/x.",
            "   Then x² = x + 1  ⇒  x² − x − 1 = 0.",
            "   Solving gives x = (1 ± √5)/2. Take the positive root:",
            "     φ = (1 + √5)/2.",
            "",
            "2) Reciprocal identity:",
            "   From φ² = φ + 1, divide by φ:",
            "     φ = 1 + 1/φ  ⇒  1/φ = φ − 1.",
            "",
            "3) Continued fraction:",
            "   φ = 1 + 1/φ = 1 + 1/(1 + 1/φ) = 1 + 1/(1 + 1/(1 + …))",
            "   so φ = [1; 1, 1, 1, …].",
            "",
            "4) Fibonacci connection (limit + Binet):",
            "   Fibonacci numbers satisfy F_{n+1} = F_n + F_{n-1}.",
            "   If r_n = F_{n+1}/F_n, then r_n = 1 + 1/r_{n-1}.",
            "   If r_n approaches a limit r, it must satisfy r = 1 + 1/r, hence r = φ.",
            "   More precisely (Binet's formula):",
            f"     F_n = (φ^n − ψ^n)/√5  with ψ = (1 − √5)/2 ≈ {psi:.6f}.",
            "   Since |ψ| < 1, ψ^n → 0, so ratios approach φ quickly.",
        ]
    )


# ----------------------------
# Numeric approximations
# ----------------------------

def decimal_approximations_text() -> str:
    """
    A small set of commonly used decimal approximations of φ.

    These are useful in UI displays / quick reference, but should not be used as constants.
    """
    lines = [
        "Decimal approximations:",
        f"  φ ≈ {PHI:.10f}",
        f"  φ ≈ {PHI:.15f}",
        f"  1/φ ≈ {INV_PHI:.15f}",
        "",
        "Handy rationals (from convergents):",
        "  13/8 = 1.625",
        "  21/13 ≈ 1.615384615…",
        "  34/21 ≈ 1.619047619…",
        "  55/34 ≈ 1.617647058…",
    ]
    return "\n".join(lines)


def approximation_table_fibonacci_convergents(rows: int = 8) -> list[ApproximationRow]:
    """
    Approximate φ by continued-fraction convergents (ratios of consecutive Fibonacci numbers).

    Returns a list of ApproximationRow for n = 1..rows:
      value_n = F_{n+1}/F_n

    Error tends to shrink roughly geometrically; convergents alternate around φ.
    """
    conv = continued_fraction_convergents_phi(rows)
    out: list[ApproximationRow] = []
    for i, (p, q) in enumerate(conv, start=1):
        v = p / q
        out.append(ApproximationRow(n=i, label=f"F{i+1}/F{i} = {p}/{q}", value=v, abs_error=abs(v - PHI)))
    return out


def approximation_table_powers_of_inv_phi(rows: int = 6) -> list[ApproximationRow]:
    """
    Another simple numeric pattern:
      φ = 1 + 1/φ and 1/φ ≈ 0.618...

    This table lists partial sums of the geometric series:
      φ = 1 + (1/φ) + (1/φ)^2 + (1/φ)^3 + ...
    which converges because |1/φ| < 1.

    Specifically, S_k = sum_{j=0..k} (1/φ)^j approaches φ as k grows.
    """
    if rows <= 0:
        return []
    out: list[ApproximationRow] = []
    s = 0.0
    term = 1.0
    for k in range(rows):
        s += term
        out.append(
            ApproximationRow(
                n=k,
                label=f"Σ_{j=0..{k}} (1/φ)^j",
                value=s,
                abs_error=abs(s - PHI),
            )
        )
        term *= INV_PHI
    return out


# ----------------------------
# UI-ready “quick reference” block
# ----------------------------

def quick_reference_text(*, decimals: int = 15, convergents: int = 8) -> str:
    """
    Build a self-contained quick reference block suitable for the Reference tab.

    Args:
        decimals: Decimal places for φ and 1/φ.
        convergents: How many continued-fraction convergents to list.
    """
    fmt = f"{{:.{decimals}f}}"
    header = "Golden Ratio (φ) — Quick Reference"
    basics = "\n".join(
        [
            f"φ = (1 + √5)/2 ≈ {fmt.format(PHI)}",
            f"1/φ = φ − 1 ≈ {fmt.format(INV_PHI)}",
            "",
            "Continued fraction:",
            f"  {continued_fraction_phi()}",
        ]
    )

    conv_pairs = continued_fraction_convergents_phi(convergents)
    conv_lines = ["", f"First {len(conv_pairs)} convergents (p/q):"]
    for (p, q) in conv_pairs:
        conv_lines.append(f"  {p}/{q} = {p/q:.12f}")

    # A compact error note: for convergents of simple continued fractions,
    # |x - p/q| < 1/q^2. Mention as a rule of thumb.
    error_note = "\n".join(
        [
            "",
            "Rule of thumb (convergents):",
            "  If p/q is a continued-fraction convergent to a number x, then",
            "    |x − p/q| < 1/q².",
            "  For φ's convergents, q is a Fibonacci number, so accuracy improves fast.",
        ]
    )

    return "\n".join(
        [
            header,
            "",
            basics,
            "",
            identities_text(),
            "",
            derivations_text(),
            "\n".join(conv_lines),
            error_note,
            "",
            decimal_approximations_text(),
        ]
    )
```