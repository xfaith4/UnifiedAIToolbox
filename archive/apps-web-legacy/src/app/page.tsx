import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            Unified AI Toolbox
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            A comprehensive suite of AI-powered tools to streamline your workflow.
            Manage prompts, orchestrate agents, and automate code reviews.
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          <Link href="/prompts" className="block p-6 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              📝 Prompt Library
            </h2>
            <p className="text-gray-600">
              Create, organize, and manage reusable AI prompts with variables and templates.
            </p>
          </Link>

          <Link href="/agents" className="block p-6 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              🤖 Agent Library
            </h2>
            <p className="text-gray-600">
              Build and configure autonomous AI agents for complex tasks and workflows.
            </p>
          </Link>

          <Link href="/orchestration" className="block p-6 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              🔄 Orchestration
            </h2>
            <p className="text-gray-600">
              Coordinate multi-agent systems and design complex AI workflows.
            </p>
          </Link>

          <Link href="/code-review" className="block p-6 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              🔍 Code Review
            </h2>
            <p className="text-gray-600">
              AI-powered code analysis for quality, security, and best practices.
            </p>
          </Link>
        </div>

        {/* Getting Started */}
        <div className="bg-blue-50 rounded-lg p-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Getting Started
          </h2>
          <div className="space-y-2 text-gray-700">
            <p>1. Browse the <Link href="/prompts" className="text-blue-600 hover:underline">Prompt Library</Link> to explore available prompts</p>
            <p>2. Create custom <Link href="/agents" className="text-blue-600 hover:underline">AI Agents</Link> for your specific needs</p>
            <p>3. Use <Link href="/orchestration" className="text-blue-600 hover:underline">Orchestration</Link> to build complex workflows</p>
            <p>4. Leverage <Link href="/code-review" className="text-blue-600 hover:underline">Code Review</Link> tools for automated analysis</p>
          </div>
        </div>
      </div>
    </div>
  );
}
