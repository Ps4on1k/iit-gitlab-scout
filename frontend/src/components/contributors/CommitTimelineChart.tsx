import { useMemo, useRef, useEffect } from "react";
import { Spin } from "antd";
import Chart from "chart.js/auto";
import type { DbContributor } from "../../types";

interface Props {
  data: DbContributor[];
  loading: boolean;
  dateFrom?: string;
  dateTo?: string;
}

export function CommitTimelineChart({ data, loading, dateFrom, dateTo }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  const chartData = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const c of data) {
      for (const [date, count] of Object.entries(c.frequency || {})) {
        if (dateFrom && date < dateFrom) continue;
        if (dateTo && date > dateTo) continue;
        byDate.set(date, (byDate.get(date) || 0) + count);
      }
    }
    return Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [data, dateFrom, dateTo]);

  const daysCount = useMemo(() => {
    if (dateFrom && dateTo) {
      const from = new Date(dateFrom);
      const to = new Date(dateTo);
      return Math.ceil((to.getTime() - from.getTime()) / 86400000) + 1;
    }
    if (chartData.length < 2) return chartData.length;
    const first = new Date(chartData[0][0]);
    const last = new Date(chartData[chartData.length - 1][0]);
    return Math.ceil((last.getTime() - first.getTime()) / 86400000) + 1;
  }, [chartData, dateFrom, dateTo]);

  const chartTitle = useMemo(() => {
    if (dateFrom && dateTo) {
      return `Коммиты по дням (${dateFrom} — ${dateTo}, ${daysCount} дн.)`;
    }
    return `Коммиты по дням (факт. ${daysCount} дн.)`;
  }, [dateFrom, dateTo, daysCount]);

  useEffect(() => {
    if (!canvasRef.current || chartData.length === 0) return;

    if (chartRef.current) {
      chartRef.current.data.labels = chartData.map(([d]) => d);
      chartRef.current.data.datasets[0].data = chartData.map(([, v]) => v);
      chartRef.current.update();
      return;
    }

    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    chartRef.current = new Chart(ctx, {
      type: "bar",
      data: {
        labels: chartData.map(([d]) => d),
        datasets: [{
          label: "Коммиты",
          data: chartData.map(([, v]) => v),
          backgroundColor: "rgba(102, 126, 234, 0.8)",
          borderColor: "rgba(102, 126, 234, 1)",
          borderWidth: 1,
          borderRadius: 3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true }, x: { ticks: { maxRotation: 45, font: { size: 10 } } } },
        plugins: { legend: { position: "bottom" } },
      },
    });
  }, [chartData]);

  return (
    <div style={{ background: "var(--ant-color-bg-container)", padding: 20, borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
      <h3 style={{ margin: "0 0 20px", fontSize: 16, color: "var(--ant-color-text)", borderLeft: "4px solid #3A8DFF", paddingLeft: 12 }}>
        {chartTitle}
      </h3>
      <div style={{ position: "relative", height: 300 }}>
        {loading && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10, background: "rgba(0,0,0,0.5)" }}><Spin /></div>}
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
