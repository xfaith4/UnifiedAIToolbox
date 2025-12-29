FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# System deps (curl for healthcheck parity).
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Copy only the parts of the repo required for prompt-api to run.
COPY constraints.txt /app/constraints.txt
COPY packages/prompt-registry /app/packages/prompt-registry
COPY modules /app/modules
COPY Orchestration /app/Orchestration
COPY apps/UnifiedPromptApp/services/prompt-api /app/apps/UnifiedPromptApp/services/prompt-api

WORKDIR /app/apps/UnifiedPromptApp/services/prompt-api

RUN python -m pip install --upgrade pip \
    && pip install -r requirements.txt \
    && pip install -e /app/packages/prompt-registry

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]

