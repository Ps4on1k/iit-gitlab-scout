import { useMemo, useState } from "react";
import { Empty } from "antd";
import type { DbContributor } from "../../types";

interface Props {
  data: DbContributor[];
  loading: boolean;
}

type SortKey = "author_email" | "total_commits" | "total_additions" | "total_deletions" | "total_changes" | "cpc" | "active_days" | "commits_per_day" | "commits_per_week" | "avg_additions" | "avg_deletions" | "activity_span";

export function ContributorTable({ data, loading }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("total_changes");
  const [sortAsc, setSortAsc] = useState(false);

  const withMetrics = useMemo(() => {
    return data.map((c) => {
      const freq = c.frequency || {};
      const activeDays = Object.keys(freq).filter((d) => freq[d] > 0).length;
      const commitsPerDay = activeDays > 0 ? c.total_commits / activeDays : 0;
      const commitsPerWeek = activeDays > 0 ? c.total_commits / (activeDays / 7) : 0;
      const avgAdditions = c.total_commits > 0 ? c.total_additions / c.total_commits : 0;
      const avgDeletions = c.total_commits > 0 ? c.total_deletions / c.total_commits : 0;

      let activitySpan = 0;
      if (c.first_commit_date && c.last_commit_date) {
        const first = new Date(c.first_commit_date).getTime();
        const last = new Date(c.last_commit_date).getTime();
        activitySpan = Math.ceil((last - first) / 86400000);
      }

      return { ...c, activeDays, commitsPerDay, commitsPerWeek, avgAdditions, avgDeletions, activitySpan };
    });
  }, [data]);

  const sorted = useMemo(() => {
    return [...withMetrics].sort((a, b) => {
      let aVal: number | string, bVal: number | string;
      if (sortKey === "author_email") {
        aVal = a.author_email;
        bVal = b.author_email;
      } else if (sortKey === "cpc") {
        aVal = a.total_commits > 0 ? a.total_changes / a.total_commits : 0;
        bVal = b.total_commits > 0 ? b.total_changes / b.total_commits : 0;
      } else if (sortKey === "active_days") {
        aVal = a.activeDays;
        bVal = b.activeDays;
      } else if (sortKey === "commits_per_day") {
        aVal = a.commitsPerDay;
        bVal = b.commitsPerDay;
      } else if (sortKey === "commits_per_week") {
        aVal = a.commitsPerWeek;
        bVal = b.commitsPerWeek;
      } else if (sortKey === "avg_additions") {
        aVal = a.avgAdditions;
        bVal = b.avgAdditions;
      } else if (sortKey === "avg_deletions") {
        aVal = a.avgDeletions;
        bVal = b.avgDeletions;
      } else if (sortKey === "activity_span") {
        aVal = a.activitySpan;
        bVal = b.activitySpan;
      } else {
        aVal = Number(a[sortKey]) || 0;
        bVal = Number(b[sortKey]) || 0;
      }
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [withMetrics, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const arrow = (key: SortKey) => sortKey === key ? (sortAsc ? " ↑" : " ↓") : " ↕";

  if (!loading && data.length === 0) return <Empty description="Нет данных. Нажмите «Собрать данные»." />;

  const thStyle: React.CSSProperties = {
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    color: "white",
    padding: "15px 10px",
    textAlign: "left",
    fontWeight: 600,
    cursor: "pointer",
    userSelect: "none",
    fontSize: 12,
    whiteSpace: "nowrap",
  };

  const tdStyle: React.CSSProperties = {
    padding: "10px 10px",
    borderBottom: "1px solid #e0e0e0",
    fontSize: 13,
  };

  return (
    <div style={{ overflowX: "auto", background: "white", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle} onClick={() => handleSort("author_email")}>Контрибьютор{arrow("author_email")}</th>
            <th style={thStyle} onClick={() => handleSort("total_commits")}>Коммитов{arrow("total_commits")}</th>
            <th style={thStyle} onClick={() => handleSort("total_changes")}>Изменений{arrow("total_changes")}</th>
            <th style={thStyle} onClick={() => handleSort("total_additions")}>+ строк{arrow("total_additions")}</th>
            <th style={thStyle} onClick={() => handleSort("total_deletions")}>- строк{arrow("total_deletions")}</th>
            <th style={thStyle} onClick={() => handleSort("cpc")}>Δ/коммит{arrow("cpc")}</th>
            <th style={thStyle} onClick={() => handleSort("active_days")}>Активных дн.{arrow("active_days")}</th>
            <th style={thStyle} onClick={() => handleSort("commits_per_day")}>Коммитов/день{arrow("commits_per_day")}</th>
            <th style={thStyle} onClick={() => handleSort("commits_per_week")}>Коммитов/нед.{arrow("commits_per_week")}</th>
            <th style={thStyle} onClick={() => handleSort("avg_additions")}>Ср. +/коммит{arrow("avg_additions")}</th>
            <th style={thStyle} onClick={() => handleSort("avg_deletions")}>Ср. -/коммит{arrow("avg_deletions")}</th>
            <th style={thStyle} onClick={() => handleSort("activity_span")}>Дн. активности{arrow("activity_span")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => {
            const cpc = c.total_commits > 0 ? (c.total_changes / c.total_commits).toFixed(1) : "0";
            const displayName = c.author_name ? `${c.author_email} (${c.author_name})` : c.author_email;
            return (
              <tr key={c.id} style={{ cursor: "default" }} onMouseEnter={(e) => (e.currentTarget.style.background = "#f8f9fa")} onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                <td style={{ ...tdStyle, fontWeight: 500 }}>{displayName}</td>
                <td style={tdStyle}>{Number(c.total_commits)}</td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{Number(c.total_changes).toLocaleString()}</td>
                <td style={{ ...tdStyle, color: "#3f8600" }}>+{Number(c.total_additions).toLocaleString()}</td>
                <td style={{ ...tdStyle, color: "#cf1322" }}>-{Number(c.total_deletions).toLocaleString()}</td>
                <td style={tdStyle}>{cpc}</td>
                <td style={tdStyle}>{c.activeDays}</td>
                <td style={tdStyle}>{c.commitsPerDay.toFixed(1)}</td>
                <td style={tdStyle}>{c.commitsPerWeek.toFixed(1)}</td>
                <td style={{ ...tdStyle, color: "#3f8600" }}>+{c.avgAdditions.toFixed(1)}</td>
                <td style={{ ...tdStyle, color: "#cf1322" }}>-{c.avgDeletions.toFixed(1)}</td>
                <td style={tdStyle}>{c.activitySpan}д</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
