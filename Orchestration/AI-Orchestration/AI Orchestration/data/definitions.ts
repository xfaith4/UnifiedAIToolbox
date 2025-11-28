
export const definitions = [
  {
    term: 'Orchestration',
    definition: 'The automated arrangement, coordination, and management of complex computer systems and services. In this context, it refers to an AI system (Supervisor) that breaks down a high-level goal into smaller, manageable tasks for specialized AI agents.',
  },
  {
    term: 'Agent',
    definition: 'An autonomous AI entity designed to perform specific tasks. Each agent has a designated role (e.g., Code Writer, Image Generator) and may have a specialization. Agents work on tasks assigned by the orchestrator.',
  },
  {
    term: 'Supervisor Agent',
    definition: 'The primary agent that analyzes the user\'s high-level goal and creates a detailed, multi-step plan. It defines the tasks, their dependencies, and which specialist agent is best suited for each task.',
  },
  {
    term: 'File Analyst Agent',
    definition: 'A specialist agent that is invoked when a user uploads a text-based file. Its primary task is to read, summarize, and understand the content of the provided file, creating a contextual summary for other agents to use.',
  },
  {
    term: 'Task',
    definition: 'A single unit of work to be performed by an agent. Tasks can have dependencies, meaning they must wait for other tasks to complete before they can begin.',
  },
  {
    term: 'Artifact',
    definition: 'A digital product or output created by an agent upon completing a task. Examples include source code files, written reports, generated images, or data visualizations.',
  },
  {
    term: 'Task Graph',
    definition: 'A visual representation of the orchestration plan, showing tasks as nodes and their dependencies as connecting lines. It helps visualize the workflow and track the progress of the entire operation.',
  },
  {
    term: 'Enterprise Usage',
    definition: 'Using this application in a corporate environment may require network configuration (firewall whitelisting) and specific authentication methods (like Google Cloud Service Accounts) for security and compliance. For detailed instructions, please consult the README.md file in the project repository.'
  }
];
