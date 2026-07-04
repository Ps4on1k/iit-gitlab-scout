import { useMemo, useState, useEffect } from "react";
import { Empty, Tooltip, Select, Modal, Button, Spin, Tag } from "antd";
import { SearchOutlined, DownloadOutlined } from "@ant-design/icons";
import type { DbContributor } from "../../types";
import { fetchContributorCommits, fetchMetricWeights } from "../../api/client";

interface Props {
  data: (DbContributor & { deployScore?: number })[];
  loading: boolean;
  onContributorClick?: (name: string) => void;
  dateFrom?: string;
  dateTo?: string;
  projectIds?: number[];
}

type SortKey = "author_email" | "total_commits" | "total_additions" | "total_deletions" | "total_changes" | "cpc" | "active_days" | "commits_per_day" | "commits_per_week" | "avg_additions" | "avg_deletions" | "activity_span" | "score";

interface ScoreResult {
  score: number;
  grade: string;
  color: string;
  icon: string;
  breakdown: ScoreBreakdown;
}

interface ScoreBreakdown {
  consistency: { raw: number; normalized: number; weight: number; description: string };
  activity: { raw: number; normalized: number; weight: number; description: string };
  impact: { raw: number; normalized: number; weight: number; description: string };
  sizeQuality: { raw: number; normalized: number; weight: number; description: string };
  deploy: { raw: number; normalized: number; weight: number; description: string };
}

function computeScore(c: {
  total_commits: number;
  total_changes: number;
  activeDays: number;
  activitySpan: number;
  commitsPerWeek: number;
  avgChangesPerCommit: number;
  deployScore?: number;
  weights?: Record<string, number>;
}): ScoreResult {
  const { total_commits, total_changes, activeDays, activitySpan, commitsPerWeek, avgChangesPerCommit, deployScore, weights } = c;

  const w = {
    consistency: weights?.consistency ?? 25,
    activity: weights?.activity ?? 20,
    impact: weights?.impact ?? 20,
    sizeQuality: weights?.sizeQuality ?? 15,
    deploy: weights?.deploy ?? 20,
  };

  if (total_commits === 0) return { score: 0, grade: "Нет данных", color: "#d9d9d9", icon: "—", breakdown: { consistency: { raw: 0, normalized: 0, weight: 25, description: "Нет данных" }, activity: { raw: 0, normalized: 0, weight: 20, description: "Нет данных" }, impact: { raw: 0, normalized: 0, weight: 20, description: "Нет данных" }, sizeQuality: { raw: 0, normalized: 0, weight: 15, description: "Нет данных" }, deploy: { raw: 0, normalized: 0, weight: 20, description: "Нет данных" } } };

  const consistency = activitySpan > 0 ? Math.min(activeDays / activitySpan, 1) : 0;
  const activity = Math.min(commitsPerWeek / 15, 1);
  const changesPerDay = activeDays > 0 ? total_changes / activeDays : 0;
  const impact = Math.min(changesPerDay / 200, 1);
  const sizeQuality = avgChangesPerCommit <= 10 ? 0.3
    : avgChangesPerCommit <= 50 ? 1
    : avgChangesPerCommit <= 200 ? 0.8
    : avgChangesPerCommit <= 500 ? 0.5
    : 0.2;
  const deploy = deployScore !== undefined ? deployScore / 100 : 0.5;

  const raw = (consistency * w.consistency) + (activity * w.activity) + (impact * w.impact) + (sizeQuality * w.sizeQuality) + (deploy * w.deploy);
  const score = Math.round(Math.min(100, Math.max(0, raw)));

  const sizeDesc = avgChangesPerCommit <= 10 ? "Мелкие коммиты (≤10 строк) — хорошо для ревью" :
    avgChangesPerCommit <= 50 ? "Оптимальный размер (10–50 строк)" :
    avgChangesPerCommit <= 200 ? "Крупноватые коммиты (50–200 строк)" :
    avgChangesPerCommit <= 500 ? "Очень крупные коммиты (>200 строк)" :
    "Критически крупные коммиты (>500 строк)";

  const breakdown: ScoreBreakdown = {
    consistency: {
      raw: activitySpan > 0 ? activeDays / activitySpan : 0,
      normalized: consistency,
      weight: w.consistency,
      description: `${activeDays} активных дней из ${activitySpan} рабочих (${Math.round(consistency * 100)}%)`,
    },
    activity: {
      raw: commitsPerWeek,
      normalized: activity,
      weight: w.activity,
      description: `${commitsPerWeek.toFixed(1)} коммитов/нед. (норма: ≤15)`,
    },
    impact: {
      raw: changesPerDay,
      normalized: impact,
      weight: w.impact,
      description: `${Math.round(changesPerDay)} строк/день (норма: ≤200)`,
    },
    sizeQuality: {
      raw: avgChangesPerCommit,
      normalized: sizeQuality,
      weight: w.sizeQuality,
      description: `${avgChangesPerCommit.toFixed(0)} строк/коммит — ${sizeDesc}`,
    },
    deploy: {
      raw: deployScore ?? 50,
      normalized: deploy,
      weight: w.deploy,
      description: deployScore !== undefined ? `Score надёжности деплоя: ${deployScore}/100` : "Нет данных о деплоях (нейтральное значение)",
    },
  };

  if (score >= 80) return { score, grade: "Превосходно", color: "#21B573", icon: "★", breakdown };
  if (score >= 60) return { score, grade: "Отлично", color: "#3A8DFF", icon: "●", breakdown };
  if (score >= 40) return { score, grade: "Хорошо", color: "#FFB020", icon: "◆", breakdown };
  if (score >= 20) return { score, grade: "Требует внимания", color: "#FFB020", icon: "▲", breakdown };
  return { score, grade: "Критично", color: "#E5484D", icon: "!", breakdown };
}

function ScoreCell({ score, onClick }: { score: ScoreResult; onClick?: () => void }) {
  return (
    <Tooltip title={<span>{score.score}/100 — {score.grade}. Нажмите для подробностей</span>} placement="top">
      <span onClick={onClick} style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 24, height: 24, borderRadius: 12,
        background: score.color, color: "white", fontSize: 12, fontWeight: 700,
        cursor: onClick ? "pointer" : "default",
      }}>{score.icon}</span>
    </Tooltip>
  );
}

function downloadCsv(filename: string, headers: string[], rows: any[][]) {
  const bom = "\uFEFF";
  const csv = [headers.join(";"), ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"))].join("\n");
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function CommitPopup({ email, dateFrom, dateTo, projectIds }: { email: string; dateFrom?: string; dateTo?: string; projectIds?: number[] }) {
  const [commits, setCommits] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchContributorCommits(email, projectIds, dateFrom, dateTo).then((r) => {
      if (r.ok) { setCommits(r.data!.commits); setTotal(r.data!.total); }
      setLoading(false);
    });
  }, [email, dateFrom, dateTo, projectIds]);

  const handleExport = () => {
    const headers = ["Дата", "Проект", "SHA", "Автор", "Вставка", "Удаление", "Итого", "Сообщение"];
    const rows = commits.map((c: any) => [
      c.committed_date, c.project_label, c.commit_sha?.slice(0, 8),
      c.author_name || c.author_email, c.additions, c.deletions,
      c.total_changes, (c.message || c.raw_json?.message || "").slice(0, 80),
    ]);
    downloadCsv(`commits_${email.replace(/[^a-zA-Z0-9]/g, "_")}.csv`, headers, rows);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontWeight: 600 }}>Коммиты ({total})</span>
        <Button size="small" icon={<DownloadOutlined />} onClick={handleExport}>Скачать CSV</Button>
      </div>
      {loading ? <Spin size="small" /> : commits.length === 0 ? <Empty description="Нет коммитов" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ background: "var(--ant-color-fill-secondary)", color: "var(--ant-color-textSecondary)", padding: "12px 8px", textAlign: "left", fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", borderBottom: "2px solid var(--ant-color-border-secondary)" }}>SHA</th>
                <th style={{ background: "var(--ant-color-fill-secondary)", color: "var(--ant-color-textSecondary)", padding: "12px 8px", textAlign: "left", fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", borderBottom: "2px solid var(--ant-color-border-secondary)" }}>Дата</th>
                <th style={{ background: "var(--ant-color-fill-secondary)", color: "var(--ant-color-textSecondary)", padding: "12px 8px", textAlign: "left", fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", borderBottom: "2px solid var(--ant-color-border-secondary)" }}>Проект</th>
                <th style={{ background: "var(--ant-color-fill-secondary)", color: "var(--ant-color-textSecondary)", padding: "12px 8px", textAlign: "left", fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", borderBottom: "2px solid var(--ant-color-border-secondary)" }}>+ строки</th>
                <th style={{ background: "var(--ant-color-fill-secondary)", color: "var(--ant-color-textSecondary)", padding: "12px 8px", textAlign: "left", fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", borderBottom: "2px solid var(--ant-color-border-secondary)" }}>- строки</th>
                <th style={{ background: "var(--ant-color-fill-secondary)", color: "var(--ant-color-textSecondary)", padding: "12px 8px", textAlign: "left", fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", borderBottom: "2px solid var(--ant-color-border-secondary)" }}>Сообщение</th>
              </tr>
            </thead>
            <tbody>
              {commits.map((c: any) => {
                const d = c.committed_date ? new Date(c.committed_date) : null;
                return (
                  <tr key={c.id || c.commit_sha} style={{ borderBottom: "1px solid var(--ant-color-border-secondary)" }}>
                    <td style={{ padding: "5px 8px" }}><code style={{ color: "#3A8DFF", fontSize: 11 }}>{c.commit_sha?.slice(0, 8)}</code></td>
                    <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{d ? d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                    <td style={{ padding: "5px 8px" }}>{c.project_label && <Tag style={{ fontSize: 10 }}>{c.project_label}</Tag>}</td>
                    <td style={{ padding: "5px 8px", color: "#21B573" }}>+{c.additions}</td>
                    <td style={{ padding: "5px 8px", color: "#E5484D" }}>-{c.deletions}</td>
                    <td style={{ padding: "5px 8px", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(c.message || c.raw_json?.message || "").split("\n")[0].slice(0, 120)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ContributorTable({ data, loading, onContributorClick, dateFrom, dateTo, projectIds }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [modalOpen, setModalOpen] = useState(false);
  const [modalEmail, setModalEmail] = useState("");
  const [modalName, setModalName] = useState("");
  const [scoreModalOpen, setScoreModalOpen] = useState(false);
  const [scoreModalData, setScoreModalData] = useState<{ name: string; score: ScoreResult } | null>(null);
  const [weights, setWeights] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchMetricWeights().then((r) => {
      if (r.ok && r.data?.contributor_score) setWeights(r.data.contributor_score);
    });
  }, []);

  const withMetrics = useMemo(() => {
    return data.map((c) => {
      const freq = c.frequency || {};
      const activeDays = Object.keys(freq).filter((d) => freq[d] > 0).length;
      const commitsPerDay = activeDays > 0 ? c.total_commits / activeDays : 0;
      const commitsPerWeek = activeDays > 0 ? c.total_commits / (activeDays / 7) : 0;
      const avgAdditions = c.total_commits > 0 ? c.total_additions / c.total_commits : 0;
      const avgDeletions = c.total_commits > 0 ? c.total_deletions / c.total_commits : 0;
      const avgChangesPerCommit = c.total_commits > 0 ? c.total_changes / c.total_commits : 0;

      const freqDates = Object.keys(freq).sort();
      let activitySpan = 0;
      if (dateFrom && dateTo) {
        const first = new Date(dateFrom);
        const last = new Date(dateTo);
        let count = 0;
        const d = new Date(first);
        while (d <= last) {
          const dow = d.getDay();
          if (dow !== 0 && dow !== 6) count++;
          d.setDate(d.getDate() + 1);
        }
        activitySpan = count;
      } else if (freqDates.length >= 2) {
        const first = new Date(freqDates[0]);
        const last = new Date(freqDates[freqDates.length - 1]);
        let count = 0;
        const d = new Date(first);
        while (d <= last) {
          const dow = d.getDay();
          if (dow !== 0 && dow !== 6) count++;
          d.setDate(d.getDate() + 1);
        }
        activitySpan = count;
      } else if (freqDates.length === 1) {
        const dow = new Date(freqDates[0]).getDay();
        activitySpan = (dow !== 0 && dow !== 6) ? 1 : 0;
      }

      const score = computeScore({
        total_commits: c.total_commits,
        total_changes: c.total_changes,
        activeDays,
        activitySpan,
        commitsPerWeek,
        avgChangesPerCommit,
        deployScore: c.deployScore,
        weights,
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

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page]);

  useEffect(() => { setPage(1); }, [data.length, sortKey]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === "author_email"); }
  };

  const arrow = (key: SortKey) => sortKey === key ? (sortAsc ? " ↑" : " ↓") : " ↕";

  if (!loading && data.length === 0) return <Empty description="Нет данных. Нажмите «Собрать данные»." />;

  const thStyle: React.CSSProperties = {
    background: "var(--ant-color-fill-secondary)",
    color: "var(--ant-color-textSecondary)",
    padding: "12px 8px",
    textAlign: "left",
    fontWeight: 700,
    fontSize: 11,
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
    borderBottom: "2px solid var(--ant-color-border-secondary)",
  };

  const tdStyle: React.CSSProperties = {
    padding: "10px 10px",
    borderBottom: "1px solid var(--ant-color-border-secondary)",
    fontSize: 13,
  };

  return (
    <div style={{ overflowX: "auto", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", background: "var(--ant-color-bg-container)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle} onClick={() => handleSort("author_email")}>Контрибьютор{arrow("author_email")}</th>
            <th style={thStyle} onClick={() => handleSort("score")}>Score{arrow("score")}</th>
            <th style={thStyle} onClick={() => handleSort("total_commits")}>Коммитов{arrow("total_commits")}</th>
            <th style={thStyle} onClick={() => handleSort("total_additions")}>+ строк{arrow("total_additions")}</th>
            <th style={thStyle} onClick={() => handleSort("total_deletions")}>- строк{arrow("total_deletions")}</th>
            <th style={thStyle} onClick={() => handleSort("cpc")}>Δ/коммит{arrow("cpc")}</th>
            <th style={thStyle} onClick={() => handleSort("commits_per_week")}>Коммитов/нед.{arrow("commits_per_week")}</th>
            <th style={thStyle} onClick={() => handleSort("avg_additions")}>Ср. +/коммит{arrow("avg_additions")}</th>
            <th style={thStyle} onClick={() => handleSort("avg_deletions")}>Ср. -/коммит{arrow("avg_deletions")}</th>
            <th style={thStyle} onClick={() => handleSort("active_days")}>Активных дн.{arrow("active_days")}</th>
          </tr>
        </thead>
        <tbody>
          {paged.map((c) => {
            const cpc = c.total_commits > 0 ? (c.total_changes / c.total_commits).toFixed(1) : "0";
            return (
              <tr key={c.id} style={{ cursor: "default" }} onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ant-color-fill-secondary)")} onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                <td style={{ ...tdStyle, fontWeight: 500 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {c.author_name}
                    </div>
                    <div style={{ fontSize: 11, color: onContributorClick ? "#3A8DFF" : "var(--ant-color-textTertiary)", cursor: onContributorClick ? "pointer" : "default", fontWeight: c.author_name ? 400 : 500 }}
                      onClick={onContributorClick ? () => onContributorClick(c.author_email) : undefined}>{c.author_email}</div>
                  </div>
                </td>
                <td style={tdStyle}><ScoreCell score={c.score} onClick={() => { setScoreModalData({ name: c.author_name || c.author_email, score: c.score }); setScoreModalOpen(true); }} /></td>
                <td style={tdStyle}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {Number(c.total_commits)}
                    <SearchOutlined
                      style={{ color: "#3A8DFF", cursor: "pointer", fontSize: 12 }}
                      onClick={(e) => { e.stopPropagation(); setModalEmail(c.author_email); setModalName(c.author_name || c.author_email); setModalOpen(true); }}
                    />
                  </span>
                </td>
                <td style={{ ...tdStyle, color: "#21B573" }}>+{Number(c.total_additions).toLocaleString()}</td>
                <td style={{ ...tdStyle, color: "#E5484D" }}>-{Number(c.total_deletions).toLocaleString()}</td>
                <td style={tdStyle}>{cpc}</td>
                <td style={tdStyle}>{c.commitsPerWeek.toFixed(1)}</td>
                <td style={{ ...tdStyle, color: "#21B573" }}>+{c.avgAdditions.toFixed(1)}</td>
                <td style={{ ...tdStyle, color: "#E5484D" }}>-{c.avgDeletions.toFixed(1)}</td>
                <td style={tdStyle}>{c.activeDays}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderTop: "1px solid var(--ant-color-border-secondary)", background: "var(--ant-color-fill-secondary)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: "var(--ant-color-textSecondary)" }}>
            {sorted.length > pageSize ? `Показано ${paged.length} из ${sorted.length}` : `${sorted.length} записей`}
          </span>
          <Button size="small" icon={<DownloadOutlined />} onClick={() => {
            const headers = ["Контрибьютор", "Email", "Коммитов", "+ строк", "- строк", "Δ/коммит", "Коммитов/нед.", "Ср.+/коммит", "Ср.-/коммит", "Активных дн.", "Оценка"];
            const rows = sorted.map((c: any) => [
              c.author_name || "", c.author_email, c.total_commits,
              c.total_additions, c.total_deletions,
              c.total_commits > 0 ? (c.total_changes / c.total_commits).toFixed(1) : "0",
              c.commitsPerWeek.toFixed(1),
              c.avgAdditions.toFixed(1), c.avgDeletions.toFixed(1), c.activeDays,
              `${c.score.score} (${c.score.grade})`,
            ]);
            downloadCsv("contributors.csv", headers, rows);
          }}>CSV</Button>
        </div>
        {sorted.length > pageSize && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--ant-color-textSecondary)" }}>Страница</span>
            <Select size="small" style={{ width: 80 }} value={page} onChange={setPage}
              options={Array.from({ length: Math.ceil(sorted.length / pageSize) }, (_, i) => ({ value: i + 1, label: `${i + 1}` }))} />
            <span style={{ fontSize: 13, color: "var(--ant-color-textSecondary)" }}>из {Math.ceil(sorted.length / pageSize)}</span>
          </div>
        )}
      </div>
      <Modal
        title={`Коммиты — ${modalName}`}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width="80%"
        destroyOnClose
      >
        <CommitPopup email={modalEmail} dateFrom={dateFrom} dateTo={dateTo} projectIds={projectIds} />
      </Modal>
      <div style={{ padding: "16px 20px", borderTop: "1px solid var(--ant-color-border-secondary)", background: "var(--ant-color-fill-secondary)", borderRadius: "0 0 12px 12px" }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ant-color-text)", marginBottom: 10 }}>Индикатор эффективности</div>
        <div style={{ display: "flex", gap: 20, marginBottom: 14, fontSize: 12 }}>
          <span><span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 10, background: "#21B573", color: "white", fontSize: 10, fontWeight: 700, marginRight: 4 }}>★</span> 80–100 Превосходно</span>
          <span><span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 10, background: "#3A8DFF", color: "white", fontSize: 10, fontWeight: 700, marginRight: 4 }}>●</span> 60–79 Отлично</span>
          <span><span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 10, background: "#FFB020", color: "white", fontSize: 10, fontWeight: 700, marginRight: 4 }}>◆</span> 40–59 Хорошо</span>
          <span><span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 10, background: "#FFB020", color: "white", fontSize: 10, fontWeight: 700, marginRight: 4 }}>▲</span> 20–29 Требует внимания</span>
          <span><span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 10, background: "#E5484D", color: "white", fontSize: 10, fontWeight: 700, marginRight: 4 }}>!</span> 0–19 Критично</span>
        </div>
        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ant-color-text)", marginBottom: 8 }}>Легенда метрик</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 24px", fontSize: 12, color: "var(--ant-color-text-secondary)" }}>
          <div><b style={{ color: "var(--ant-color-text)" }}>Коммитов</b> — общее количество коммитов за выбранный период</div>
          <div><b style={{ color: "#21B573" }}>+ строк</b> — общее число добавленных строк</div>
          <div><b style={{ color: "#E5484D" }}>- строк</b> — общее число удалённых строк</div>
          <div><b style={{ color: "var(--ant-color-text)" }}>Δ/коммит</b> — средний размер коммита: (изменений) / (коммитов). Чем выше — тем «крупнее» коммиты</div>
          <div><b style={{ color: "var(--ant-color-text)" }}>Коммитов/нед.</b> — коммитов / (активных дней / 7). Недельная интенсивность</div>
          <div><b style={{ color: "#21B573" }}>Ср. +/коммит</b> — (всего добавлений) / (коммитов). Сколько строк добавляется в среднем за коммит</div>
          <div><b style={{ color: "#E5484D" }}>Ср. -/коммит</b> — (всего удалений) / (коммитов). Сколько строк удаляется в среднем за коммит</div>
          <div><b style={{ color: "var(--ant-color-text)" }}>Активных дн.</b> — дни, в которые автор делал хотя бы один коммит (в рамках выбранного периода)</div>
        </div>
        <div style={{ marginTop: 12, fontWeight: 600, fontSize: 13, color: "var(--ant-color-text)", marginBottom: 6 }}>Формула расчёта эффективности</div>
        <div style={{ fontSize: 12, color: "var(--ant-color-text-secondary)", lineHeight: 1.6 }}>
          Композитная метрика от 0 до 100, рассчитывается как взвешенная сумма пяти компонентов:
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px", fontSize: 12, color: "var(--ant-color-text-secondary)", marginTop: 4 }}>
          <div><b style={{ color: "var(--ant-color-text)" }}>Последовательность ({weights.consistency ?? 25}%)</b> — отношение активных дней к рабочим дням в периоде. Регулярный коммитер получает максимум</div>
          <div><b style={{ color: "var(--ant-color-text)" }}>Активность ({weights.activity ?? 20}%)</b> — коммитов в неделю (нормализовано до 15 коммитов/нед = максимум)</div>
          <div><b style={{ color: "var(--ant-color-text)" }}>Влияние ({weights.impact ?? 20}%)</b> — суммарные изменения за активный день (нормализовано до 200 строк/день = максимум)</div>
          <div><b style={{ color: "var(--ant-color-text)" }}>Качество коммитов ({weights.sizeQuality ?? 15}%)</b> — средний размер коммита: идеал 10–50 строк, приемлемо до 200, плохо &gt;500</div>
          <div><b style={{ color: "#21B573" }}>Надёжность деплоя ({weights.deploy ?? 20}%)</b> — Success Rate × 50% + Coverage × 30% + min(Successful, 100) × 20%. Как часто код доходит до продакшена</div>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: "var(--ant-color-textTertiary)", fontStyle: "italic" }}>
          Все метрики вычисляются на основе коммитов за выбранный диапазон дат. Фильтры по проектам и тегам влияют на результат. Индикатор не учитывает контекст проекта, сложность задач и код-ревью.
        </div>
      </div>

      <Modal
        title={null}
        open={scoreModalOpen}
        onCancel={() => setScoreModalOpen(false)}
        footer={null}
        width={520}
        styles={{ header: { display: "none" } }}
      >
        {scoreModalData && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 26, fontWeight: 700, wordBreak: "break-word", lineHeight: 1.3 }}>{scoreModalData.name}</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 16 }}>
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 52, height: 52, borderRadius: 26,
                background: scoreModalData.score.color, color: "white", fontSize: 22, fontWeight: 700,
              }}>{scoreModalData.score.icon}</span>
              <div style={{ fontSize: 32, fontWeight: 800, marginTop: 8 }}>{scoreModalData.score.score}<span style={{ fontSize: 18, fontWeight: 600, color: "var(--ant-color-textSecondary)" }}>/100</span></div>
              <div style={{ fontSize: 14, color: scoreModalData.score.color, fontWeight: 600 }}>{scoreModalData.score.grade}</div>
            </div>

            <div style={{ fontSize: 11, color: "var(--ant-color-textTertiary)", marginBottom: 16, textAlign: "center", lineHeight: 1.5 }}>
              <code>Consistency × {weights.consistency ?? 25}% + Activity × {weights.activity ?? 20}% + Impact × {weights.impact ?? 20}% + Quality × {weights.sizeQuality ?? 15}% + Deploy × {weights.deploy ?? 20}%</code>
            </div>

            {(["consistency", "activity", "impact", "sizeQuality", "deploy"] as const).map((key) => {
              const b = scoreModalData.score.breakdown[key];
              const barWidth = b.normalized * 100;
              const labels = { consistency: "Последовательность", activity: "Активность", impact: "Влияние", sizeQuality: "Качество коммитов", deploy: "Надёжность деплоя" };
              const colors = { consistency: "#3A8DFF", activity: "#B8A8D8", impact: "#21B573", sizeQuality: "#FFB020", deploy: "#42D9C8" };
              return (
                <div key={key} style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{labels[key]} ({b.weight}%)</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: colors[key] }}>{Math.round(b.normalized * b.weight * 10) / 10} баллов</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: "var(--ant-color-fill-secondary)", overflow: "hidden", marginBottom: 4 }}>
                    <div style={{ width: `${barWidth}%`, height: "100%", background: colors[key], borderRadius: 4 }} />
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ant-color-textSecondary)" }}>{b.description}</div>
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}
