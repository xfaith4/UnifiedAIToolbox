import { useState, useCallback, useEffect, useRef } from 'react';
import OpenAI from 'openai';
import type { Session, Task, Artifact } from '../types';
import { TaskStatus, ArtifactType } from '../types';

const simpleId = () => `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Define maximum character lengths to prevent token limit errors.
const MAX_FILE_CONTEXT_LENGTH = 20000; // Approx 5k tokens for initial plan
const MAX_ARTIFACT_CONTEXT_LENGTH = 8000; // Approx 2k tokens per artifact

// Pricing per 1 million tokens (input/output) for GPT-5.2
const PRICING = {
  'gpt-5.2': { input: 2.50 / 1_000_000, output: 10.00 / 1_000_000 },
  'dall-e-3': { perImage: 0.040 }, // Standard quality 1024x1024
};

const STORAGE_KEY = 'orchestrator-session-history';
const MAX_HISTORY_ITEMS = 50;
const HISTORY_API_ENDPOINT = '/api/engine/history';

const parseHistoryDate = (value?: string) => {
  const timestamp = value ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const mergeHistories = (serverHistory: Session[], localHistory: Session[]) => {
  const byId = new Map<string, Session>();

  const addSession = (entry: Session | null | undefined) => {
    if (!entry || !entry.id) return;
    const candidate: Session = {
      ...entry,
      date: entry.date || new Date().toISOString(),
    };

    const existing = byId.get(candidate.id);
    if (!existing || parseHistoryDate(candidate.date) > parseHistoryDate(existing.date)) {
      byId.set(candidate.id, candidate);
    }
  };

  serverHistory.forEach(addSession);
  localHistory.forEach(addSession);

  return Array.from(byId.values())
    .sort((a, b) => parseHistoryDate(b.date) - parseHistoryDate(a.date))
    .slice(0, MAX_HISTORY_ITEMS);
};

const loadLocalHistory = (): Session[] => {
  if (typeof window === 'undefined') return [];
  try {
    const storedHistory = window.localStorage.getItem(STORAGE_KEY);
    if (!storedHistory) {
      return [];
    }
    const parsed = JSON.parse(storedHistory);
    return Array.isArray(parsed) ? (parsed as Session[]) : [];
  } catch (error) {
    console.error("Failed to load session history from localStorage:", error);
    window.localStorage.removeItem(STORAGE_KEY);
    return [];
  }
};

const persistLocalHistory = (history: Session[]) => {
  if (typeof window === 'undefined') return;
  try {
    const serializedHistory = JSON.stringify(history);
    window.localStorage.setItem(STORAGE_KEY, serializedHistory);
  } catch (error) {
    console.error("Failed to save session history to localStorage:", error);
  }
};

const calculateCost = (model: keyof typeof PRICING, inputTokens: number, outputTokens: number, images: number = 0): number => {
  if (model === 'dall-e-3') {
    return images * PRICING[model].perImage;
  }
  const modelPricing = PRICING[model];
  if (!modelPricing || !('input' in modelPricing)) return 0;
  return (inputTokens * modelPricing.input) + (outputTokens * modelPricing.output);
};


const useOrchestrator = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [history, setHistory] = useState<Session[]>([]);
  const [isOrchestrating, setIsOrchestrating] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [runningTasks, setRunningTasks] = useState<Set<string>>(new Set());

  // Use a ref to track the current orchestration status to avoid stale closures in async functions.
  const isOrchestratingRef = useRef(isOrchestrating);
  useEffect(() => {
    isOrchestratingRef.current = isOrchestrating;
  }, [isOrchestrating]);

  const hasLoadedHistoryRef = useRef(false);

  useEffect(() => {
    let isActive = true;

    const hydrateHistory = async () => {
      let serverHistory: Session[] = [];
      try {
        const response = await fetch(HISTORY_API_ENDPOINT, { cache: 'no-store' });
        if (response.ok) {
          const payload = await response.json();
          if (Array.isArray(payload)) {
            serverHistory = payload as Session[];
          } else {
            console.warn("History API returned an unexpected payload. Using local cache only.");
          }
        } else {
          console.warn(`History API returned ${response.status}; using local cache instead.`);
        }
      } catch (error) {
        console.error("Failed to load session history from API:", error);
      }

      const mergedHistory = mergeHistories(serverHistory, loadLocalHistory());
      if (isActive) {
        setHistory(mergedHistory);
        hasLoadedHistoryRef.current = true;
      }
    };

    void hydrateHistory();

    return () => {
      isActive = false;
    };
  }, []);

  // Save history to localStorage whenever it changes
  useEffect(() => {
    if (!hasLoadedHistoryRef.current) {
      return;
    }
    persistLocalHistory(history);
  }, [history]);

  useEffect(() => {
    if (session) {
      setSession(s => s ? { ...s, tasks } : null);
    }
  }, [tasks]);

  useEffect(() => {
    if (!isOrchestrating) return;

    const completedOrFailedTasks = new Set(
      tasks.filter(t => t.status === TaskStatus.COMPLETED || t.status === TaskStatus.FAILED).map(t => t.id)
    );

    const readyTasks = tasks.filter(task =>
      task.status === TaskStatus.PENDING &&
      !runningTasks.has(task.id) &&
      task.dependencies.every(depId => completedOrFailedTasks.has(depId))
    );

    if (readyTasks.length > 0) {
      readyTasks.forEach(task => {
        setRunningTasks(prev => new Set(prev).add(task.id));
        executeTask(task);
      });
    } else if (runningTasks.size === 0 && tasks.length > 0 && tasks.every(t => t.status !== TaskStatus.PENDING)) {
      finalizeOrchestration();
    }
  }, [tasks, runningTasks, isOrchestrating]);

  const updateTask = (taskId: string, updates: Partial<Task> | ((task: Task) => Partial<Task>)) => {
    setTasks(prevTasks =>
      prevTasks.map(t =>
        t.id === taskId ? { ...t, ...(typeof updates === 'function' ? updates(t) : updates) } : t
      )
    );
  };

  const appendToTaskLog = (taskId: string, entry: string) => {
    updateTask(taskId, task => ({
      agent: { ...task.agent, log: [...task.agent.log, entry] }
    }));
  };

  const persistSessionToServer = useCallback(async (sessionToPersist: Session) => {
    try {
      await fetch(HISTORY_API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionToPersist),
      });
    } catch (error) {
      console.error("Failed to persist session history to API:", error);
    }
  }, []);

  const clearServerHistory = useCallback(async () => {
    try {
      await fetch(HISTORY_API_ENDPOINT, { method: 'DELETE' });
    } catch (error) {
      console.error("Failed to clear persisted session history:", error);
    }
  }, []);

  const startOrchestration = useCallback(async (goal: string, fileContent: string | null) => {
    setIsOrchestrating(true);
    setIsComplete(false);
    setRunningTasks(new Set());
    setTasks([]);

    let initialContext = '';
    const initialTasks: Task[] = [];

    if (fileContent) {
      let truncatedContent = fileContent;
      if (fileContent.length > MAX_FILE_CONTEXT_LENGTH) {
        truncatedContent = fileContent.substring(0, MAX_FILE_CONTEXT_LENGTH) + "\n\n... [File Content Truncated due to size] ...";
      }
      initialContext = `The user has provided the following file content for analysis:\n\`\`\`\n${truncatedContent}\n\`\`\``;
      const fileAnalystTask: Task = {
        id: 'task_file_analyst', name: 'Analyze Provided File', status: TaskStatus.PENDING,
        dependencies: [], agent: { role: 'File Analyst Agent', log: [] }, artifacts: []
      };
      initialTasks.push(fileAnalystTask);
    }

    const newSession: Session = {
      id: simpleId(), goal, fileContent, date: new Date().toISOString(), tasks: [], environmentalImpact: null,
    };
    setSession(newSession);
    setTasks(initialTasks); // Set initial tasks if any

    try {
      const openai = new OpenAI({ 
        apiKey: process.env.NEXT_PUBLIC_API_KEY || process.env.OPENAI_API_KEY,
        dangerouslyAllowBrowser: true 
      });

      const planPrompt = `
        As a Supervisor AI, create a detailed, parallelizable plan to achieve the following goal: "${goal}".
        ${initialContext ? `Start by using the following context:\n${initialContext}` : ''}
        The plan must be a Directed Acyclic Graph (DAG) of tasks.
        For tasks that generate files, specify a unique, descriptive filename in parentheses within the task name, e.g., "Write the main application logic (app.py)".
        Return a single JSON object with a key "tasks", containing an array of task objects.
        Each task object must have: "id" (string), "name" (string), "dependencies" (array of task ids), and "agent" (object with "role" and optional "specialization").
        Choose from agent roles: Planner, Architect, File Analyst Agent, Code Writer, Image Generator, Technical Writer, QA Specialist.
        ${fileContent ? 'The first task in your plan *must* depend on "task_file_analyst".' : ''}
      `;

      const response = await openai.chat.completions.create({
        model: 'gpt-5.2',
        messages: [{ role: 'user', content: planPrompt }],
        response_format: { type: 'json_object' },
      });

      // Check if the run was cancelled while waiting for the plan.
      if (!isOrchestratingRef.current) {
        console.log("Orchestration was cancelled during planning. Aborting.");
        setSession(null);
        setIsOrchestrating(false);
        return;
      }

      const usage = response.usage;
      if (usage) {
        const planningCost = calculateCost('gpt-5.2', usage.prompt_tokens, usage.completion_tokens);
        setSession(s => s ? { ...s, planningCost } : null);
      }

      const plan = JSON.parse(response.choices[0].message.content || "{}");

      const plannedTasks: Task[] = plan.tasks.map((t: any) => ({
        ...t, status: TaskStatus.PENDING, agent: { ...t.agent, log: [] }, artifacts: [],
      }));

      setTasks(prev => [...prev, ...plannedTasks]);

    } catch (error) {
      console.error("Orchestration planning failed:", error);
      setIsOrchestrating(false);
    }
  }, []);

  const executeTask = async (task: Task) => {
    updateTask(task.id, { status: TaskStatus.RUNNING });
    appendToTaskLog(task.id, `Starting task: ${task.name}`);
    appendToTaskLog(task.id, `Agent ${task.agent.role} is working...`);

    try {
      const openai = new OpenAI({ 
        apiKey: process.env.NEXT_PUBLIC_API_KEY || process.env.OPENAI_API_KEY,
        dangerouslyAllowBrowser: true 
      });
      let newArtifact: Artifact | null = null;
      let taskCost = 0;
      let inputTokens = 0;
      let outputTokens = 0;

      const parentTasks = tasks.filter(t => task.dependencies.includes(t.id));
      const context = parentTasks.flatMap(pt =>
        pt.artifacts.map(a => {
          let content = a.content;
          if (content.length > MAX_ARTIFACT_CONTEXT_LENGTH) {
            content = content.substring(0, MAX_ARTIFACT_CONTEXT_LENGTH) + "\n\n... [Content Truncated due to size] ...";
          }
          return `Context from parent task "${pt.name}":\n\`\`\`${a.name}\n${content}\n\`\`\``;
        })
      ).join('\n\n');

      if (task.id === 'task_file_analyst') {
        if (!session?.fileContent) {
          throw new Error("File Analyst task was scheduled, but no file content was found in the session.");
        }
        const summaryPrompt = `Summarize the following content for a developer. Focus on key entities, structure, and purpose:\n\n${session.fileContent}`;
        const response = await openai.chat.completions.create({
          model: 'gpt-5.2',
          messages: [{ role: 'user', content: summaryPrompt }],
        });
        const fileSummary = response.choices[0].message.content || "";
        newArtifact = { id: simpleId(), name: 'file_summary.md', type: ArtifactType.REPORT, content: fileSummary };

        const usage = response.usage;
        if (usage) {
          inputTokens = usage.prompt_tokens;
          outputTokens = usage.completion_tokens;
          taskCost = calculateCost('gpt-5.2', inputTokens, outputTokens);
        }

      } else if (task.agent.role === 'Image Generator') {
        const imagePrompt = `Based on the goal "${session?.goal}", generate a suitable image for the task: "${task.name}". ${context}`;
        const imageResponse = await openai.images.generate({
          model: 'dall-e-3',
          prompt: imagePrompt,
          n: 1,
          size: '1024x1024',
          response_format: 'b64_json',
        });
        taskCost = calculateCost('dall-e-3', 0, 0, 1);
        inputTokens = imagePrompt.length / 4; // Estimation for images
        outputTokens = 0;

        if (imageResponse.data[0]?.b64_json) {
          const filenameMatch = task.name.match(/\(([^)]+)\)/);
          const filename = filenameMatch ? filenameMatch[1] : `generated_image.png`;
          newArtifact = { id: simpleId(), name: filename, type: ArtifactType.IMAGE, content: imageResponse.data[0].b64_json };
        }
      } else {
        const textPrompt = `
          You are the ${task.agent.role} agent.
          Your task is: "${task.name}".
          The overall goal is: "${session?.goal}".
          ${context ? `You have the following context from previous tasks:\n${context}` : ''}
          
          Perform your task. Provide a log of your actions prefixed with "LOG:".
          When you are finished, provide your final output as a single artifact prefixed with "ARTIFACT:". This is mandatory.
        `;

        const response = await openai.chat.completions.create({
          model: 'gpt-5.2',
          messages: [
            { 
              role: 'system', 
              content: 'You must strictly follow the output format. Use "LOG:" for progress and "ARTIFACT:" for the final, complete output. Your final output must begin with ARTIFACT:.' 
            },
            { role: 'user', content: textPrompt }
          ],
        });

        if (!isOrchestratingRef.current) {
          throw new Error("Execution canceled by user.");
        }

        const fullResponseText = response.choices[0].message.content || "";

        // Process the full response at once for robustness
        const lines = (fullResponseText || "").split('\n');
        const artifactLines: string[] = [];
        let hasSeenArtifactTag = false;

        for (const line of lines) {
          if (line.startsWith('LOG:')) {
            appendToTaskLog(task.id, line.substring(4).trim());
          } else if (line.startsWith('ARTIFACT:')) {
            hasSeenArtifactTag = true;
            artifactLines.push(line.substring(9));
          } else if (hasSeenArtifactTag) {
            artifactLines.push(line);
          }
        }

        let artifactContent = artifactLines.join('\n');

        // Fallback: If no ARTIFACT tag was found, treat the whole response (minus logs) as the artifact.
        if (!artifactContent.trim() && fullResponseText.trim()) {
          appendToTaskLog(task.id, "Agent did not use ARTIFACT: prefix. Treating raw output as artifact.");
          artifactContent = lines.filter(line => !line.startsWith('LOG:')).join('\n');
        }

        const usage = response.usage;
        if (usage) {
          inputTokens = usage.prompt_tokens;
          outputTokens = usage.completion_tokens;
          taskCost = calculateCost('gpt-5.2', inputTokens, outputTokens);
        }

        if (artifactContent.trim()) {
          const filenameMatch = task.name.match(/\(([^)]+)\)/);
          const filename = filenameMatch ? filenameMatch[1] : `${task.agent.role.toLowerCase().replace(/\s+/g, '_')}_output.md`;
          const type = (/\.(py|js|ts|html|css|json)$/i).test(filename) ? ArtifactType.CODE : ArtifactType.REPORT;
          newArtifact = { id: simpleId(), name: filename, type: type, content: artifactContent.trim() };
        }
      }

      if (newArtifact) {
        appendToTaskLog(task.id, `Created artifact: ${newArtifact.name}`);
        updateTask(task.id, { status: TaskStatus.COMPLETED, artifacts: [newArtifact], cost: taskCost, inputTokens, outputTokens });
      } else {
        // Fix: Instead of throwing an error, mark the task as complete without an artifact.
        // This prevents a single non-producing agent from failing the entire orchestration.
        appendToTaskLog(task.id, "Agent completed without producing a usable artifact.");
        updateTask(task.id, { status: TaskStatus.COMPLETED, artifacts: [], cost: taskCost, inputTokens, outputTokens });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      console.error(`Task ${task.id} failed:`, error);
      appendToTaskLog(task.id, `Error: ${errorMessage}`);
      updateTask(task.id, { status: TaskStatus.FAILED });
    } finally {
      setRunningTasks(prev => {
        const newSet = new Set(prev);
        newSet.delete(task.id);
        return newSet;
      });
    }
  };

  const finalizeOrchestration = () => {
    if (!session || !isOrchestrating) return;

    const planningCost = session.planningCost || 0;
    const tasksCost = tasks.reduce((sum, task) => sum + (task.cost || 0), 0);
    const totalCost = planningCost + tasksCost;

    const finalSession: Session = { ...session, tasks, totalCost, environmentalImpact: null };
    // Add to history, maintaining the size limit
    setHistory(h => {
      const updatedHistory = [finalSession, ...h].slice(0, MAX_HISTORY_ITEMS);
      void persistSessionToServer(finalSession);
      return updatedHistory;
    });
    setSession(finalSession);
    setIsOrchestrating(false);
    setIsComplete(true);
  };

  const cancelOrchestration = useCallback(() => {
    if (!isOrchestrating) return;

    setIsOrchestrating(false);
    setRunningTasks(new Set());

    setTasks(prevTasks =>
      prevTasks.map(t => {
        if (t.status === TaskStatus.RUNNING || t.status === TaskStatus.PENDING) {
          return {
            ...t,
            status: TaskStatus.FAILED,
            agent: {
              ...t.agent,
              log: t.status === TaskStatus.RUNNING
                ? [...t.agent.log, "Execution canceled by user."]
                : ["Execution canceled by user before starting."],
            },
          };
        }
        return t;
      })
    );
  }, [isOrchestrating]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch (error) {
        console.error("Failed to clear local session history cache:", error);
      }
    }
    void clearServerHistory();
  }, [clearServerHistory]);

  const runFeedback = useCallback(async (session: Session, feedback: string): Promise<string> => {
    const openai = new OpenAI({ 
      apiKey: process.env.NEXT_PUBLIC_API_KEY || process.env.OPENAI_API_KEY,
      dangerouslyAllowBrowser: true 
    });
    const context = session.tasks.map(t => `Task: ${t.name}, Agent: ${t.agent.role}, Status: ${t.status}`).join('\n');

    const feedbackPrompt = `
      An AI orchestration session with the goal "${session.goal}" was completed.
      The executed plan was:
      ${context}

      Here is the user's feedback on the results: "${feedback}".

      You are a Feedback Analyst Agent. Your task is to analyze this feedback in the context of the original goal and the executed plan.
      Restate the user's feedback into actionable points.
      Then, act as an Agent Architect and propose a specific, non-destructive update to an existing agent's instructions or the orchestration planning process to address this feedback in future runs.
      Finally, as an Update Proposer, format this into a clear "Agent Update Proposal" in Markdown.
    `;

    const response = await openai.chat.completions.create({
      model: 'gpt-5.2',
      messages: [{ role: 'user', content: feedbackPrompt }],
    });
    return response.choices[0].message.content || "";
  }, []);

  return {
    session,
    history,
    isOrchestrating,
    isComplete,
    startOrchestration,
    runFeedback,
    cancelOrchestration,
    clearHistory,
  };
};

export default useOrchestrator;
