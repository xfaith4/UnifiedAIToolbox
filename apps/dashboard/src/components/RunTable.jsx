export default function RunTable({ runs }) {
  return (
    <div className="bg-gray-900 p-6 rounded-2xl shadow-md overflow-x-auto">
      <h2 className="text-lg font-semibold mb-2 text-teal-400">Run History</h2>
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-gray-400 border-b border-gray-800">
            <th className="text-left py-2">Timestamp</th>
            <th className="text-left py-2">Score</th>
            <th className="text-left py-2">Cost ($)</th>
            <th className="text-left py-2">Duration</th>
            <th className="text-left py-2">Outcome</th>
            <th className="text-left py-2">Synthesis</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r, i) => (
            <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/40">
              <td>{r.Timestamp}</td>
              <td className={r.Score >= 7 ? "text-teal-400" : "text-red-400"}>{r.Score}</td>
              <td>${r.Cost}</td>
              <td>{r.Duration} min</td>
              <td>{r.Outcome}</td>
              <td>
                <a href={r.Synthesis} className="text-teal-400 hover:underline" target="_blank">
                  View
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
