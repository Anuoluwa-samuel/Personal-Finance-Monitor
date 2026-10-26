import type { ReactNode } from "react";

/** The text equivalent of a chart: same numbers, readable by screen readers and keyboard users. */
export function ChartData({ summary, headers, rows }: { summary: string; headers: string[]; rows: ReactNode[][] }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="min-h-11 cursor-pointer py-2 text-muted">View as table</summary>
      <p className="py-2">{summary}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[20rem] text-left">
          <thead>
            <tr className="border-b border-border">
              {headers.map((h, i) => (
                <th key={h} scope="col" className={`py-2 pr-3 font-medium ${i > 0 ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-border/60">
                {r.map((c, j) => (
                  <td key={j} className={`py-2 pr-3 tabular-nums ${j > 0 ? "text-right" : ""}`}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
