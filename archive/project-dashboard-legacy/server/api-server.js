// ### BEGIN FILE: api-server.js
import express from "express";
import cors from "cors";
import fs from "fs";
import { execFile } from "child_process";
import path from "path";
import rateLimit from "express-rate-limit";

const app = express();
const port = 5050;

// ✅ Allow dashboard access from Vite dev server(s) on any localhost/127.0.0.1 port
const isAllowedOrigin = (origin) => {
  if (!origin) return true; // non-browser clients
  try {
    const url = new URL(origin);
    const host = url.hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
};

app.use(
  cors({
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
    credentials: true,
  })
);

app.use(express.json());

// ✅ Run Milestone Controller
// Limit to 5 requests per minute per IP for expensive endpoint
const controllerLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // limit each IP to 5 requests per windowMs
  message: { error: "Too many requests to run controller, please try again later." },
});
app.post("/api/run-controller", controllerLimiter, (req, res) => {
  const goalFile = req.body.goalFile || "./Goals/CurrentGoal.txt";
  const psScript = path.resolve("../scripts/MilestoneController.ps1");

  const args = [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', psScript,
    '-GoalFile', goalFile
  ];
  console.log(`🚀 Launching controller: pwsh ${args.map(a => `"${a}"`).join(' ')}`);

  const process = execFile("pwsh", args, { cwd: path.resolve("../scripts") });

  process.stdout.on("data", data => console.log(data.toString()));
  process.stderr.on("data", data => console.error(data.toString()));

  process.on("exit", code => console.log(`Controller exited with code ${code}`));

  res.json({ status: "running", command: `pwsh ${args.map(a => `"${a}"`).join(' ')}` });
});

// ✅ Serve CurrentGoal.txt for the dashboard editor
app.get("/api/current-goal", (req, res) => {
  const goalFile = path.resolve("../Goals/CurrentGoal.txt");
  if (!fs.existsSync(goalFile)) {
    return res.status(404).json({ error: "Goal file not found" });
  }
  const text = fs.readFileSync(goalFile, "utf8");
  res.type("text/plain").send(text);
});


// ✅ Save updates to CurrentGoal.txt
app.post("/api/update-goal", (req, res) => {
  const { content } = req.body;
  const goalFile = path.resolve("../Goals/CurrentGoal.txt");

  try {
    fs.writeFileSync(goalFile, content, "utf8");
    console.log(`📝 Goal file updated: ${goalFile}`);
    res.json({ status: "success" });
  } catch (err) {
    console.error("❌ Failed to update goal:", err);
    res.status(500).json({ status: "error", error: err.message });
  }
});

// ✅ Fetch agent outputs for a specific run
app.get("/api/run-agents/:runId", (req, res) => {
  const runId = req.params.runId;
  const runFolder = path.resolve(`../runs/${runId}`);
  
  if (!fs.existsSync(runFolder)) {
    return res.status(404).json({ error: "Run folder not found" });
  }

  const agents = ["Researcher", "Engineer", "Critic", "Synthesizer", "Commissioner"];
  const agentData = {};

  agents.forEach(agent => {
    const agentFile = path.join(runFolder, `${agent}.txt`);
    if (fs.existsSync(agentFile)) {
      agentData[agent] = fs.readFileSync(agentFile, "utf8");
    }
  });

  res.json(agentData);
});

// ✅ Fetch agent status for a specific run
app.get("/api/run-status/:runId", (req, res) => {
  const runId = req.params.runId;
  const runFolder = path.resolve(`../runs/${runId}`);
  const statusFile = path.join(runFolder, "agent_status.json");
  
  if (!fs.existsSync(statusFile)) {
    return res.json([]);
  }

  try {
    const content = fs.readFileSync(statusFile, "utf8");
    const lines = content.trim().split('\n').filter(l => l.trim());
    const statuses = lines.map(line => JSON.parse(line));
    res.json(statuses);
  } catch (err) {
    console.error("Error reading status file:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Fetch agent improvements for a specific run
app.get("/api/run-improvements/:runId", (req, res) => {
  const runId = req.params.runId;
  const RUNS_ROOT = path.resolve("../runs");
  const runFolder = path.resolve(RUNS_ROOT, runId);
  const improvementsFile = path.join(runFolder, "agent_improvements.json");

  let canonicalPath;
  try {
    canonicalPath = fs.realpathSync(improvementsFile);
  } catch {
    // File doesn't exist or cannot be resolved
    return res.json([]);
  }

  // Check that the file is within the RUNS_ROOT directory
  if (!canonicalPath.startsWith(RUNS_ROOT)) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    const content = fs.readFileSync(canonicalPath, "utf8");
    const improvements = JSON.parse(content);
    res.json(improvements);
  } catch (err) {
    console.error("Error reading improvements file:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Fetch agent instructions from Agents.json
app.get("/api/agent-instructions", (req, res) => {
  const agentsFile = path.resolve("../prompts/Agents.json");
  
  if (!fs.existsSync(agentsFile)) {
    return res.status(404).json({ error: "Agents.json not found" });
  }

  try {
    const content = fs.readFileSync(agentsFile, "utf8");
    const agentsData = JSON.parse(content);
    res.json(agentsData);
  } catch (err) {
    console.error("Error reading agents file:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Save agent instructions to Agents.json
app.post("/api/agent-instructions", (req, res) => {
  const { agents } = req.body;
  
  if (!agents || !Array.isArray(agents)) {
    return res.status(400).json({ error: "Invalid agents data" });
  }

  // Input validation: ensure each agent has required fields
  for (const agent of agents) {
    if (!agent.name || typeof agent.name !== 'string' || agent.name.trim().length === 0) {
      return res.status(400).json({ error: "Each agent must have a valid name" });
    }
    if (!agent.prompt || typeof agent.prompt !== 'string') {
      return res.status(400).json({ error: "Each agent must have a valid prompt" });
    }
    if (!agent.role || typeof agent.role !== 'string') {
      return res.status(400).json({ error: "Each agent must have a valid role" });
    }
    
    // Sanitize agent name (prevent path traversal)
    if (agent.name.includes('/') || agent.name.includes('\\') || agent.name.includes('..')) {
      return res.status(400).json({ error: "Agent name contains invalid characters" });
    }
  }

  const agentsFile = path.resolve("../prompts/Agents.json");
  
  try {
    // Create backup before modifying (with rotation - keep only last 5 backups)
    if (fs.existsSync(agentsFile)) {
      const backupDir = path.resolve("../prompts/backups");
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      
      const timestamp = Date.now();
      const backupFile = path.join(backupDir, `Agents.json.backup.${timestamp}`);
      fs.copyFileSync(agentsFile, backupFile);
      console.log(`📋 Created backup: ${backupFile}`);
      
      // Cleanup old backups - keep only the 5 most recent
      const backupFiles = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('Agents.json.backup.'))
        .map(f => ({ name: f, path: path.join(backupDir, f), time: fs.statSync(path.join(backupDir, f)).mtime }))
        .sort((a, b) => b.time - a.time);
      
      if (backupFiles.length > 5) {
        backupFiles.slice(5).forEach(backup => {
          fs.unlinkSync(backup.path);
          console.log(`🗑️  Removed old backup: ${backup.name}`);
        });
      }
    }

    // Write updated agents to file
    const agentsData = { Agents: agents };
    fs.writeFileSync(agentsFile, JSON.stringify(agentsData, null, 2), "utf8");
    console.log(`📝 Agent instructions updated: ${agentsFile}`);

    res.json({ 
      status: "success", 
      message: "Agent instructions saved successfully"
    });
  } catch (err) {
    console.error("❌ Failed to update agents:", err);
    res.status(500).json({ status: "error", error: err.message });
  }
});

app.listen(port, () =>
  console.log(`🌐 API listening on http://localhost:${port}`)
);
// ### END FILE
