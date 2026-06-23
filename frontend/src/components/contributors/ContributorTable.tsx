import { useMemo, useState } from "react";
import { Empty, Tooltip } from "antd";
import type { DbContributor } from "../../types";

interface Props {
  data: DbContributor[];
  loading: boolean;
}

type SortKey = "author_email" | "total_commits" | "total_additions" | "total_deletions" | "total_changes" | "cpc" | "active_days" | "commits_per_day" | "commits_per_week" | "avg_additions" | "avg_deletions" | "activity_span" | "score";

interface ScoreResult {
  score: number;
  grade: string;
  color: string;
  icon: string;
}

function computeScore(c: {
  total_commits: number;
  total_changes: number;
  activeDays: number;
  activitySpan: number;
  commitsPerWeek: number;
  avgChangesPerCommit: number;
}): ScoreResult {
  const { total_commits, total_changes, activeDays, activitySpan, commitsPerWeek, avgChangesPerCommit } = c;

  if (total_commits === 0) return { score: 0, grade: "Нет данных", color: "#d9d9d9", icon: "—" };

  const consistency = activitySpan > 0 ? Math.min(activeDays / activitySpan, 1) : 0;

  const activity = Math.min(commitsPerWeek / 15, 1);

  const changesPerDay = activeDays > 0 ? total_changes / activeDays : 0;
  const impact = Math.min(changesPerDay / 200, 1);

  const sizeQuality = avgChangesPerCommit <= 10 ? 0.3
    : avgChangesPerCommit <= 50 ? 1
    : avgChangesPerCommit <= 200 ? 0.8
    : avgChangesPerCommit <= 500 ? 0.5
    : 0.2;

  const raw = (consistency * 30) + (activity * 25) + (impact * 25) + (sizeQuality * 20);
  const score = Math.round(Math.min(100, Math.max(0, raw)));

  if (score >= 80) return { score, grade: "Превосходно", color: "#3f8600", icon: "★" };
  if (score >= 60) return { score, grade: "Отлично", color: "#1677ff", icon: "●" };
  if (score >= 40) return { score, grade: "Хорошо", color: "#fa8c16", icon: "◆" };
  if (score >= 20) return { score, grade: "Требует внимания", color: "#d4b106", icon: "▲" };
  return { score, grade: "Критично", color: "#cf1322", icon: "!" };
}

function ScoreCell({ score }: { score: ScoreResult }) {
  return (
    <Tooltip title={<span>{score.score}/100 — {score.grade}</span>} placement="top">
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 24, height: 24, borderRadius: 12,
        background: score.color, color: "white", fontSize: 12, fontWeight: 700,
        cursor: "default",
      }}>{score.icon}</span>
    </Tooltip>
  );
}

export function ContributorTable({ data, loading }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortAsc, setSortAsc] = useState(false);

  const withMetrics = useMemo(() => {
    return data.map((c) => {
      const freq = c.frequency || {};
      const activeDays = Object.keys(freq).filter((d) => freq[d] > 0).length;
      const commitsPerDay = activeDays > 0 ? c.total_commits / activeDays : 0;
      const commitsPerWeek = activeDays > 0 ? c.total_commits / (activeDays / 7) : 0;
      const avgAdditions = c.total_commits > 0 ? c.total_additions / c.total_commits : 0;
      const avgDeletions = c.total_commits > 0 ? c.total_deletions / c.total_commits : 0;
      const avgChangesPerCommit = c.total_commits > 0 ? c.total_changes / c.total_commits : 0;

      let activitySpan = 0;
      if (c.first_commit_date && c.last_commit_date) {
        const first = new Date(c.first_commit_date).getTime();
        const last = new Date(c.last_commit_date).getTime();
        activitySpan = Math.ceil((last - first) / 86400000);
      }

      const score = computeScore({
        total_commits: c.total_commits,
        total_changes: c.total_changes,
        activeDays,
        activitySpan,
        commitsPerWeek,
        avgChangesPerCommit,
      });

      return { ...c, activeDays, commitsPerDay, commitsPerWeek, avgAdditions, avgDeletions, activitySpan, score };
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
      } else if (sortKey === "score") {
        aVal = a.score.score;
        bVal = b.score.score;
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
    else { setSortKey(key); setSortAsc(key === "author_email"); }
  };

  const arrow = (key: SortKey) => sortKey === key ? (sortAsc ? " ↑" : " ↓") : " ↕";

  if (!loading && data.length === 0) return <Empty description="Нет данных. Нажмите «Собрать данные»." />;

  const thStyle: React.CSSProperties = {
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    color: "white",
    padding: "12px 8px",
    textAlign: "left",
    fontWeight: 600,
    cursor: "pointer",
    userSelect: "none",
    fontSize: 11,
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
            <th style={thStyle} onClick={() => handleSort("score")}>{arrow("score")}</th>
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
            return (
              <tr key={c.id} style={{ cursor: "default" }} onMouseEnter={(e) => (e.currentTarget.style.background = "#f8f9fa")} onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                <td style={{ ...tdStyle, fontWeight: 500 }}>
                  {c.author_name ? (
                    <div>
                      <div style={{ fontWeight: 600 }}>{c.author_name}</div>
                      <div style={{ fontSize: 11, color: "#999" }}>{c.author_email}</div>
                    </div>
                  ) : c.author_email}
                </td>
                <td style={tdStyle}><ScoreCell score={c.score} /></td>
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
      <div style={{ padding: "16px 20px", borderTop: "1px solid #f0f0f0", background: "#fafafa", borderRadius: "0 0 12px 12px" }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "#333", marginBottom: 10 }}>Индикатор эффективности</div>
        <div style={{ display: "flex", gap: 20, marginBottom: 14, fontSize: 12 }}>
          <span><span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 10, background: "#3f8600", color: "white", fontSize: 10, fontWeight: 700, marginRight: 4 }}>★</span> 80–100 Превосходно</span>
          <span><span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 10, background: "#1677ff", color: "white", fontSize: 10, fontWeight: 700, marginRight: 4 }}>●</span> 60–79 Отлично</span>
          <span><span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 10, background: "#fa8c16", color: "white", fontSize: 10, fontWeight: 700, marginRight: 4 }}>◆</span> 40–59 Хорошо</span>
          <span><span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 10, background: "#d4b106", color: "white", fontSize: 10, fontWeight: 700, marginRight: 4 }}>▲</span> 20–29 Требует внимания</span>
          <span><span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 10, background: "#cf1322", color: "white", fontSize: 10, fontWeight: 700, marginRight: 4 }}>!</span> 0–19 Критично</span>
        </div>
        <div style={{ fontWeight: 600, fontSize: 13, color: "#333", marginBottom: 8 }}>Легенда метрик</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 24px", fontSize: 12, color: "#666" }}>
          <div><b style={{ color: "#333" }}>Коммитов</b> — общее количество коммитов за выбранный период</div>
          <div><b style={{ color: "#333" }}>Изменений</b> — суммарный объём (добавления + удаления строк)</div>
          <div><b style={{ color: "#3f8600" }}>+ строк</b> — общее число добавленных строк</div>
          <div><b style={{ color: "#cf1322" }}>- строк</b> — общее число удалённых строк</div>
          <div><b style={{ color: "#333" }}>Δ/коммит</b> — средний размер коммита: (изменений) / (коммитов). Чем выше — тем «крупнее» коммиты</div>
          <div><b style={{ color: "#333" }}>Активных дн.</b> — количество дней, в которые автор делал хотя бы один коммит</div>
          <div><b style={{ color: "#333" }}>Коммитов/день</b> — коммитов / активных дней. Средняя дневная интенсивность</div>
          <div><b style={{ color: "#333" }}>Коммитов/нед.</b> — коммитов / (активных дней / 7). Недельная интенсивность</div>
          <div><b style={{ color: "#3f8600" }}>Ср. +/коммит</b> — (всего добавлений) / (коммитов). Сколько строк добавляется в среднем за коммит</div>
          <div><b style={{ color: "#cf1322" }}>Ср. -/коммит</b> — (всего удалений) / (коммитов). Сколько строк удаляется в среднем за коммит</div>
          <div><b style={{ color: "#333" }}>Дн. активности</b> — календарных дней от первого до последнего коммита. Общий период участия</div>
        </div>
        <div style={{ marginTop: 12, fontWeight: 600, fontSize: 13, color: "#333", marginBottom: 6 }}>Формула расчёта эффективности</div>
        <div style={{ fontSize: 12, color: "#666", lineHeight: 1.6 }}>
          Композитная метрика от 0 до 100, рассчитывается как взвешенная сумма четырёх компонентов:
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px", fontSize: 12, color: "#666", marginTop: 4 }}>
          <div><b style={{ color: "#333" }}>Последовательность (30%)</b> — отношение активных дней к общему периоду участия. Регулярный коммитер получает максимум</div>
          <div><b style={{ color: "#333" }}>Активность (25%)</b> — коммитов в неделю (нормализовано до 15 коммитов/нед = максимум)</div>
          <div><b style={{ color: "#333" }}>Влияние (25%)</b> — суммарные изменения за активный день (нормализовано до 200 строк/день = максимум)</div>
          <div><b style={{ color: "#333" }}>Качество коммитов (20%)</b> — средний размер коммита: идеал 10–50 строк, приемлемо до 200, плохо &gt;500</div>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: "#999", fontStyle: "italic" }}>
          Все метрики вычисляются на основе коммитов за выбранный диапазон дат. Фильтры по проектам и тегам влияют на результат. Индикатор не учитывает контекст проекта, сложность задач и код-ревью.
        </div>
      </div>
    </div>
  );
}
