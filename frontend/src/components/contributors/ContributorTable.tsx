import { useMemo, useState } from "react";
import { Empty } from "antd";
import type { DbContributor } from "../../types";

interface Props {
  data: DbContributor[];
  loading: boolean;
}

type SortKey = "author_email" | "total_commits" | "total_additions" | "total_deletions" | "total_changes" | "cpc";

export function ContributorTable({ data, loading }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("total_changes");
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      let aVal: number | string, bVal: number | string;
      if (sortKey === "cpc") {
        aVal = a.total_commits > 0 ? a.total_changes / a.total_commits : 0;
        bVal = b.total_commits > 0 ? b.total_changes / b.total_commits : 0;
      } else if (sortKey === "author_email") {
        aVal = a.author_email;
        bVal = b.author_email;
      } else {
        aVal = Number(a[sortKey]) || 0;
        bVal = Number(b[sortKey]) || 0;
      }
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [data, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const arrow = (key: SortKey) => sortKey === key ? (sortAsc ? " ↑" : " ↓") : " ↕";

  if (!loading && data.length === 0) return <Empty description="Нет данных. Нажмите «Собрать данные»." />;

  const thStyle: React.CSSProperties = {
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    color: "white",
    padding: "15px 12px",
    textAlign: "left",
    fontWeight: 600,
    cursor: "pointer",
    userSelect: "none",
    fontSize: 13,
  };

  const tdStyle: React.CSSProperties = {
    padding: "12px 12px",
    borderBottom: "1px solid #e0e0e0",
    fontSize: 13,
  };

  return (
    <div style={{ overflowX: "auto", background: "white", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle} onClick={() => handleSort("author_email")}>Контрибьютор{arrow("author_email")}</th>
            <th style={thStyle} onClick={() => handleSort("total_changes")}>Изменений{arrow("total_changes")}</th>
            <th style={thStyle} onClick={() => handleSort("total_commits")}>Коммитов{arrow("total_commits")}</th>
            <th style={thStyle} onClick={() => handleSort("cpc")}>Δ/коммит{arrow("cpc")}</th>
            <th style={thStyle} onClick={() => handleSort("total_additions")}>+ строк{arrow("total_additions")}</th>
            <th style={thStyle} onClick={() => handleSort("total_deletions")}>- строк{arrow("total_deletions")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => {
            const cpc = c.total_commits > 0 ? (c.total_changes / c.total_commits).toFixed(1) : "0";
            const displayName = c.author_name ? `${c.author_email} (${c.author_name})` : c.author_email;
            return (
              <tr key={c.id} style={{ cursor: "default" }} onMouseEnter={(e) => (e.currentTarget.style.background = "#f8f9fa")} onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                <td style={{ ...tdStyle, fontWeight: 500 }}>{displayName}</td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{Number(c.total_changes).toLocaleString()}</td>
                <td style={tdStyle}>{Number(c.total_commits)}</td>
                <td style={tdStyle}>{cpc}</td>
                <td style={{ ...tdStyle, color: "#3f8600" }}>+{Number(c.total_additions).toLocaleString()}</td>
                <td style={{ ...tdStyle, color: "#cf1322" }}>-{Number(c.total_deletions).toLocaleString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
