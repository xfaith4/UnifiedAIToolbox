# Unified AI Toolbox - Web Portal

A modern Next.js web portal for the Unified AI Toolbox, featuring AI orchestration, prompt management, and multi-agent collaboration.

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- The Prompt API backend running (default: http://localhost:8000)

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure the API connection:**
   
   The webapp is pre-configured with `.env.local` pointing to `http://localhost:8000`.
   
   If your Prompt API runs on a different port, update `.env.local`:
   ```bash
   NEXT_PUBLIC_API_BASE=http://localhost:8001
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Open the portal:**
   
   Navigate to [http://localhost:3000](http://localhost:3000)

## Configuration

### Environment Variables

The webapp uses the following environment variables:

- `NEXT_PUBLIC_API_BASE` - URL of the Prompt API backend (default: `http://localhost:8000`)
- `NEXT_PUBLIC_PROMPT_API_BASE` - Alternative API base URL (checked if `NEXT_PUBLIC_API_BASE` is not set)
- `PORT` - Port for the Next.js server (default: `3000`)

### Docker Deployment

When running via docker-compose, the webapp automatically connects to the `prompt-api` service:

```bash
docker-compose up unified-webapp
```

The docker-compose configuration sets `NEXT_PUBLIC_API_BASE=http://prompt-api:8000` for container-to-container communication.

### Production Deployment

For production deployments, set the environment variable to your API endpoint:

```bash
NEXT_PUBLIC_API_BASE=https://api.yourdomain.com npm run build
npm run start
```

## Features

### AI Orchestration

The `/orchestrator` page provides:

- **Multi-Agent Orchestration**: Coordinate multiple AI agents to accomplish complex goals
- **Classic Mode**: Single-agent orchestration with prompt templates
- **Real-time Monitoring**: View orchestration runs, logs, and status updates
- **Agent Management**: Create ad-hoc agents or use predefined agent teams

### Architecture

The webapp connects to the Prompt API backend for:

- Creating and monitoring orchestration runs
- Fetching agent and prompt libraries
- Retrieving run logs and manifests
- Submitting feedback and quality metrics

### API Integration

The frontend communicates with the backend via REST API calls:

```typescript
import { createOrchestrationRun, fetchOrchestrationRuns } from '@/lib/services/orchestratorApi'

// Launch a new orchestration
const run = await createOrchestrationRun({
  goal: "Analyze user feedback and generate insights",
  agents: ["Researcher", "Analyst", "Synthesizer"],
  model: "gpt-4o-mini"
})

// Fetch all runs
const runs = await fetchOrchestrationRuns()
```

## Development

### Project Structure

```
src/
├── app/                    # Next.js app directory (pages and layouts)
│   ├── orchestrator/       # AI Orchestration interface
│   ├── milestones/         # Milestone tracking dashboard
│   └── engine/             # Task planning engine
├── components/             # Reusable UI components
├── lib/
│   ├── services/           # API client services
│   └── types/              # TypeScript type definitions
└── public/                 # Static assets
```

### Key Services

- `orchestratorApi.ts` - Backend API integration
- `orchestratorStore.ts` - Local state management
- `agentStore.ts` - Agent library management
- `promptStore.ts` - Prompt library management

### Running Tests

```bash
npm run test
```

### Linting

```bash
npm run lint
```

## Troubleshooting

### Orchestration Not Working

If the orchestration page shows:
> "Defaulting to http://localhost:8000 because NEXT_PUBLIC_API_BASE is unset"

**Solution**: The `.env.local` file should already be configured. If you see this message:

1. Verify `.env.local` exists in the webapp directory
2. Check that `NEXT_PUBLIC_API_BASE` is set correctly
3. Ensure the Prompt API backend is running on the configured port
4. Restart the Next.js dev server after changing `.env.local`

### CORS Errors

If you see CORS errors in the browser console:

1. Verify the backend CORS configuration includes your frontend URL
2. Check that the backend is running and accessible
3. For development, ensure both services are on localhost

### Connection Refused

If the frontend can't connect to the backend:

1. Verify the Prompt API is running: `curl http://localhost:8000/health`
2. Check the port configuration matches between frontend and backend
3. For Docker deployments, ensure both services are on the same network

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Unified AI Toolbox Repository](https://github.com/xfaith4/UnifiedAIToolbox)
- [Prompt API Documentation](../../apps/UnifiedPromptApp/services/prompt-api/README.md)
