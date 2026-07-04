import { useState, useEffect, useMemo } from "react";
import { Card, Row, Col, Select, Spin, Empty, Tag, Table, Tooltip, Radio, Typography } from "antd";
import { fetchProjects, fetchBenchmark, fetchContributorBenchmark, fetchContributorsList } from "../../api/client";
import { chartColors } from "../../utils/chartTheme";
import { getTagColor } from "../../utils/tagColors";
import type { ProjectConfig, DbContributor, ContributorFilters } from "../../types";
import type { GlobalFilters } from "../GlobalFilterBar";

interface Props { filters: GlobalFilters; }

const GROUP_COLORS = ["#3A8DFF", "#42D9C8", "#E5484D", "#21B573", "#FFB020", "#141B2D", "#AEB7C4", "#1A5FCC", "#D0B8E8", "#E8B8D0"];

function fmtSec(s: number): string {
  if (s === 0) return "—";
  if (s < 60) return `${s}с`;
  if (s < 3600) return `${Math.round(s / 60)}мин`;
  return `${Math.floor(s / 3600)}ч ${Math.round((s % 3600) / 60)}м`;
}

function fmtMin(m: number): string {
  if (m === 0) return "—";
  if (m < 60) return `${m}мин`;
  return `${Math.floor(m / 60)}ч ${m % 60}м`;
}

function MetricRow({ label, values, format, higherIsBetter = true, unit = "" }: {
  label: string; values: { tag: string; value: number | null }[]; format?: (v: number) => string; higherIsBetter?: boolean; unit?: string;
}) {
  const numericVals = values.map((v) => v.value ?? 0).filter((v) => v > 0);
  const best = higherIsBetter ? Math.max(...numericVals) : Math.min(...numericVals);
  const worst = higherIsBetter ? Math.min(...numericVals.filter((v) => v > 0)) : Math.max(...numericVals);
  const fmt = format || ((v: number) => `${v}${unit}`);

  return (
    <tr style={{ borderBottom: "1px solid var(--ant-color-border-secondary)" }}>
      <td style={{ padding: "6px 12px", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" }}>{label}</td>
      {values.map((v) => {
        const isBest = v.value && v.value === best && numericVals.length > 1;
        const isWorst = v.value && v.value === worst && v.value !== best && numericVals.length > 1;
        return (
          <td key={v.tag} style={{ padding: "6px 12px", fontSize: 13, textAlign: "center", fontWeight: isBest ? 700 : 400,
            color: isBest ? "#21B573" : isWorst ? "#E5484D" : "var(--ant-color-text)" }}>
            {v.value !== null ? fmt(v.value) : "—"}
          </td>
        );
      })}
    </tr>
  );
}

type BenchMode = "tags" | "contributors";

export function BenchmarkDashboard({ filters }: Props) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedContribs, setSelectedContribs] = useState<string[]>([]);
  const [mode, setMode] = useState<BenchMode>("tags");
  const [allContributors, setAllContributors] = useState<DbContributor[]>([]);

  useEffect(() => {
    fetchProjects().then((r) => { if (r.ok) setProjects(r.data!); });
    const fc: ContributorFilters = { date_from: filters.dateFrom, date_to: filters.dateTo };
    fetchContributorsList(fc).then((r) => { if (r.ok) setAllContributors(r.data!); });
  }, [filters.dateFrom, filters.dateTo]);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    for (const p of projects) { if (p.tags) p.tags.forEach((t) => tags.add(t)); }
    return Array.from(tags).sort();
  }, [projects]);

  const contribOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of allContributors) {
      const name = c.author_name || c.author_email;
      map.set(c.author_email, name !== c.author_email ? `${name} (${c.author_email})` : c.author_email);
    }
    return Array.from(map.entries()).map(([email, label]) => ({ value: email, label }));
  }, [allContributors]);

  const loadData = async () => {
    if (mode === "tags" && selectedTags.length === 0) { setData(null); setLoading(false); return; }
    if (mode === "contributors" && selectedContribs.length === 0) { setData(null); setLoading(false); return; }
    setLoading(true);

    if (mode === "tags") {
      const res = await fetchBenchmark(selectedTags, filters.dateFrom, filters.dateTo);
      if (res.ok) setData(res.data);
    } else {
      const res = await fetchContributorBenchmark(selectedContribs, undefined, filters.dateFrom, filters.dateTo);
      if (res.ok) setData(res.data);
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [selectedTags, selectedContribs, mode, filters.dateFrom, filters.dateTo]);

  const groups = data?.groups || [];

  const comparisonTable = useMemo(() => {
    if (groups.length < 1) return [];
    if (mode === "contributors") {
      return [
        { section: "Score", rows: [
          { label: "Score", key: "score", sub: "total", higher: true, unit: "" },
          { label: "Последовательность", key: "score", sub: "consistency", higher: true, unit: "%" },
          { label: "Активность", key: "score", sub: "activity", higher: true, unit: "%" },
          { label: "Влияние", key: "score", sub: "impact", higher: true, unit: "%" },
          { label: "Качество коммитов", key: "score", sub: "sizeQuality", higher: true, unit: "%" },
        ]},
        { section: "Надёжность деплоя", rows: [
          { label: "Deploy Success Rate", key: "score", sub: "deploySuccessRate", higher: true, unit: "%" },
          { label: "Pipeline Coverage", key: "score", sub: "pipelineCoverage", higher: true, unit: "%" },
          { label: "MR замержено", key: "score", sub: "totalMergedMrs", higher: true },
          { label: "Pipeline запусков", key: "score", sub: "totalPipelines", higher: true },
        ]},
        { section: "Коммиты", rows: [
          { label: "Всего коммитов", key: "commits", sub: "total", higher: true },
          { label: "Коммитов в день", key: "commits", sub: "perDay", higher: true },
          { label: "Активных дней", key: "commits", sub: "activeDays", higher: true },
          { label: "Изменений строк", key: "commits", sub: "changes", higher: true },
        ]},
        { section: "Merge Requests", rows: [
          { label: "Всего MR", key: "mr", sub: "total", higher: true },
          { label: "Замержено", key: "mr", sub: "merged", higher: true },
          { label: "Merge Rate", key: "mr", sub: "mergeRate", higher: true, unit: "%" },
        ]},
      ];
    }
    return [
      { section: "Проекты", rows: [
        { label: "Кол-во проектов", key: "projects", sub: "count", higher: true, unit: "" },
      ]},
      { section: "DORA", rows: [
        { label: "Частота деплоев (в день)", key: "dora", sub: "deployFrequency", higher: true },
        { label: "Lead Time", key: "dora", sub: "avgLeadTimeSec", higher: false, format: fmtSec },
        { label: "Failure Rate %", key: "dora", sub: "failureRate", higher: false, unit: "%" },
        { label: "MTTR", key: "dora", sub: "avgMttrMin", higher: false, format: fmtMin },
      ]},
      { section: "Коммиты", rows: [
        { label: "Всего коммитов", key: "commits", sub: "total", higher: true },
        { label: "Коммитов в день", key: "commits", sub: "perDay", higher: true },
        { label: "Уникальных контрибьюторов", key: "commits", sub: "contributors", higher: true },
      ]},
      { section: "Пайплайны", rows: [
        { label: "Всего", key: "pipelines", sub: "total", higher: true },
        { label: "Success Rate", key: "pipelines", sub: "successRate", higher: true, unit: "%" },
      ]},
      { section: "Merge Requests", rows: [
        { label: "Всего MR", key: "mr", sub: "total", higher: true },
        { label: "Замержено", key: "mr", sub: "merged", higher: true },
        { label: "Merge Rate", key: "mr", sub: "mergeRate", higher: true, unit: "%" },
      ]},
      { section: "Ветки", rows: [
        { label: "Всего", key: "branches", sub: "total", higher: true },
        { label: "Активные", key: "branches", sub: "active", higher: true },
        { label: "Заброшенные", key: "branches", sub: "stale", higher: false },
        { label: "Health %", key: "branches", sub: "health", higher: true, unit: "%" },
      ]},
    ];
  }, [groups, mode]);

  const handleModeChange = (e: any) => {
    setMode(e.target.value);
    setData(null);
    setSelectedTags([]);
    setSelectedContribs([]);
  };

  return (
    <div style={{ width: "90%", margin: "0 auto", position: "relative", zIndex: 2 }}>
      <div style={{ background: "linear-gradient(135deg, #D0B8E8 0%, #B8D8F0 100%)", color: "#111315", padding: "14px 24px", borderRadius: "12px", marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, marginBottom: 4 }}>Бенчмарк</h1>
        <div style={{ opacity: 0.9, fontSize: 13 }}>Сравнение по тегам проектов или по контрибьюторам</div>
      </div>

      {/* Mode selector */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Radio.Group value={mode} onChange={handleModeChange}>
            <Radio.Button value="tags">По тегам проектов</Radio.Button>
            <Radio.Button value="contributors">По контрибьюторам</Radio.Button>
          </Radio.Group>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {mode === "tags"
              ? "Сравнивает агрегированные метрики проектов, сгруппированных по тегам"
              : "Сравнивает индивидуальные метрики выбранных контрибьюторов"}
          </Typography.Text>
        </div>
      </Card>

      {/* Selector */}
      <div style={{ marginBottom: 16 }}>
        {mode === "tags" ? (
          <Select
            mode="tags" placeholder="Выберите теги для сравнения" style={{ width: "100%" }}
            value={selectedTags} onChange={setSelectedTags}
            options={availableTags.map((t) => ({ value: t, label: t }))}
            maxTagCount="responsive"
          />
        ) : (
          <Select
            mode="multiple" placeholder="Выберите контрибьюторов для сравнения" style={{ width: "100%" }}
            value={selectedContribs} onChange={setSelectedContribs}
            options={contribOptions} showSearch optionFilterProp="label"
            maxTagCount="responsive"
          />
        )}
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--ant-color-textTertiary)" }}>
          {mode === "tags"
            ? "Выберите 2+ тега для сравнения. Зелёный — лучший показатель, красный — худший."
            : "Выберите 2+ контрибьюторов для сравнения. Зелёный — лучший показатель, красный — худший."}
        </div>
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40 }}><Spin size="large" /></div>}

      {!loading && groups.length > 0 && (
        <>
          {/* Summary cards */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            {groups.map((g: any, i: number) => (
              <Col key={g.tag} span={Math.min(8, 24 / Math.max(groups.length, 1))}>
                <Card size="small" style={{ borderTop: `3px solid ${GROUP_COLORS[i % GROUP_COLORS.length]}`, height: "100%" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <Tag style={{ background: GROUP_COLORS[i % GROUP_COLORS.length], color: "#fff", border: "none", fontWeight: 600, fontSize: 11 }}>{g.tag}</Tag>
                    {mode === "tags" && <span style={{ fontSize: 12, color: "var(--ant-color-textTertiary)" }}>{g.projectCount} проектов</span>}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 11 }}>
                    <span style={{ color: "var(--ant-color-textTertiary)" }}>Коммитов</span><span style={{ fontWeight: 600 }}>{g.commits?.total || 0}</span>
                    <span style={{ color: "var(--ant-color-textTertiary)" }}>MR</span><span style={{ fontWeight: 600 }}>{g.mr?.total || 0}</span>
                    {mode === "tags" && <><span style={{ color: "var(--ant-color-textTertiary)" }}>Деплоев</span><span style={{ fontWeight: 600 }}>{g.dora?.total || 0}</span>
                    <span style={{ color: "var(--ant-color-textTertiary)" }}>Health</span><span style={{ fontWeight: 600 }}>{g.branches?.health || 0}%</span></>}
                    {mode === "contributors" && <><span style={{ color: "var(--ant-color-textTertiary)" }}>Score</span><span style={{ fontWeight: 700, color: (g.score?.total ?? 0) >= 60 ? "#21B573" : (g.score?.total ?? 0) >= 40 ? "#FFB020" : "#E5484D" }}>{g.score?.total ?? "—"}</span>
                    <span style={{ color: "var(--ant-color-textTertiary)" }}>MR замержено</span><span style={{ fontWeight: 600 }}>{g.mr?.merged || 0}</span>
                    <span style={{ color: "var(--ant-color-textTertiary)" }}>Deploy</span><span style={{ fontWeight: 600 }}>{g.score?.deploySuccessRate ?? 0}%</span></>}
                  </div>
                </Card>
              </Col>
            ))}
          </Row>

          {/* Comparison table */}
          <Card title="Сравнение метрик" size="small" style={{ marginBottom: 16 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--ant-color-border-secondary)" }}>
                  <th style={{ padding: "12px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ant-color-textSecondary)", background: "var(--ant-color-fill-secondary)", width: 200 }}>Метрика</th>
                  {groups.map((g: any, i: number) => (
                    <th key={g.tag} style={{ padding: "12px 12px", textAlign: "center", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ant-color-textSecondary)", background: "var(--ant-color-fill-secondary)", borderBottom: `3px solid ${GROUP_COLORS[i % GROUP_COLORS.length]}` }}>
                      <Tag style={{ background: GROUP_COLORS[i % GROUP_COLORS.length], color: "#fff", border: "none", fontSize: 11 }}>{g.tag}</Tag>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonTable.map((section) => (
                  <>
                    <tr key={`section-${section.section}`}>
                      <td colSpan={groups.length + 1} style={{ padding: "8px 12px 4px", fontSize: 11, fontWeight: 700, color: "var(--ant-color-textTertiary)", textTransform: "uppercase", letterSpacing: 0.5, background: "var(--ant-color-fill-secondary)" }}>
                        {section.section}
                      </td>
                    </tr>
                    {section.rows.map((row) => (
                      <MetricRow
                        key={`${section.section}-${row.label}`}
                        label={row.label}
                        values={groups.map((g: any) => ({
                          tag: g.tag,
                          value: row.key === "projects" ? g.projectCount : (g[row.key]?.[row.sub] ?? null),
                        }))}
                        format={row.format}
                        higherIsBetter={row.higher !== false}
                        unit={row.unit || ""}
                      />
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Top contributors per tag group */}
          {mode === "tags" && groups.some((g: any) => g.topContributors?.length > 0) && (
            <Row gutter={16}>
              {groups.map((g: any, i: number) => (
                <Col key={g.tag} span={Math.min(8, 24 / Math.max(groups.length, 1))}>
                  <Card title={<span><Tag style={{ background: GROUP_COLORS[i % GROUP_COLORS.length], color: "#fff", border: "none", fontSize: 11 }}>{g.tag}</Tag> Топ-3</span>}
                    size="small" style={{ height: "100%" }}>
                    {(g.topContributors || []).length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
                      <div>
                        {g.topContributors.map((c: any, j: number) => (
                          <div key={c.email} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0", borderBottom: j < g.topContributors.length - 1 ? "1px solid var(--ant-color-border-secondary)" : "none" }}>
                            <span style={{ fontWeight: j === 0 ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 150 }}>{c.name || c.email}</span>
                            <span style={{ color: "var(--ant-color-textSecondary)", fontSize: 11, flexShrink: 0 }}>{c.changes?.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </Col>
              ))}
            </Row>
          )}
        </>
      )}

      {!loading && groups.length === 0 && (
        <Empty description={mode === "tags" ? "Выберите теги для сравнения" : "Выберите контрибьюторов для сравнения"} style={{ marginTop: 40 }} />
      )}
    </div>
  );
}
