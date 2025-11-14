### BEGIN FILE: README.md

# AI Prompt Workbench

## What's inside

- **FastAPI backend** (`app.py`): caching (SHA-256), few-shot scaffolding, audit logging (SQLite), strict output contracts.
- **Templates** (`templates/*.yaml`): versioned prompt specs with gold examples.
- **Streamlit UI** (`streamlit_app.py`): business-friendly front end.
- **Power BI connector** (`powerbi/AIPromptGenerate.pq`): call the API from M and turn JSON into tables.
- **PowerShell bootstrap** (`Start-PromptWorkbench.ps1`): one command to run it all.

## Quick start

1. Set `OPENAI_API_KEY` in your environment (or let the bootstrap prompt you).
2. Run:

   ```powershell
   ./Start-PromptWorkbench.ps1
