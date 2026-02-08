```python
# src/phi_explorer/ui.py
from __future__ import annotations

import tkinter as tk
from tkinter import ttk


class PhiExplorerUI(ttk.Frame):
    """
    Main UI layout for the Golden Ratio (φ) Explorer.

    Layout goals:
      - Single window with a ttk.Notebook (4 tabs)
      - Each visualization tab uses a left controls panel + right display panel
      - Calculator tab uses a compact form + results panel
      - References tab uses a scrollable text panel

    This file focuses on UI *layout*. Hook your math/plot logic via the
    callback stubs (e.g., _on_apply_a, _update_*).
    """

    def __init__(self, master: tk.Misc):
        super().__init__(master)
        self.pack(fill="both", expand=True)

        # ---- Shared state-ish Tk variables (wiring can be swapped to AppState later) ----
        self.a_var = tk.StringVar(value="1.0")         # base length A
        self.decimals_var = tk.IntVar(value=12)        # numeric formatting
        self.show_guides_var = tk.BooleanVar(value=True)
        self.line_width_var = tk.DoubleVar(value=2.0)
        self.fib_terms_var = tk.IntVar(value=10)

        # ---- Top-level container ----
        self._build_notebook()

    # =========================================================================
    # Notebook / Tabs
    # =========================================================================

    def _build_notebook(self) -> None:
        self.rowconfigure(0, weight=1)
        self.columnconfigure(0, weight=1)

        self.notebook = ttk.Notebook(self)
        self.notebook.grid(row=0, column=0, sticky="nsew")

        self.tab_calc = self._build_calculator_tab(self.notebook)
        self.tab_rect = self._build_golden_rectangle_tab(self.notebook)
        self.tab_spiral = self._build_spiral_tab(self.notebook)
        self.tab_refs = self._build_references_tab(self.notebook)

        self.notebook.add(self.tab_calc, text="Calculator")
        self.notebook.add(self.tab_rect, text="Golden Rectangle")
        self.notebook.add(self.tab_spiral, text="Spiral")
        self.notebook.add(self.tab_refs, text="References")

    # =========================================================================
    # Shared small widgets
    # =========================================================================

    def _shared_a_controls(self, parent: tk.Misc) -> ttk.LabelFrame:
        """
        A small, reusable control group used on visualization tabs.

        Contains:
          - Entry for A
          - Apply button
          - Formatting options (decimals)
        """
        lf = ttk.LabelFrame(parent, text="Base length")
        lf.columnconfigure(1, weight=1)

        ttk.Label(lf, text="A:").grid(row=0, column=0, sticky="w", padx=8, pady=(8, 4))
        a_entry = ttk.Entry(lf, textvariable=self.a_var, width=16)
        a_entry.grid(row=0, column=1, sticky="ew", padx=8, pady=(8, 4))

        ttk.Button(lf, text="Apply", command=self._on_apply_a).grid(
            row=0, column=2, sticky="e", padx=8, pady=(8, 4)
        )

        ttk.Label(lf, text="Decimals:").grid(row=1, column=0, sticky="w", padx=8, pady=(4, 8))
        dec_spin = ttk.Spinbox(
            lf, from_=0, to=18, textvariable=self.decimals_var, width=6, command=self._on_format_change
        )
        dec_spin.grid(row=1, column=1, sticky="w", padx=8, pady=(4, 8))

        return lf

    def _viz_style_controls(self, parent: tk.Misc) -> ttk.LabelFrame:
        """Common visualization styling controls."""
        lf = ttk.LabelFrame(parent, text="Display")
        lf.columnconfigure(1, weight=1)

        ttk.Checkbutton(
            lf, text="Show guides", variable=self.show_guides_var, command=self._on_style_change
        ).grid(row=0, column=0, columnspan=2, sticky="w", padx=8, pady=(8, 4))

        ttk.Label(lf, text="Line width:").grid(row=1, column=0, sticky="w", padx=8, pady=(4, 8))
        lw = ttk.Scale(lf, from_=0.5, to=6.0, variable=self.line_width_var, command=lambda _v: self._on_style_change())
        lw.grid(row=1, column=1, sticky="ew", padx=8, pady=(4, 8))

        return lf

    # =========================================================================
    # Calculator tab
    # =========================================================================

    def _build_calculator_tab(self, master: tk.Misc) -> ttk.Frame:
        tab = ttk.Frame(master)
        tab.columnconfigure(0, weight=1)
        tab.rowconfigure(1, weight=1)

        header = ttk.Frame(tab)
        header.grid(row=0, column=0, sticky="ew", padx=10, pady=(10, 6))
        header.columnconfigure(1, weight=1)

        ttk.Label(header, text="Base length A:").grid(row=0, column=0, sticky="w")
        ttk.Entry(header, textvariable=self.a_var).grid(row=0, column=1, sticky="ew", padx=(8, 8))
        ttk.Button(header, text="Compute", command=self._update_calculator).grid(row=0, column=2, sticky="e")

        # Results area
        body = ttk.Frame(tab)
        body.grid(row=1, column=0, sticky="nsew", padx=10, pady=(6, 10))
        body.columnconfigure(0, weight=1)

        results = ttk.LabelFrame(body, text="Results")
        results.grid(row=0, column=0, sticky="ew")
        results.columnconfigure(1, weight=1)

        self.calc_phi_var = tk.StringVar(value="—")
        self.calc_mul_var = tk.StringVar(value="—")
        self.calc_div_var = tk.StringVar(value="—")
        self.calc_msg_var = tk.StringVar(value="")

        ttk.Label(results, text="φ:").grid(row=0, column=0, sticky="w", padx=8, pady=(8, 4))
        ttk.Label(results, textvariable=self.calc_phi_var).grid(row=0, column=1, sticky="w", padx=8, pady=(8, 4))

        ttk.Label(results, text="A · φ:").grid(row=1, column=0, sticky="w", padx=8, pady=4)
        ttk.Label(results, textvariable=self.calc_mul_var).grid(row=1, column=1, sticky="w", padx=8, pady=4)

        ttk.Label(results, text="A / φ:").grid(row=2, column=0, sticky="w", padx=8, pady=4)
        ttk.Label(results, textvariable=self.calc_div_var).grid(row=2, column=1, sticky="w", padx=8, pady=4)

        ttk.Label(body, textvariable=self.calc_msg_var, foreground="#aa0000").grid(
            row=1, column=0, sticky="w", pady=(8, 0)
        )

        # Initial compute (layout-only; safe even if stub)
        self._update_calculator()
        return tab

    # =========================================================================
    # Golden Rectangle tab
    # =========================================================================

    def _build_golden_rectangle_tab(self, master: tk.Misc) -> ttk.Frame:
        tab = ttk.Frame(master)
        tab.rowconfigure(0, weight=1)
        tab.columnconfigure(0, weight=1)

        paned = ttk.Panedwindow(tab, orient="horizontal")
        paned.grid(row=0, column=0, sticky="nsew", padx=10, pady=10)

        controls = ttk.Frame(paned)
        controls.columnconfigure(0, weight=1)

        self._shared_a_controls(controls).grid(row=0, column=0, sticky="ew", pady=(0, 10))
        self._viz_style_controls(controls).grid(row=1, column=0, sticky="ew", pady=(0, 10))

        rect_opts = ttk.LabelFrame(controls, text="Golden rectangle")
        rect_opts.columnconfigure(0, weight=1)
        rect_opts.grid(row=2, column=0, sticky="ew")

        ttk.Button(rect_opts, text="Redraw", command=self._update_golden_rectangle).grid(
            row=0, column=0, sticky="ew", padx=8, pady=8
        )

        display = ttk.Frame(paned)
        display.rowconfigure(0, weight=1)
        display.columnconfigure(0, weight=1)

        canvas_holder = ttk.LabelFrame(display, text="Visualization")
        canvas_holder.grid(row=0, column=0, sticky="nsew")
        canvas_holder.rowconfigure(0, weight=1)
        canvas_holder.columnconfigure(0, weight=1)

        # Placeholder where a Matplotlib canvas or Tk Canvas can be embedded.
        self.rect_display = ttk.Frame(canvas_holder)
        self.rect_display.grid(row=0, column=0, sticky="nsew", padx=6, pady=6)
        ttk.Label(self.rect_display, text="(Golden rectangle drawing canvas goes here)").pack(
            anchor="center", expand=True
        )

        paned.add(controls, weight=1)
        paned.add(display, weight=3)
        return tab

    # =========================================================================
    # Spiral tab
    # =========================================================================

    def _build_spiral_tab(self, master: tk.Misc) -> ttk.Frame:
        tab = ttk.Frame(master)
        tab.rowconfigure(0, weight=1)
        tab.columnconfigure(0, weight=1)

        paned = ttk.Panedwindow(tab, orient="horizontal")
        paned.grid(row=0, column=0, sticky="nsew", padx=10, pady=10)

        controls = ttk.Frame(paned)
        controls.columnconfigure(0, weight=1)

        self._shared_a_controls(controls).grid(row=0, column=0, sticky="ew", pady=(0, 10))
        self._viz_style_controls(controls).grid(row=1, column=0, sticky="ew", pady=(0, 10))

        spiral_opts = ttk.LabelFrame(controls, text="Fibonacci spiral")
        spiral_opts.columnconfigure(1, weight=1)
        spiral_opts.grid(row=2, column=0, sticky="ew")

        ttk.Label(spiral_opts, text="Terms (squares/arcs):").grid(
            row=0, column=0, sticky="w", padx=8, pady=(8, 4)
        )
        ttk.Spinbox(
            spiral_opts, from_=1, to=50, textvariable=self.fib_terms_var, width=6, command=self._on_spiral_settings
        ).grid(row=0, column=1, sticky="w", padx=8, pady=(8, 4))

        ttk.Button(spiral_opts, text="Redraw", command=self._update_spiral).grid(
            row=1, column=0, columnspan=2, sticky="ew", padx=8, pady=(4, 8)
        )

        display = ttk.Frame(paned)
        display.rowconfigure(0, weight=1)
        display.columnconfigure(0, weight=1)

        canvas_holder = ttk.LabelFrame(display, text="Visualization")
        canvas_holder.grid(row=0, column=0, sticky="nsew")
        canvas_holder.rowconfigure(0, weight=1)
        canvas_holder.columnconfigure(0, weight=1)

        self.spiral_display = ttk.Frame(canvas_holder)
        self.spiral_display.grid(row=0, column=0, sticky="nsew", padx=6, pady=6)
        ttk.Label(self.spiral_display, text="(Spiral drawing canvas goes here)").pack(
            anchor="center", expand=True
        )

        paned.add(controls, weight=1)
        paned.add(display, weight=3)
        return tab

    # =========================================================================
    # References tab
    # =========================================================================

    def _build_references_tab(self, master: tk.Misc) -> ttk.Frame:
        tab = ttk.Frame(master)
        tab.rowconfigure(0, weight=1)
        tab.columnconfigure(0, weight=1)

        holder = ttk.Frame(tab)
        holder.grid(row=0, column=0, sticky="nsew", padx=10, pady=10)
        holder.rowconfigure(0, weight=1)
        holder.columnconfigure(0, weight=1)

        # Scrollable Text
        text = tk.Text(holder, wrap="word")
        vsb = ttk.Scrollbar(holder, orient="vertical", command=text.yview)
        text.configure(yscrollcommand=vsb.set)

        text.grid(row=0, column=0, sticky="nsew")
        vsb.grid(row=0, column=1, sticky="ns")

        self.refs_text = text
        self._populate_references()
        self.refs_text.configure(state="disabled")
        return tab

    def _populate_references(self) -> None:
        self.refs_text.configure(state="normal")
        self.refs_text.delete("1.0", "end")
        self.refs_text.insert(
            "1.0",
            "Golden Ratio (φ) Quick Reference\n\n"
            "Definition:\n"
            "  φ = (1 + √5) / 2 ≈ 1.618033988749...\n\n"
            "Continued fraction:\n"
            "  φ = [1; 1, 1, 1, ...]\n\n"
            "Algebraic identities:\n"
            "  φ² = φ + 1\n"
            "  1/φ = φ − 1\n\n"
            "Fibonacci relationship:\n"
            "  limₙ→∞ Fₙ₊₁ / Fₙ = φ\n"
        )
        self.refs_text.configure(state="disabled")

    # =========================================================================
    # Callback stubs (wire to core logic elsewhere)
    # =========================================================================

    def _on_apply_a(self) -> None:
        # Validate/propagate A, then redraw the active tab’s visualization.
        # (Layout-only stub)
        self._update_calculator()
        self._update_golden_rectangle()
        self._update_spiral()

    def _on_format_change(self) -> None:
        self._update_calculator()

    def _on_style_change(self) -> None:
        self._update_golden_rectangle()
        self._update_spiral()

    def _on_spiral_settings(self) -> None:
        self._update_spiral()

    def _update_calculator(self) -> None:
        # Layout-only stub: show that fields exist; actual math can be wired in later.
        self.calc_phi_var.set("1.618033988749...")
        self.calc_mul_var.set("—")
        self.calc_div_var.set("—")
        self.calc_msg_var.set("")

    def _update_golden_rectangle(self) -> None:
        # Layout-only stub
        pass

    def _update_spiral(self) -> None:
        # Layout-only stub
        pass


def run() -> None:
    root = tk.Tk()
    root.title("Golden Ratio (φ) Explorer")
    root.minsize(900, 650)

    # Optional: use ttk theme defaults
    ttk.Style().theme_use(ttk.Style().theme_use())

    PhiExplorerUI(root)
    root.mainloop()


if __name__ == "__main__":
    run()
```