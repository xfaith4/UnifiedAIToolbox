export default function AgentsPage() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">Agent Library</h1>
      <p className="text-gray-600 mb-6">
        Manage AI agents and their configurations. Build autonomous agents for specific tasks.
      </p>
      
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">About Agents</h2>
        <p className="text-gray-700">
          AI agents are autonomous systems that can perform tasks using prompts, tools, and logic. Features include:
        </p>
        <ul className="list-disc list-inside mt-2 text-gray-700">
          <li>Define agent behaviors and capabilities</li>
          <li>Configure tools and integrations</li>
          <li>Set up multi-agent workflows</li>
          <li>Monitor agent performance</li>
        </ul>
      </div>
    </div>
  );
}
