import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export default function TrendChart({ runs }) {
  const data = runs.map((r) => ({
    Timestamp: r.Timestamp,
    Score: Number(r.Score),
    Cost: Number(r.Cost),
  }));

  return (
    <div className="bg-gray-900 p-6 rounded-2xl mb-8 shadow-md">
      <h2 className="text-lg font-semibold mb-2 text-teal-400">Performance Trend</h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis dataKey="Timestamp" stroke="#94a3b8" />
          <YAxis stroke="#94a3b8" />
          <Tooltip contentStyle={{ background: "#111827", border: "none" }} />
          <Legend />
          <Line type="monotone" dataKey="Score" stroke="#14b8a6" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="Cost" stroke="#fbbf24" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
