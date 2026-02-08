```python
# src/phi_explorer/viz_spiral.py
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterable, Literal, Sequence

from matplotlib.axes import Axes
from matplotlib.patches import Arc, Rectangle

from phi_explorer.core.fibonacci import fibonacci_numbers

# ----------------------------
# Data models
# ----------------------------

Turn = Literal["CW", "CCW"]


@dataclass(frozen=True, slots=True)
class SquareSpec:
    """A single Fibonacci square in the tiling."""

    x: float
    y: float
    size: float
    n: int  # index in sequence (1-based)
    value: int  # Fibonacci number used for size


@dataclass(frozen=True, slots=True)
class QuarterArcSpec:
    """A quarter-circle arc that fits inside a corresponding square."""

    cx: float
    cy: float
    r: float
    theta1: float  # degrees
    theta2: float  # degrees
    n: int  # index in sequence (1-based)
    value: int  # Fibonacci number used for radius


@dataclass(frozen=True, slots=True)
class SpiralLayout:
    """Full layout: squares + their quarter-circle arcs."""

    squares: tuple[SquareSpec, ...]
    arcs: tuple[QuarterArcSpec, ...]


# ----------------------------
# Geometry helpers
# ----------------------------

def _rotate_cw(v: tuple[int, int]) -> tuple[int, int]:
    # (dx, dy) -> (dy, -dx)
    return (v[1], -v[0])


def _rotate_ccw(v: tuple[int, int]) -> tuple[int, int]:
    # (dx, dy) -> (-dy, dx)
    return (-v[1], v[0])


def _bounds_of_squares(squares: Sequence[SquareSpec]) -> tuple[float, float, float, float]:
    if not squares:
        return (0.0, 1.0, 0.0, 1.0)
    xmin = min(s.x for s in squares)
    ymin = min(s.y for s in squares)
    xmax = max(s.x + s.size for s in squares)
    ymax = max(s.y + s.size for s in squares)
    return xmin, xmax, ymin, ymax


# ----------------------------
# Layout generation
# ----------------------------

def fibonacci_square_tiling(
    *,
    terms: int = 10,
    scale: float = 1.0,
    turn: Turn = "CCW",
) -> SpiralLayout:
    """
    Build Fibonacci-square tiling + quarter-arc specs.

    The classic construction uses contiguous squares with side lengths
    1, 1, 2, 3, 5, ... and draws a quarter-circle arc in each square.
    The arcs together approximate the golden spiral.

    Parameters
    ----------
    terms:
        Number of Fibonacci squares to use (>= 1).
    scale:
        Multiplies all Fibonacci side lengths (useful to map to "base length A").
    turn:
        "CCW" or "CW" turning direction for the spiral.

    Returns
    -------
    SpiralLayout:
        squares: list of SquareSpec (x, y is lower-left).
        arcs: list of QuarterArcSpec (center, radius, angle span).
    """
    if terms < 1:
        raise ValueError("terms must be >= 1.")
    if not math.isfinite(scale) or scale <= 0:
        raise ValueError("scale must be a finite positive number.")
    if turn not in ("CW", "CCW"):
        raise ValueError("turn must be 'CW' or 'CCW'.")

    fib = fibonacci_numbers(terms)
    # Scale to float sizes
    sizes = [float(f) * float(scale) for f in fib]

    squares: list[SquareSpec] = []
    arcs: list[QuarterArcSpec] = []

    # Seed: first square at origin.
    # We'll grow the tiling by attaching the next square to the current
    # bounding rectangle on a rotating direction: +x, +y, -x, -y, ...
    xmin = 0.0
    ymin = 0.0
    xmax = sizes[0]
    ymax = sizes[0]

    squares.append(SquareSpec(x=0.0, y=0.0, size=sizes[0], n=1, value=fib[0]))

    # Initial growth direction: right (+x)
    dir_vec = (1, 0)

    for i in range(2, terms + 1):
        s = sizes[i - 1]
        dx, dy = dir_vec

        # Place next square adjacent to current bounding rectangle.
        if dx == 1 and dy == 0:  # attach on right
            x = xmax
            y = ymin
            xmax = xmax + s
        elif dx == 0 and dy == 1:  # attach on top
            x = xmin
            y = ymax
            ymax = ymax + s
        elif dx == -1 and dy == 0:  # attach on left
            x = xmin - s
            y = ymin
            xmin = xmin - s
        elif dx == 0 and dy == -1:  # attach on bottom
            x = xmin
            y = ymin - s
            ymin = ymin - s
        else:
            raise RuntimeError("Invalid direction vector.")

        squares.append(SquareSpec(x=x, y=y, size=s, n=i, value=fib[i - 1]))

        # Rotate direction for next attachment
        dir_vec = _rotate_ccw(dir_vec) if turn == "CCW" else _rotate_cw(dir_vec)

    # Arc orientation: choose a mapping from (dx,dy) direction of *growth*
    # to which corner is the arc center and what 90-degree span to draw.
    #
    # For CCW spiral, a commonly-used mapping (empirically consistent):
    #  - growth to +x: arc centered at bottom-left, from 0->90
    #  - growth to +y: arc centered at bottom-right, from 90->180
    #  - growth to -x: arc centered at top-right, from 180->270
    #  - growth to -y: arc centered at top-left, from 270->360
    #
    # For CW, reverse angle progression.
    #
    # We need a direction per square. Use the direction that was used to
    # *place* that square. For the first square, assume +x.
    place_dirs: list[tuple[int, int]] = [(1, 0)]
    d = (1, 0)
    for _ in range(2, terms + 1):
        place_dirs.append(d)
        d = _rotate_ccw(d) if turn == "CCW" else _rotate_cw(d)

    def arc_for_square(sq: SquareSpec, dxy: tuple[int, int]) -> QuarterArcSpec:
        dx, dy = dxy
        x, y, r = sq.x, sq.y, sq.size

        if turn == "CCW":
            if (dx, dy) == (1, 0):  # +x
                cx, cy = (x, y)
                th1, th2 = (0.0, 90.0)
            elif (dx, dy) == (0, 1):  # +y
                cx, cy = (x + r, y)
                th1, th2 = (90.0, 180.0)
            elif (dx, dy) == (-1, 0):  # -x
                cx, cy = (x + r, y + r)
                th1, th2 = (180.0, 270.0)
            elif (dx, dy) == (0, -1):  # -y
                cx, cy = (x, y + r)
                th1, th2 = (270.0, 360.0)
            else:
                raise RuntimeError("Invalid direction vector for arc mapping.")
        else:
            # CW: mirror in angle sense (swap start/end so arc goes "other way")
            if (dx, dy) == (1, 0):
                cx, cy = (x, y + r)
                th1, th2 = (270.0, 360.0)
            elif (dx, dy) == (0, -1):
                cx, cy = (x + r, y + r)
                th1, th2 = (180.0, 270.0)
            elif (dx, dy) == (-1, 0):
                cx, cy = (x + r, y)
                th1, th2 = (90.0, 180.0)
            elif (dx, dy) == (0, 1):
                cx, cy = (x, y)
                th1, th2 = (0.0, 90.0)
            else:
                raise RuntimeError("Invalid direction vector for arc mapping.")

        return QuarterArcSpec(cx=cx, cy=cy, r=r, theta1=th1, theta2=th2, n=sq.n, value=sq.value)

    for sq, dxy in zip(squares, place_dirs, strict=True):
        arcs.append(arc_for_square(sq, dxy))

    return SpiralLayout(squares=tuple(squares), arcs=tuple(arcs))


# ----------------------------
# Golden-spiral approximation overlay (log spiral)
# ----------------------------

def _arc_endpoints(arcs: Sequence[QuarterArcSpec]) -> list[tuple[float, float]]:
    """Return endpoints of each quarter-arc (start, end) concatenated."""
    pts: list[tuple[float, float]] = []
    for a in arcs:
        for th in (a.theta1, a.theta2):
            t = math.radians(th)
            pts.append((a.cx + a.r * math.cos(t), a.cy + a.r * math.sin(t)))
    return pts


def _fit_log_spiral_from_points(
    pts: Sequence[tuple[float, float]],
    *,
    center: tuple[float, float],
) -> tuple[float, float]:
    """
    Fit r = a * exp(b*theta) in least squares on (theta, ln r).
    Returns (a, b). Assumes points are spread in angle.
    """
    cx, cy = center
    data: list[tuple[float, float]] = []
    for x, y in pts:
        dx, dy = x - cx, y - cy
        r = math.hypot(dx, dy)
        if r <= 1e-12:
            continue
        theta = math.atan2(dy, dx)
        data.append((theta, math.log(r)))

    if len(data) < 2:
        return (1.0, 0.0)

    # Unwrap theta to be monotonic-ish:
    data.sort(key=lambda t: t[0])
    thetas = [t for t, _ in data]
    logs = [lr for _, lr in data]

    unwrapped = [thetas[0]]
    for k in range(1, len(thetas)):
        t = thetas[k]
        prev = unwrapped[-1]
        while t - prev > math.pi:
            t -= 2 * math.pi
        while t - prev < -math.pi:
            t += 2 * math.pi
        unwrapped.append(t)

    # Linear regression: log(r) = log(a) + b*theta
    n = len(unwrapped)
    mean_t = sum(unwrapped) / n
    mean_y = sum(logs) / n
    s_tt = sum((t - mean_t) ** 2 for t in unwrapped)
    if s_tt <= 1e-18:
        return (math.exp(mean_y), 0.0)
    s_ty = sum((t - mean_t) * (y - mean_y) for t, y in zip(unwrapped, logs))
    b = s_ty / s_tt
    loga = mean_y - b * mean_t
    return (math.exp(loga), b)


def sample_log_spiral(
    *,
    center: tuple[float, float],
    a: float,
    b: float,
    theta_min: float,
    theta_max: float,
    n: int = 600,
) -> tuple[list[float], list[float]]:
    """Sample a log spiral r=a*exp(b*theta) in Cartesian coordinates."""
    if n < 2:
        n = 2
    cx, cy = center
    xs: list[float] = []
    ys: list[float] = []
    for i in range(n):
        t = theta_min + (theta_max - theta_min) * (i / (n - 1))
        r = a * math.exp(b * t)
        xs.append(cx + r * math.cos(t))
        ys.append(cy + r * math.sin(t))
    return xs, ys


# ----------------------------
# Matplotlib drawing
# ----------------------------

def draw_fibonacci_spiral(
    ax: Axes,
    *,
    terms: int = 10,
    scale: float = 1.0,
    turn: Turn = "CCW",
    show_squares: bool = True,
    show_arcs: bool = True,
    show_phi_spiral: bool = True,
    show_labels: bool = False,
    guides: bool = True,
    square_edgecolor: str = "#333333",
    square_facecolor: str = "none",
    arc_color: str = "#d08c00",
    phi_color: str = "#2b6cb0",
    line_width: float = 2.0,
    alpha: float = 1.0,
) -> SpiralLayout:
    """
    Draw Fibonacci-square tiling and its spiral arcs into `ax`.

    Returns the computed layout so callers can reuse bounds or data.
    """
    layout = fibonacci_square_tiling(terms=terms, scale=scale, turn=turn)

    if show_squares:
        for sq in layout.squares:
            ax.add_patch(
                Rectangle(
                    (sq.x, sq.y),
                    sq.size,
                    sq.size,
                    fill=(square_facecolor != "none"),
                    facecolor=square_facecolor if square_facecolor != "none" else "none",
                    edgecolor=square_edgecolor,
                    linewidth=max(0.5, float(line_width) * 0.8),
                    alpha=alpha,
                )
            )
            if show_labels:
                ax.text(
                    sq.x + 0.5 * sq.size,
                    sq.y + 0.5 * sq.size,
                    f"{sq.value}",
                    ha="center",
                    va="center",
                    fontsize=9,
                    color=square_edgecolor,
                    alpha=0.9,
                )

    if show_arcs:
        for a in layout.arcs:
            ax.add_patch(
                Arc(
                    (a.cx, a.cy),
                    2 * a.r,
                    2 * a.r,
                    angle=0.0,
                    theta1=a.theta1,
                    theta2=a.theta2,
                    color=arc_color,
                    linewidth=float(line_width),
                    alpha=alpha,
                )
            )

    if show_phi_spiral:
        # Approximate a golden spiral by fitting a log spiral to the arc endpoints,
        # using the center of the smallest square's arc as a reasonable origin.
        c = (layout.arcs[0].cx, layout.arcs[0].cy)
        pts = _arc_endpoints(layout.arcs)
        a_fit, b_fit = _fit_log_spiral_from_points(pts, center=c)

        # Determine angle span from endpoints relative to center.
        angs = [math.atan2(y - c[1], x - c[0]) for x, y in pts]
        if angs:
            tmin, tmax = min(angs), max(angs)
            # Expand a bit for visual continuity
            pad = 0.15 * (tmax - tmin + 1e-9)
            tmin -= pad
            tmax += pad
        else:
            tmin, tmax = -2 * math.pi, 2 * math.pi

        xs, ys = sample_log_spiral(center=c, a=a_fit, b=b_fit, theta_min=tmin, theta_max=tmax, n=800)
        ax.plot(xs, ys, color=phi_color, linewidth=max(1.0, float(line_width) * 0.9), alpha=0.85)

    xmin, xmax, ymin, ymax = _bounds_of_squares(layout.squares)
    w = xmax - xmin
    h = ymax - ymin
    pad = 0.05 * max(w, h, 1e-9)
    ax.set_xlim(xmin - pad, xmax + pad)
    ax.set_ylim(ymin - pad, ymax + pad)
    ax.set_aspect("equal", adjustable="box")

    if guides:
        ax.grid(True, linewidth=0.5, alpha=0.25)
    else:
        ax.grid(False)

    ax.set_xlabel("")
    ax.set_ylabel("")
    return layout
```