import { useState, useEffect } from "react";
import { Card, Row, Col, Statistic, Spin, Empty } from "antd";
import { ProjectOutlined, TeamOutlined, BranchesOutlined, FireOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { Pie } from "@ant-design/charts";
import { fetchDashboard } from "../api/client";

const PIE_COLORS = ["#667eea", "#764ba2", "#f093fb", "#f5576c", "#4facfe", "#00f2fe", "#43e97b", "#fa709a", "#fee140", "#30cfd0"];

function pieConfig(data: { type: string; value: number }[], colors?: string[]) {
  return {
    data,
    angleField: "value",
    colorField: "type",
    radius: 0.85,
    innerRadius: 0.55,
    color: colors || PIE_COLORS,
    label: {
      text: "type",
      style: { fontSize: 11 },
    },
    legend: { color: { position: "bottom", layout: { justifyContent: "center" } } },
    statistic: {
      title: { content: "", style: { fontSize: 0 } },
      content: { content: "", style: { fontSize: 0 } },
    },
    interaction: { tooltip: { marker: {} } },
  };
}

export function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetchDashboard().then((r) => { if (r.ok) setData(r.data); setLoading(false); });
  }, []);

  if (loading) return <div style={{ textAlign: "center", padding: 80 }}><Spin size="large" /></div>;
  if (!data) return <Empty description="Ошибка загрузки" />;

  const { summary, topContributors, topProjectsByCommits, topBranchesByProject, projectHealth, recentActivity, languageDistribution, branchStatusDistribution } = data;

  const stalePct = summary.branches > 0 ? Math.round(summary.staleBranches / summary.branches * 100) : 0;
  const maxActivity = Math.max(1, ...recentActivity.map((a: any) => a.commits));

  const contributorsPie = topContributors.map((c: any) => ({ type: c.name || c.email, value: c.changes }));
  const projectsPie = topProjectsByCommits.map((p: any) => ({ type: p.label, value: p.commits }));
  const langsPie = languageDistribution.map((l: any) => ({ type: l.language, value: l.percentage }));
  const branchesPie = branchStatusDistribution;

  return (
    <div style={{ width: "90%", margin: "0 auto" }}>
      <div style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", color: "white", padding: "30px 40px", borderRadius: "20px", marginBottom: 30 }}>
        <h1 style={{ fontSize: 28, marginBottom: 10 }}>Обзор</h1>
        <div style={{ opacity: 0.9, fontSize: 14 }}>Сводная статистика по всем проектам</div>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={4}><Card><Statistic title="Проектов" value={summary.projects} prefix={<ProjectOutlined />} /></Card></Col>
        <Col span={4}><Card><Statistic title="Контрибьюторов" value={summary.contributors} prefix={<TeamOutlined />} /></Card></Col>
        <Col span={4}><Card><Statistic title="Веток" value={summary.branches} prefix={<BranchesOutlined />} /></Card></Col>
        <Col span={4}><Card><Statistic title="Коммитов" value={summary.commits} prefix={<FireOutlined />} /></Card></Col>
        <Col span={4}><Card><Statistic title="Активные ветки" value={summary.activeBranches} valueStyle={{ color: "#3f8600" }} prefix={<CheckCircleOutlined />} /></Card></Col>
        <Col span={4}><Card><Statistic title="Заброшенные" value={summary.staleBranches} valueStyle={{ color: stalePct > 50 ? "#cf1322" : "#d4b106" }} suffix={<span style={{ fontSize: 12, color: "#999" }}>({stalePct}%)</span>} /></Card></Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={14}>
          <Card title="Активность за 30 дней" size="small" style={{ height: "100%" }}>
            {recentActivity.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 80 }}>
                {recentActivity.map((a: any) => (
                  <div key={a.date} title={`${a.date}: ${a.commits}`}
                    style={{ flex: 1, background: "linear-gradient(180deg, #667eea, #764ba2)", borderRadius: "2px 2px 0 0", height: `${(a.commits / maxActivity) * 100}%`, minWidth: 4 }} />
                ))}
              </div>
            )}
          </Card>
        </Col>
        <Col span={10}>
          <Card title="Статус веток" size="small" style={{ height: "100%" }}>
            {summary.branches === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <div style={{ height: 180 }}>
                <Pie {...pieConfig(branchesPie, ["#3f8600", "#cf1322", "#667eea"])} height={180} />
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card title="Топ-10 контрибьюторов" size="small" style={{ height: "100%" }}>
            {contributorsPie.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <div style={{ height: 260 }}>
                <Pie {...pieConfig(contributorsPie)} height={260} />
              </div>
            )}
          </Card>
        </Col>
        <Col span={8}>
          <Card title="Топ-10 проектов по коммитам" size="small" style={{ height: "100%" }}>
            {projectsPie.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <div style={{ height: 260 }}>
                <Pie {...pieConfig(projectsPie)} height={260} />
              </div>
            )}
          </Card>
        </Col>
        <Col span={8}>
          <Card title="Языки (top 10)" size="small" style={{ height: "100%" }}>
            {langsPie.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <div style={{ height: 260 }}>
                <Pie {...pieConfig(langsPie)} height={260} />
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card title="Здоровье проектов (top 10)" size="small">
            {projectHealth.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <div>
                {projectHealth.sort((a: any, b: any) => a.healthPct - b.healthPct).slice(0, 10).map((p: any) => (
                  <div key={p.label} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                      <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 250 }}>{p.label}</span>
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
        <Col span={12}>
          <Card title="Ветки по проектам (top 10)" size="small">
            {topBranchesByProject.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <div>
                {topBranchesByProject.map((p: any) => (
                  <div key={p.label} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                      <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 250 }}>{p.label}</span>
                      <span style={{ color: "#666", fontSize: 11 }}>{p.active} акт / {p.stale} забр / {p.merged} мердж</span>
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
        </Col>
      </Row>
    </div>
  );
}
