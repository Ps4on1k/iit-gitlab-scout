import { useState, useEffect, useMemo } from "react";
import { Card, Row, Col, Statistic, Spin, Tag, Empty } from "antd";
import { ProjectOutlined, TeamOutlined, BranchesOutlined, FireOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { Pie } from "@ant-design/charts";
import { fetchDashboard } from "../api/client";
import { formatContributorName } from "../utils/contributor";

const PIE_COLORS = ["#667eea", "#764ba2", "#f093fb", "#f5576c", "#4facfe", "#00f2fe", "#43e97b", "#fa709a", "#fee140", "#30cfd0"];

function donutConfig(data: { type: string; value: number }[], colors?: string[]) {
  return {
    data,
    angleField: "value",
    colorField: "type",
    radius: 0.9,
    innerRadius: 0.55,
    color: colors || PIE_COLORS,
    label: false as const,
    legend: { color: { position: "bottom", layout: { justifyContent: "center" }, itemLabelFontSize: 11 } },
    statistic: false,
    tooltip: { title: "type", items: [{ field: "value", name: "Значение" }] },
  };
}

export function Dashboard({ onContributorClick }: { onContributorClick?: (name: string) => void }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetchDashboard().then((r) => { if (r.ok) setData(r.data); setLoading(false); });
  }, []);

  if (loading) return <div style={{ textAlign: "center", padding: 80 }}><Spin size="large" /></div>;
  if (!data) return <Empty description="Ошибка загрузки" />;

  const { summary, topContributors, projectHealth, recentActivity, languageDistribution, branchStatusDistribution, branchesByProject } = data;
  const stalePct = summary.branches > 0 ? Math.round(summary.staleBranches / summary.branches * 100) : 0;
  const maxActivity = Math.max(1, ...recentActivity.map((a: any) => a.commits));

  const contributorsPie = topContributors.map((c: any) => ({ type: c.name || c.email, value: c.changes }));
  const langsPie = languageDistribution.map((l: any) => ({ type: l.language, value: l.percentage }));
  const branchesPie = branchStatusDistribution;

  return (
    <div style={{ width: "90%", margin: "0 auto" }}>
      <div style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", color: "white", padding: "30px 40px", borderRadius: "20px", marginBottom: 30 }}>
        <h1 style={{ fontSize: 28, marginBottom: 10 }}>Обзор</h1>
        <div style={{ opacity: 0.9, fontSize: 14 }}>Сводная статистика за последние 90 дней</div>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={4}><Card><Statistic title="Проектов" value={summary.projects} prefix={<ProjectOutlined />} /></Card></Col>
        <Col span={4}><Card><Statistic title="Контрибьюторов" value={summary.contributors} prefix={<TeamOutlined />} /></Card></Col>
        <Col span={4}><Card><Statistic title="Коммитов" value={summary.commits} prefix={<FireOutlined />} /></Card></Col>
        <Col span={4}><Card><Statistic title="Дней активности" value={summary.activeDays} /></Card></Col>
        <Col span={4}><Card><Statistic title="Активные ветки" value={summary.activeBranches} valueStyle={{ color: "#3f8600" }} prefix={<CheckCircleOutlined />} /></Card></Col>
        <Col span={4}><Card><Statistic title="Заброшенные" value={summary.staleBranches} valueStyle={{ color: stalePct > 50 ? "#cf1322" : "#d4b106" }} suffix={<span style={{ fontSize: 12, color: "#999" }}>({stalePct}%)</span>} /></Card></Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card title="Активность за 90 дней" size="small" style={{ height: "100%" }}>
            {recentActivity.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 0, height: 200, borderBottom: "1px solid #e0e0e0" }}>
                  {recentActivity.map((a: any) => {
                    const day = new Date(a.date).getDay();
                    const isWeekend = day === 0 || day === 6;
                    return (
                      <div key={a.date} title={`${a.date}: ${a.commits} коммитов`}
                        style={{ flex: 1, background: isWeekend ? "linear-gradient(180deg, #f093fb, #f5576c)" : "linear-gradient(180deg, #667eea, #764ba2)",
                          borderRadius: "2px 2px 0 0", height: `${(a.commits / maxActivity) * 100}%`, minHeight: a.commits > 0 ? 2 : 0, minWidth: 1, opacity: a.commits > 0 ? 1 : 0.3 }} />
                    );
                  })}
                </div>
                <div style={{ position: "relative", height: 20, marginTop: 4 }}>
                  {recentActivity.map((a: any, i: number) => {
                    const step = Math.max(1, Math.floor(recentActivity.length / 8));
                    const show = i === 0 || i % step === 0 || i === recentActivity.length - 1;
                    if (!show) return null;
                    const leftPct = (i / Math.max(1, recentActivity.length - 1)) * 100;
                    const [y, m, d] = a.date.split("-");
                    return <span key={a.date} style={{ position: "absolute", left: `${leftPct}%`, transform: "translateX(-50%)", fontSize: 9, color: "#999", whiteSpace: "nowrap" }}>{d}.{m}</span>;
                  })}
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 6, fontSize: 11, color: "#999" }}>
                  <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "linear-gradient(180deg, #667eea, #764ba2)", marginRight: 4, verticalAlign: "middle" }} />Рабочие дни</span>
                  <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "linear-gradient(180deg, #f093fb, #f5576c)", marginRight: 4, verticalAlign: "middle" }} />Выходные</span>
                </div>
              </div>
            )}
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Здоровье проектов (top 10)" size="small" style={{ height: "100%" }}>
            {projectHealth.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <div>
                {projectHealth.sort((a: any, b: any) => a.healthPct - b.healthPct).map((p: any) => (
                  <div key={p.label} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                      <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>{p.label}</span>
                      <span style={{ color: p.healthPct >= 70 ? "#3f8600" : p.healthPct >= 40 ? "#d4b106" : "#cf1322", fontWeight: 600 }}>{p.healthPct}%</span>
                    </div>
                    <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: "#f0f0f0" }}>
                      <div style={{ width: `${p.healthPct}%`, background: p.healthPct >= 70 ? "#3f8600" : p.healthPct >= 40 ? "#d4b106" : "#cf1322" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card title="Топ-10 контрибьюторов" size="small" style={{ height: "100%" }}>
            {contributorsPie.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <div style={{ height: 360 }}><Pie {...donutConfig(contributorsPie)} height={360} /></div>
            )}
          </Card>
        </Col>
        <Col span={8}>
          <Card title="Языки (top 10)" size="small" style={{ height: "100%" }}>
            {langsPie.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <div style={{ height: 360 }}><Pie {...donutConfig(langsPie)} height={360} /></div>
            )}
          </Card>
        </Col>
        <Col span={8}>
          <Card title="Статус веток" size="small" style={{ height: "100%" }}>
            {summary.branches === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <div style={{ height: 360 }}><Pie {...donutConfig(branchesPie, ["#3f8600", "#cf1322", "#667eea"])} height={360} /></div>
            )}
          </Card>
        </Col>
      </Row>

      <Card title="Ветки по проектам (top 10)" size="small" style={{ marginBottom: 16 }}>
        {branchesByProject.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
          <div>
            {branchesByProject.map((p: any) => (
              <div key={p.label} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                  <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 400 }}>{p.label}</span>
                  <span style={{ color: "var(--ant-color-text-secondary)", fontSize: 11 }}>{p.active} актив / {p.stale} заброш / {p.merged} мердж</span>
                </div>
                <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${(p.active / p.total) * 100}%`, background: "#3f8600" }} />
                  <div style={{ width: `${(p.stale / p.total) * 100}%`, background: "#cf1322" }} />
                  <div style={{ width: `${(p.merged / p.total) * 100}%`, background: "#667eea" }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
