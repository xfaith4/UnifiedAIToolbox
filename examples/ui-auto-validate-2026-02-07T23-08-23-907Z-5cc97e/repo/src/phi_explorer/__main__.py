```python
# src/phi_explorer/__main__.py
from __future__ import annotations

import math
import os
import sys
import tkinter as tk
from tkinter import ttk

# Offline-friendly / deterministic Matplotlib setup:
# - force a local GUI backend (TkAgg) unless explicitly overridden
# - do not rely on any external style downloads or fonts
os.environ.setdefault("MPLBACKEND", "TkAgg")

from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg  # noqa: E402
from matplotlib.figure import Figure  # noqa: E402

from phi_explorer.core.phi_math import INV_PHI, PHI  # noqa: E402
from phi_explorer.references import quick_reference_text  # noqa: E402
from phi_explorer.ui import PhiExplorerUI  # noqa: E402
from phi_explorer.viz_golden_rectangle import draw_golden_rectangle_splits  # noqa: E402
from phi_explorer.viz_spiral import draw_fibonacci_spiral  # noqa: E402


def _set_ttk_defaults(root: tk.Tk) -> None:
    """Apply conservative ttk defaults (offline, cross-platform)."""
    style = ttk.Style(root)
    # Pick a reasonable theme if available.
    for candidate in ("clam", "vista", "aqua", "default"):
        if candidate in style.theme_names():
            try:
                style.theme_use(candidate)
                break
            except tk.TclError:
                continue

    # Small spacing improvements; keep minimal to avoid platform quirks.
    try:
        style.configure("TFrame", padding=0)
        style.configure("TLabelFrame", padding=6)
        style.configure("TButton", padding=(10, 4))
    except tk.TclError:
        pass


def _parse_positive_float(s: str, *, name: str = "value") -> float:
    try:
        v = float(s.strip())
    except Exception as e:  # noqa: BLE001
        raise ValueError(f"{name} must be a number.") from e
    if not math.isfinite(v):
        raise ValueError(f"{name} must be finite.")
    if v <= 0:
        raise ValueError(f"{name} must be > 0.")
    return v


def _clamp_int(v: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, int(v)))


def _fmt(x: float, decimals: int) -> str:
    decimals = _clamp_int(decimals, 0, 18)
    return f"{x:.{decimals}f}"


class PhiExplorerApp:
    """Glue code: wire UI callbacks to math + Matplotlib visualizations."""

    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.ui = PhiExplorerUI(root)

        # --- Matplotlib figures/canvases embedded into UI placeholder frames ---
        self._build_rect_canvas()
        self._build_spiral_canvas()

        # --- Wire callback stubs to real handlers ---
        # UI layout defines these as methods; we overwrite them with bound callables.
        self.ui._on_apply_a = self.on_apply_a  # type: ignore[attr-defined]
        self.ui._on_format_change = self.on_format_change  # type: ignore[attr-defined]
        self.ui._on_style_change = self.on_style_change  # type: ignore[attr-defined]
        self.ui._update_calculator = self.update_calculator  # type: ignore[attr-defined]
        self.ui._update_golden_rectangle = self.update_golden_rectangle  # type: ignore[attr-defined]
        self.ui._update_spiral = self.update_spiral  # type: ignore[attr-defined]
        self.ui._update_references = self.update_references  # type: ignore[attr-defined]

        # Redraw on tab change (helps when canvases first become visible)
        self.ui.notebook.bind("<<NotebookTabChanged>>", self._on_tab_changed)

        # Initial population
        self.update_calculator()
        self.update_golden_rectangle()
        self.update_spiral()
        self.update_references()

    # ---------------------------------------------------------------------
    # Canvas build helpers
    # ---------------------------------------------------------------------

    def _build_rect_canvas(self) -> None:
        holder = self.ui.rect_display
        self.rect_fig = Figure(figsize=(5, 4), dpi=100)
        self.rect_ax = self.rect_fig.add_subplot(111)
        self.rect_canvas = FigureCanvasTkAgg(self.rect_fig, master=holder)
        self.rect_canvas.get_tk_widget().pack(fill="both", expand=True)
        self.rect_fig.tight_layout()

        # Redraw when the widget resizes
        self.rect_canvas.get_tk_widget().bind("<Configure>", lambda _e: self._safe_draw(self.rect_canvas))

    def _build_spiral_canvas(self) -> None:
        holder = self.ui.spiral_display
        self.spiral_fig = Figure(figsize=(5, 4), dpi=100)
        self.spiral_ax = self.spiral_fig.add_subplot(111)
        self.spiral_canvas = FigureCanvasTkAgg(self.spiral_fig, master=holder)
        self.spiral_canvas.get_tk_widget().pack(fill="both", expand=True)
        self.spiral_fig.tight_layout()

        self.spiral_canvas.get_tk_widget().bind("<Configure>", lambda _e: self._safe_draw(self.spiral_canvas))

    @staticmethod
    def _safe_draw(canvas: FigureCanvasTkAgg) -> None:
        try:
            canvas.draw_idle()
        except Exception:
            # Avoid crashing on transient resize issues.
            pass

    # ---------------------------------------------------------------------
    # Shared state actions
    # ---------------------------------------------------------------------

    def _get_a(self) -> float:
        return _parse_positive_float(self.ui.a_var.get(), name="A")

    def on_apply_a(self) -> None:
        # Apply triggers all relevant updates.
        self.update_calculator()
        self.update_golden_rectangle()
        self.update_spiral()
        self.update_references()

    def on_format_change(self) -> None:
        self.update_calculator()
        self.update_references()

    def on_style_change(self) -> None:
        self.update_golden_rectangle()
        self.update_spiral()

    def _on_tab_changed(self, _event: tk.Event) -> None:
        # Ensure correct draws when switching tabs.
        tab_text = self.ui.notebook.tab(self.ui.notebook.select(), "text")
        if tab_text == "Golden Rectangle":
            self.update_golden_rectangle()
        elif tab_text == "Spiral":
            self.update_spiral()
        elif tab_text == "References":
            self.update_references()
        elif tab_text == "Calculator":
            self.update_calculator()

    # ---------------------------------------------------------------------
    # Calculator
    # ---------------------------------------------------------------------

    def update_calculator(self) -> None:
        decimals = _clamp_int(int(self.ui.decimals_var.get()), 0, 18)
        self.ui.calc_msg_var.set("")
        self.ui.calc_phi_var.set(_fmt(PHI, decimals))

        try:
            a = self._get_a()
        except ValueError as e:
            self.ui.calc_mul_var.set("—")
            self.ui.calc_div_var.set("—")
            self.ui.calc_msg_var.set(str(e))
            return

        self.ui.calc_mul_var.set(_fmt(a * PHI, decimals))
        self.ui.calc_div_var.set(_fmt(a * INV_PHI, decimals))

    # ---------------------------------------------------------------------
    # Golden rectangle visualization
    # ---------------------------------------------------------------------

    def update_golden_rectangle(self) -> None:
        # Respect style controls.
        show_guides = bool(self.ui.show_guides_var.get())
        line_width = float(self.ui.line_width_var.get())

        # Use A as the *short side* in our viz module (simple mental model).
        try:
            a = self._get_a()
        except ValueError:
            # If invalid, just clear the axes and show note
            self.rect_ax.clear()
            self.rect_ax.text(0.5, 0.5, "Enter a valid A > 0", ha="center", va="center", transform=self.rect_ax.transAxes)
            self.rect_ax.set_axis_off()
            self.rect_canvas.draw_idle()
            return

        # Draw
        try:
            draw_golden_rectangle_splits(
                self.rect_ax,
                short_side=a,
                steps=8,
                orientation="right",
                show_guides=show_guides,
                show_labels=True,
                line_width=max(0.5, line_width),
            )
        except Exception as e:  # noqa: BLE001
            self.rect_ax.clear()
            self.rect_ax.text(0.5, 0.5, f"Draw error:\n{e}", ha="center", va="center", transform=self.rect_ax.transAxes)
            self.rect_ax.set_axis_off()

        self.rect_fig.tight_layout()
        self.rect_canvas.draw_idle()

    # ---------------------------------------------------------------------
    # Spiral visualization
    # ---------------------------------------------------------------------

    def update_spiral(self) -> None:
        show_guides = bool(self.ui.show_guides_var.get())
        line_width = float(self.ui.line_width_var.get())

        # In this viz, interpret A as "unit" (scale of the Fibonacci squares).
        try:
            unit = self._get_a()
        except ValueError:
            self.spiral_ax.clear()
            self.spiral_ax.text(0.5, 0.5, "Enter a valid A > 0", ha="center", va="center", transform=self.spiral_ax.transAxes)
            self.spiral_ax.set_axis_off()
            self.spiral_canvas.draw_idle()
            return

        try:
            terms = _clamp_int(int(self.ui.fib_terms_var.get()), 1, 30)
        except Exception:
            terms = 10

        self.spiral_ax.clear()
        try:
            draw_fibonacci_spiral(
                self.spiral_ax,
                terms=terms,
                unit=unit,
                origin=(0.0, 0.0),
                show_squares=True,
                show_spiral=True,
                show_guides=show_guides,
                line_width=max(0.5, line_width),
                arc_samples=90,
            )
        except Exception as e:  # noqa: BLE001
            self.spiral_ax.clear()
            self.spiral_ax.text(0.5, 0.5, f"Draw error:\n{e}", ha="center", va="center", transform=self.spiral_ax.transAxes)
            self.spiral_ax.set_axis_off()

        self.spiral_fig.tight_layout()
        self.spiral_canvas.draw_idle()

    # ---------------------------------------------------------------------
    # References tab
    # ---------------------------------------------------------------------

    def update_references(self) -> None:
        decimals = _clamp_int(int(self.ui.decimals_var.get()), 0, 18)
        text = quick_reference_text(decimals=max(6, decimals), convergents=10)

        # UI layout file expected a Text widget; handle either direct widget or a container.
        # We search common attribute names set by the layout code.
        tw = getattr(self.ui, "refs_text", None)
        if tw is None:
            # Fall back: try to find the first tk.Text descendant in the references display frame.
            tw = self._find_text_widget(self.ui.refs_display)

        if isinstance(tw, tk.Text):
            tw.configure(state="normal")
            tw.delete("1.0", "end")
            tw.insert("1.0", text)
            tw.configure(state="disabled")

    @staticmethod
    def _find_text_widget(parent: tk.Misc) -> tk.Text | None:
        try:
            for child in parent.winfo_children():
                if isinstance(child, tk.Text):
                    return child
                sub = PhiExplorerApp._find_text_widget(child)
                if sub is not None:
                    return sub
        except Exception:
            return None
        return None


def main(argv: list[str] | None = None) -> int:
    _ = argv or sys.argv[1:]

    root = tk.Tk()
    root.title("Golden Ratio (φ) Explorer")
    root.minsize(900, 600)

    _set_ttk_defaults(root)

    # Ensure keyboard focus starts reasonably.
    try:
        root.option_add("*tearOff", False)
    except Exception:
        pass

    PhiExplorerApp(root)
    root.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```