import { TrendingUp, DollarSign, Clock } from "lucide-react";

export default function SummaryCards({ avgScore, totalCost, avgDuration }) {
  const cards = [
    { title: "Avg Score", value: avgScore, icon: <TrendingUp className="text-teal-400" /> },
    { title: "Total Cost ($)", value: totalCost, icon: <DollarSign className="text-yellow-400" /> },
    { title: "Avg Duration (min)", value: avgDuration, icon: <Clock className="text-blue-400" /> },
  ];

  return (
    <div className="grid sm:grid-cols-3 gap-4 mb-8">
      {cards.map((c) => (
        <div key={c.title} className="bg-gray-900 p-4 rounded-2xl shadow-md flex items-center gap-4">
          {c.icon}
          <div>
            <div className="text-sm text-gray-400">{c.title}</div>
            <div className="text-xl font-semibold">{c.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
