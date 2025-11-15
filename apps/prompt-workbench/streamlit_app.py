"""
Streamlit Prompt Workbench
--------------------------

Interactive UI for analysts and operators to browse prompts exposed by
`services/prompt-api`, render blocks with sample variables, and run full LLM
generations via `/api/generate`. This replaces the standalone PromptService
Streamlit app so every action flows through the unified Prompt API + registry.
"""

from __future__ import annotations

import datetime
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Tuple

import requests
import streamlit as st

DEFAULT_API = "http://localhost:5050"
API_BASE = os.environ.get("PROMPT_API_BASE", DEFAULT_API).rstrip("/")
FALLBACK_PROMPTS = Path(__file__).resolve().parents[1] / "prompt-hub" / "prompt-library.starter.json"


@st.cache_data(show_spinner=False, ttl=60)
def load_prompt_catalog() -> List[Dict[str, Any]]:
    """
    Fetch prompts from the Prompt API (fallback to starter JSON if offline).
    """

    if API_BASE:
        try:
            response = requests.get(f"{API_BASE}/prompts", timeout=15)
            response.raise_for_status()
            payload = response.json()
            if isinstance(payload, list):
                return payload
        except Exception as exc:  # pragma: no cover - UI degrade path
            st.warning(f"Failed to load prompts from API ({exc}); falling back to starter library.")

    if FALLBACK_PROMPTS.exists():
        return json.loads(FALLBACK_PROMPTS.read_text(encoding="utf-8"))

    return []


def load_prompt(prompt_id: str, prompts: List[Dict[str, Any]]) -> Dict[str, Any]:
    for prompt in prompts:
        if prompt.get("id") == prompt_id:
            return prompt
    raise ValueError(f"Prompt '{prompt_id}' not found.")  # pragma: no cover - guarded by UI


def render_prompt(prompt_id: str, variables: Dict[str, Any]) -> Dict[str, Any]:
    response = requests.post(
        f"{API_BASE}/prompts/render",
        json={"prompt_id": prompt_id, "variables": variables},
        timeout=60,
    )
    response.raise_for_status()
    return response.json()


def run_generation(payload: Dict[str, Any]) -> Dict[str, Any]:
    response = requests.post(f"{API_BASE}/api/generate", json=payload, timeout=120)
    response.raise_for_status()
    return response.json()


def format_option(prompt: Dict[str, Any]) -> str:
    title = prompt.get("title") or prompt.get("id", "prompt")
    category = prompt.get("category") or prompt.get("context")
    return f"{title} ({prompt.get('id')})" + (f" · {category}" if category else "")


def build_variable_inputs(prompt: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    inputs: Dict[str, Any] = {}
    defaults: Dict[str, Any] = {}
    variables = prompt.get("variables") or []
    for variable in variables:
        name = variable.get("name", "value")
        var_type = (variable.get("type") or "string").lower()
        default_value = variable.get("default") or ""
        label = variable.get("label") or name
        description = variable.get("description")
        if var_type in {"number", "integer"}:
            value = st.number_input(
                label,
                value=float(default_value) if str(default_value).isdigit() else 0.0,
                key=f"var-{name}",
            )
        elif var_type in {"boolean", "bool"}:
            value = st.checkbox(label, value=str(default_value).lower() in {"true", "1"}, key=f"var-{name}")
        else:
            value = st.text_input(label, value=str(default_value), key=f"var-{name}")
        if description:
            st.caption(description)
        inputs[name] = value
        defaults[name] = default_value
    return inputs, defaults


def main() -> None:
    st.set_page_config(page_title="Prompt Workbench", layout="wide")
    st.title("AI Prompt Workbench")
    st.caption("Interactive UI backed by services/prompt-api + prompt-registry")

    prompts = load_prompt_catalog()
    if not prompts:
        st.error("Unable to load prompts from the API or starter library.")
        st.stop()

    prompt_map = {prompt.get("id", str(index)): prompt for index, prompt in enumerate(prompts)}
    options = sorted(prompt_map.values(), key=lambda item: item.get("title") or item.get("id"))
    label_to_id = {format_option(prompt): prompt.get("id") for prompt in options if prompt.get("id")}
    selection = st.selectbox("Select a prompt", list(label_to_id.keys()))
    active_prompt = load_prompt(label_to_id[selection], prompts)

    meta_col, block_col = st.columns([1, 2])
    with meta_col:
        st.subheader("Metadata")
        st.write(f"**Prompt Id:** `{active_prompt.get('id')}`")
        st.write(f"**Category:** {active_prompt.get('category') or '—'}")
        st.write(f"**Context:** {active_prompt.get('context') or '—'}")
        telemetry = active_prompt.get("tags") or []
        if telemetry:
            st.write("**Tags:** " + ", ".join(telemetry))
        orchestration = (
            (active_prompt.get("integrations") or {}).get("orchestration") or {}
        )
        st.write(f"**Review Policy:** {orchestration.get('review_policy', 'manual')}")

    with block_col:
        st.subheader("Prompt Blocks")
        blocks = active_prompt.get("prompt") or {}
        st.code(blocks.get("system") or "", language="markdown")
        st.code(blocks.get("instructions") or "", language="markdown")
        if blocks.get("constraints"):
            st.code(blocks["constraints"], language="markdown")
        if blocks.get("style"):
            st.code(blocks["style"], language="markdown")

    st.divider()
    st.subheader("Inputs")
    col_left, col_right = st.columns(2)
    with col_left:
        role = st.text_input("Role", active_prompt.get("context") or "Operator")
        task = st.text_input("Task / Objective", "Describe the latest KPI performance summary.")
        environment = st.selectbox("Environment", ["Prod", "Lab", "QA"], index=0)
        audience = st.multiselect(
            "Audience",
            ["Executives", "NOC Engineers", "Ops Managers", "Tier 3"],
            default=["Executives", "Ops Managers"],
        )
    with col_right:
        log_snippet = st.text_area("Input Data (log snippet)", height=120)
        timestamp = st.text_input(
            "Timestamp",
            datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        )
        model = st.text_input("Model override (optional)", "")

    st.markdown("##### Prompt Variables")
    variable_inputs, _ = build_variable_inputs(active_prompt)

    preview_col, run_col = st.columns([1, 1])

    if API_BASE:
        if preview_col.button("Preview rendered blocks", use_container_width=True):
            try:
                rendered = render_prompt(active_prompt["id"], variable_inputs)
                st.success("Blocks rendered successfully.")
                st.json(rendered)
                st.session_state["rendered_prompt"] = rendered
            except Exception as exc:
                st.error(f"Render failed: {exc}")

        if run_col.button("Generate via Prompt API", use_container_width=True):
            payload = {
                "template_id": active_prompt["id"],
                "role": role,
                "task": task,
                "context": {"environment": environment, "audience": audience},
                "input_data": {"log_snippet": log_snippet, "timestamp": timestamp},
                "desired_output": ["executive_summary", "technical_json", "chart_recommendations"],
                "modes": ["exec", "engineer"],
                "variables": variable_inputs,
            }
            if model.strip():
                payload["model"] = model.strip()
            try:
                response = run_generation(payload)
                st.success(f"Generation complete (cache={response.get('cached')}). audit_id={response.get('audit_id')}")
                st.json(response.get("output"))
            except requests.HTTPError as http_error:
                message = getattr(http_error.response, "text", str(http_error))
                st.error(f"API error: {message}")
            except Exception as exc:
                st.error(f"Generation failed: {exc}")
    else:
        st.warning("Set PROMPT_API_BASE or VITE_API_BASE before previewing or running prompts.")

    st.sidebar.markdown("### Connection")
    st.sidebar.write(f"API Base: `{API_BASE or 'Not configured'}`")
    if API_BASE:
        st.sidebar.success("Connected to Prompt API")
    else:
        st.sidebar.error("Prompt API base URL missing.")


if __name__ == "__main__":
    main()
