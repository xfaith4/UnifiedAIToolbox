### BEGIN FILE: streamlit_app.py
import os, json, requests, datetime # pyright: ignore[reportMissingModuleSource]
import streamlit as st # pyright: ignore[reportMissingImports]

API_URL = os.environ.get("WORKBENCH_API", "http://localhost:8000")

st.set_page_config(page_title="AI Prompt Workbench", layout="wide")
st.title("AI Prompt Workbench")

with st.sidebar:
    st.markdown("**Settings**")
    template_id = st.text_input("Template Id", "agent_webrtc_disconnect_v1.0.0")
    model = st.text_input("Model (optional)", "")
    st.markdown("---")
    st.caption("API: " + API_URL)

# --- Input Controls ----------------------------------------------------------
colA, colB, colC = st.columns(3)
with colA:
    environment = st.selectbox("Environment", ["Prod", "Lab", "QA"], index=0)
with colB:
    audience = st.multiselect("Audience", ["Executives","NOC Engineers","Tier 3","Ops Managers"], default=["Executives","NOC Engineers"])
with colC:
    role = st.text_input("Role", "Genesys Cloud Monitoring Assistant")

task = st.text_input("Task", "Explain likely causes and mitigations for WebRTC disconnects")

modes = st.multiselect("Modes", ["exec","engineer","viz"], default=["exec","engineer","viz"])
desired_output = st.multiselect(
    "Desired Output",
    ["executive_summary","technical_json","chart_recommendations"],
    default=["executive_summary","technical_json","chart_recommendations"]
)

st.markdown("#### Input Data")
log_snippet = st.text_area("Raw log snippet", height=120, placeholder="Paste a log or short context fragment...")
timestamp = st.text_input("Timestamp (ISO8601)", datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat() + "Z")

# --- Submit -----------------------------------------------------------------
if st.button("Generate", type="primary", use_container_width=True):
    payload = {
        "template_id": template_id,
        "role": role,
        "task": task,
        "context": {
            "environment": environment,
            "audience": audience,
            "scale": "100k agents; 12 BPO partners; global"
        },
        "input_data": {
            "log_snippet": log_snippet,
            "timestamp": timestamp
        },
        "desired_output": desired_output,
        "modes": modes
    }
    if model.strip():
        payload["model"] = model.strip()

    try:
        r = requests.post(f"{API_URL}/api/generate", json=payload, timeout=120)
        r.raise_for_status()
        data = r.json()

        # Header strip with cache signal
        cache_note = "✅ Served from cache" if data["cached"] else "✨ Fresh generation"
        st.success(f"{cache_note} · cache_key={data['cache_key'][:12]}… · audit_id={data['audit_id']}")

        out = data["output"]
        left, right = st.columns([1,1])

        with left:
            if "executive_summary" in out:
                st.subheader("C-Suite Summary")
                if isinstance(out["executive_summary"], list):
                    for b in out["executive_summary"]:
                        st.write("- " + str(b))
                else:
                    st.write(out["executive_summary"])

            if "chart_recommendations" in out:
                st.subheader("Chart Recommendations")
                st.json(out["chart_recommendations"])

        with right:
            if "technical_json" in out:
                st.subheader("Engineer Drill-down")
                st.json(out["technical_json"])

        st.markdown("#### Raw Output JSON")
        st.code(json.dumps(out, indent=2), language="json")

        st.markdown("#### Audit")
        st.caption("Recent runs:")
        try:
            ra = requests.get(f"{API_URL}/api/audit?limit=10", timeout=10).json()
            st.json(ra)
        except Exception:
            st.warning("Could not fetch audit list.")
    except requests.HTTPError as e:
        st.error(f"API error: {e.response.text}")
    except Exception as ex:
        st.error(str(ex))
### END FILE
