export default function CodeReviewPage() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">Code Review</h1>
      <p className="text-gray-600 mb-6">
        AI-powered code review and analysis tools.
      </p>
      
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Automated Code Review</h2>
        <p className="text-gray-700">
          Use AI to review code for quality, security, and best practices. Features include:
        </p>
        <ul className="list-disc list-inside mt-2 text-gray-700">
          <li>Automated code quality checks</li>
          <li>Security vulnerability detection</li>
          <li>Style and convention enforcement</li>
          <li>Suggest improvements and refactoring</li>
        </ul>
      </div>
    </div>
  );
}
