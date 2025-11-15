export default function PromptsPage() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">Prompt Library</h1>
      <p className="text-gray-600 mb-6">
        Browse and manage your AI prompts. Create, edit, and organize prompts for various use cases.
      </p>
      
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Getting Started</h2>
        <p className="text-gray-700">
          The Prompt Library helps you manage reusable AI prompts. You can:
        </p>
        <ul className="list-disc list-inside mt-2 text-gray-700">
          <li>Create and organize prompts by category</li>
          <li>Define variables for dynamic content</li>
          <li>Test prompts with different inputs</li>
          <li>Share prompts across your team</li>
        </ul>
      </div>
    </div>
  );
}
