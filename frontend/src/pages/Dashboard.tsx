import { useState, useEffect } from "react";
import { Card, Row, Col, Statistic, Spin, Tag, Empty, Progress } from "antd";
import { ProjectOutlined, TeamOutlined, BranchesOutlined, FireOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { fetchDashboard } from "../api/client";

const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178c6", JavaScript: "#f7df1e", Python: "#3572A5", Java: "#b07219",
  Go: "#00ADD8", Rust: "#dea584", Ruby: "#701516", PHP: "#4F5D95",
  Shell: "#89e051", CSS: "#563d7c", HTML: "#e34c26", Dart: "#00B4AB",
  Kotlin: "#A97BFF", Swift: "#F05138", C: "#555555", "C++": "#f34b7d",
  "C#": "#178600", Scala: "#c22d41", Vue: "#41b883", SCSS: "#c6538c",
  Dockerfile: "#384d54", Makefile: "#427819",
};

function getLangColor(lang: string): string {
  return LANG_COLORS[lang] || `hsl(${(lang.charCodeAt(0) * 37) % 360}, 60%, 50%)`;
}

export function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetchDashboard().then((r) => {
      if (r.ok) setData(r.data);
      setLoading(false);
    });
  }, []);

  if (loading) return <div style={{ textAlign: "center", padding: 80 }}><Spin size="large" /></div>;
  if (!data) return <Empty description="Ошибка загрузки" />;

  const { summary, topContributors, projectHealth, recentActivity, languageDistribution } = data;

  const stalePct = summary.branches > 0 ? Math.round(summary.staleBranches / summary.branches * 100) : 0;

  const maxActivity = Math.max(1, ...recentActivity.map((a: any) => a.commits));

  return (
    <div style={{ width: "90%", margin: "0 auto" }}>
      <div style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", color: "white", padding: "30px 40px", borderRadius: "20px", marginBottom: 30 }}>
        <h1 style={{ fontSize: 28, marginBottom: 10 }}>Обзор</h1>
        <div style={{ opacity: 0.9, fontSize: 14 }}>Сводная статистика по всем проектам</div>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={4}>
          <Card><Statistic title="Проектов" value={summary.projects} prefix={<ProjectOutlined />} /></Card>
        </Col>
        <Col span={4}>
          <Card><Statistic title="Контрибьюторов" value={summary.contributors} prefix={<TeamOutlined />} /></Card>
        </Col>
        <Col span={4}>
          <Card><Statistic title="Веток" value={summary.branches} prefix={<BranchesOutlined />} /></Card>
        </Col>
        <Col span={4}>
          <Card><Statistic title="Коммитов" value={summary.commits} prefix={<FireOutlined />} /></Card>
        </Col>
        <Col span={4}>
          <Card><Statistic title="Активные ветки" value={summary.activeBranches} valueStyle={{ color: "#3f8600" }} prefix={<CheckCircleOutlined />} /></Card>
        </Col>
        <Col span={4}>
          <Card><Statistic title="Заброшенные ветки" value={summary.staleBranches} valueStyle={{ color: stalePct > 50 ? "#cf1322" : "#d4b106" }} suffix={<span style={{ fontSize: 12, color: "#999" }}>({stalePct}%)</span>} /></Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={14}>
          <Card title="Активность за 30 дней" size="small">
            {recentActivity.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Нет данных" /> : (
              <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 80 }}>
                {recentActivity.map((a: any) => (
                  <div key={a.date} title={`${a.date}: ${a.commits} коммитов`}
                    style={{ flex: 1, background: "#667eea", borderRadius: "2px 2px 0 0", height: `${(a.commits / maxActivity) * 100}%`, minWidth: 4, cursor: "default" }} />
                ))}
              </div>
            )}
          </Card>
        </Col>
        <Col span={10}>
          <Card title="Языки" size="small">
            {languageDistribution.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Нет данных" /> : (
              <div>
                <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
                  {languageDistribution.map((l: any) => (
                    <div key={l.language} title={`${l.language}: ${l.percentage}%`}
                      style={{ width: `${l.percentage}%`, background: getLangColor(l.language) }} />
                  ))}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {languageDistribution.map((l: any) => (
                    <Tag key={l.language} style={{ fontSize: 11, margin: 0 }}>
                      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: getLangColor(l.language), marginRight: 4 }} />
                      {l.language} {l.percentage}%
                    </Tag>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={12}>
          <Card title="Здоровье проектов" size="small">
            {projectHealth.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <div>
                {projectHealth.sort((a: any, b: any) => a.healthPct - b.healthPct).map((p: any) => (
                  <div key={p.label} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                      <span style={{ fontWeight: 500 }}>{p.label}{p.tag && <Tag style={{ marginLeft: 6, fontSize: 10 }}>{p.tag}</Tag>}</span>
                      <span style={{ color: p.healthPct >= 70 ? "#3f8600" : p.healthPct >= 40 ? "#d4b106" : "#cf1322" }}>{p.healthPct}%</span>
                    </div>
                    <Progress
                      percent={p.healthPct}
                      showInfo={false}
                      strokeColor={p.healthPct >= 70 ? "#3f8600" : p.healthPct >= 40 ? "#d4b106" : "#cf1322"}
                      trailColor="#f0f0f0"
                      size="small"
                    />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Топ контрибьюторов" size="small">
            {topContributors.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <div>
                {topContributors.map((c: any, i: number) => {
                  const maxChanges = topContributors[0]?.changes || 1;
                  return (
                    <div key={c.email} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, fontSize: 13 }}>
                      <span style={{ width: 20, textAlign: "center", fontWeight: 700, color: i === 0 ? "#faad14" : i === 1 ? "#8c8c8c" : i === 2 ? "#d48806" : "#999", fontSize: 12 }}>
                        {i < 3 ? ["★", "●", "◆"][i] : `${i + 1}`}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: 12 }}>{c.name || c.email}</div>
                        <div style={{ fontSize: 11, color: "#999" }}>{c.commits} коммитов</div>
                      </div>
                      <div style={{ width: 100 }}>
                        <div style={{ height: 6, borderRadius: 3, background: "#f0f0f0", overflow: "hidden" }}>
                          <div style={{ width: `${(c.changes / maxChanges) * 100}%`, height: "100%", background: "#667eea", borderRadius: 3 }} />
                        </div>
                      </div>
                      <span style={{ fontSize: 11, color: "#666", width: 50, textAlign: "right" }}>{c.changes.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
