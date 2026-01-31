
export const definitions = [
  {
    term: 'Application Factory',
    definition: 'A goal-driven system that turns a high-level request (plus optional inputs) into a set of build tasks executed by specialized AI agents, producing exportable application artifacts such as a repo ZIP bundle, build/run/test instructions, and acceptance checks.',
  },
  {
    term: 'Agent',
    definition: 'An autonomous AI entity designed to perform a specific build task. Each agent has a designated role (e.g., Code Writer, QA Specialist) and may have a specialization. Agents work on tasks assigned by the supervisor.',
  },
  {
    term: 'Supervisor Agent',
    definition: 'The primary agent that analyzes the goal and creates a detailed, multi-step build plan. It defines tasks, their dependencies, and which specialist agent is best suited for each step.',
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
    definition: 'A visual representation of the build plan, showing tasks as nodes and their dependencies as connecting lines. It helps visualize the workflow and track progress from goal to deliverable artifacts.',
  },
  {
    term: 'Enterprise Usage',
    definition: 'Using this application in a corporate environment may require network configuration (firewall whitelisting) and specific authentication methods (like service accounts) for security and compliance. For detailed instructions, please consult the README.md file in the project repository.'
  }
];
