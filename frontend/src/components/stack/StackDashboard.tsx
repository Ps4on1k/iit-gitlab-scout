import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { Select, Button, message, Tag, Card, Row, Col, Statistic, Table, Empty, Spin } from "antd";
import { DatabaseOutlined, ReloadOutlined } from "@ant-design/icons";
import { fetchProjects } from "../../api/client";
import { ProjectLabel } from "../common/ProjectLabel";
import { collectStack, fetchLanguageSummary, fetchLanguages } from "../../api/stack-client";
import { getTagColor } from "../../utils/tagColors";
import { delay } from "../../utils/collect";
import { CollectButton } from "../common/CollectButton";
import type { ProjectConfig } from "../../types";
import type { LanguageSummary, StackFilters } from "../../types/stack";
import type { Role } from "../../types";

interface Props { userRole: Role; }

const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178c6", JavaScript: "#f7df1e", Python: "#3572A5", Java: "#b07219",
  Go: "#00ADD8", Rust: "#dea584", Ruby: "#701516", PHP: "#4F5D95",
  Shell: "#89e051", CSS: "#563d7c", HTML: "#e34c26", Dart: "#00B4AB",
  Kotlin: "#A97BFF", Swift: "#F05138", C: "#555555", "C++": "#f34b7d",
  "C#": "#178600", Scala: "#c22d41", Vue: "#41b883", SCSS: "#c6538c",
  Dockerfile: "#384d54", Makefile: "#427819", Jupyter: "#DA5B0B",
};

function getLangColor(lang: string): string {
  return LANG_COLORS[lang] || `hsl(${(lang.charCodeAt(0) * 37) % 360}, 60%, 50%)`;
}

export const StackDashboard = memo(function StackDashboard({ userRole }: Props) {
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [languages, setLanguages] = useState<LanguageSummary[]>([]);
  const [allLanguages, setAllLanguages] = useState<string[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);

  useEffect(() => {
    fetchProjects().then((res) => { if (res.ok) setProjects(res.data!); });
  }, []);

  const filters = useMemo((): StackFilters => ({
    project_ids: selectedProjectIds.length > 0 ? selectedProjectIds : undefined,
    tag: selectedTags.length > 0 ? selectedTags : undefined,
    language: selectedLanguages.length > 0 ? selectedLanguages : undefined,
  }), [selectedProjectIds, selectedTags, selectedLanguages]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [lRes, allRes] = await Promise.all([
        fetchLanguageSummary(filters),
        fetchLanguages(),
      ]);
      if (lRes.ok) setLanguages(lRes.data!);
      if (allRes.ok) {
        const langs = new Set<string>();
        for (const l of allRes.data!) langs.add(l.language);
        setAllLanguages(Array.from(langs).sort());
      }
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { loadData(); }, [loadData]);

  const stackProjectIds = useMemo(() => {
    if (selectedProjectIds.length > 0) return selectedProjectIds;
    if (selectedTags.length > 0) {
      return projects.filter((p) => p.tags?.some((t) => selectedTags.includes(t))).map((p) => p.id);
    }
    return projects.map((p) => p.id);
  }, [selectedProjectIds, selectedTags, projects]);

  const projectOptions = useMemo(() =>
    projects.map((p) => ({ value: p.id, label: p.tags?.length ? `${p.label} [${p.tags.join(", ")}]` : p.label })),
    [projects]
  );

  const tagOptions = useMemo(() => {
    const tags = new Set<string>();
    for (const p of projects) { if (p.tags) p.tags?.forEach((t) => tags.add(t)); }
    return Array.from(tags).sort().map((t) => ({ value: t, label: t }));
  }, [projects]);

  const languageOptions = useMemo(() =>
    allLanguages.map((l) => ({ value: l, label: l })),
    [allLanguages]
  );

  return (
    <div style={{ width: "90%", margin: "0 auto", position: "relative", zIndex: 2 }}>
      <div style={{ background: "linear-gradient(135deg, #98C8D8 0%, #8BAADB 100%)", color: "#111315", padding: "14px 24px", borderRadius: "12px", marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, marginBottom: 4 }}>Языки программирования</h1>
        <div style={{ opacity: 0.9, fontSize: 13 }}>Состав технологического стека проектов</div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
        <Select mode="multiple" placeholder="Проекты" allowClear showSearch optionFilterProp="label"
          style={{ minWidth: 360, maxWidth: 600 }} value={selectedProjectIds} onChange={setSelectedProjectIds}
          options={projectOptions}
          tagRender={({ label, closable, onClose }) => {
            const tagText = String(label);
            const tagMatch = tagText.match(/\[(.+)\]$/);
            const tagVal = tagMatch ? tagMatch[1] : "";
            const c = tagVal ? getTagColor(tagVal) : { bg: "#42D9C8", text: "#fff" };
            return <Tag closable={closable} onClose={onClose} style={{ marginRight: 3, background: c.bg, color: c.text, border: "none" }}>{label}</Tag>;
          }}
          maxTagCount="responsive" />
        {tagOptions.length > 0 && (
          <Select mode="multiple" placeholder="Теги" allowClear style={{ minWidth: 180 }}
            value={selectedTags} onChange={setSelectedTags} options={tagOptions}
            tagRender={({ label, closable, onClose }) => <Tag closable={closable} onClose={onClose} style={{ marginRight: 3, background: "#3A8DFF", color: "white", border: "none" }}>{label}</Tag>} />
        )}
        {languageOptions.length > 0 && (
          <Select mode="multiple" placeholder="Языки" allowClear showSearch optionFilterProp="label"
            style={{ minWidth: 180, maxWidth: 300 }} value={selectedLanguages} onChange={setSelectedLanguages}
            options={languageOptions}
            tagRender={({ label, closable, onClose }) => {
              const c = getLangColor(String(label));
              return <Tag closable={closable} onClose={onClose} style={{ marginRight: 3, background: c, color: "#fff", border: "none" }}>{label}</Tag>;
            }}
            maxTagCount="responsive" />
        )}
        {userRole === "admin" && <CollectButton collector="stack" projectIds={stackProjectIds} onComplete={loadData} color="#98C8D8" label="Собрать стек" />}
        <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>Обновить</Button>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}><Card><Statistic title="Языков" value={languages.length} /></Card></Col>
        <Col span={8}><Card><Statistic title="Проектов" value={selectedProjectIds.length || projects.length} /></Card></Col>
      </Row>

      {/* Overall language bar */}
      <Card title="Соотношение языков (общее)" style={{ marginBottom: 24 }}>
        {loading ? <div style={{ textAlign: "center", padding: 40 }}><Spin size="large" /></div> : (
          languages.length > 0 ? (
            <div>
              <div style={{ display: "flex", height: 48, borderRadius: 4, overflow: "hidden", border: "1px solid var(--ant-color-border-secondary)" }}>
                {languages.map((l) => (
                  <div key={l.language} title={`${l.language}: ${l.percentage}%`}
                    style={{ width: `${l.percentage}%`, background: getLangColor(l.language), minWidth: l.percentage > 0 ? 2 : 0 }} />
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                {languages.map((l) => (
                  <Tag key={l.language} style={{ background: getLangColor(l.language), color: "#fff", border: "none", fontSize: 11 }}>
                    {l.language} {l.percentage}%
                  </Tag>
                ))}
              </div>
            </div>
          ) : <Empty description="Нет данных. Нажмите «Собрать стек»." />
        )}
      </Card>

      {/* Per-project language bars */}
      <ProjectLanguageDetails filters={filters} />
    </div>
  );
});

function ProjectLanguageDetails({ filters }: { filters: StackFilters }) {
  const [loading, setLoading] = useState(false);
  const [languages, setLanguages] = useState<any[]>([]);
  const [projects, setProjects] = useState<ProjectConfig[]>([]);

  useEffect(() => {
    import("../../api/client").then(({ fetchProjects }) =>
      fetchProjects().then((res) => { if (res.ok) setProjects(res.data!); })
    );
  }, []);

  useEffect(() => {
    setLoading(true);
    import("../../api/stack-client").then(({ fetchLanguages }) =>
      fetchLanguages(filters).then((res) => {
        if (res.ok) setLanguages(res.data!);
        setLoading(false);
      })
    );
  }, [filters]);

  const projectStats = useMemo(() => {
    const map = new Map<number, { path: string; label: string; tag: string; languages: any[] }>();
    for (const lang of languages) {
      let entry = map.get(lang.project_id);
      if (!entry) {
        entry = { path: lang.project_path, label: lang.project_label, tag: Array.isArray(lang.project_tags) ? lang.project_tags.join(", ") : (lang.project_tags || ""), languages: [] };
        map.set(lang.project_id, entry);
      }
      entry.languages.push(lang);
    }
    return Array.from(map.values());
  }, [languages]);

  const projectMap = useMemo(() => {
    const m = new Map<string, ProjectConfig>();
    for (const p of projects) m.set(p.label, p);
    return m;
  }, [projects]);

  return (
    <Card title="Языки по проектам" style={{ marginTop: 16 }}>
      {loading ? <Spin /> : projectStats.length === 0 ? <Empty description="Нет данных" /> : (
        <div>
          {projectStats.map((proj) => (
            <div key={proj.path} style={{ marginBottom: 16, padding: "12px 0", borderBottom: "1px solid var(--ant-color-border-secondary)" }}>
              <div style={{ marginBottom: 6 }}>
                {Array.isArray(proj.tag) ? proj.tag.map((t: string) => <Tag key={t} style={{ background: getTagColor(t).bg, color: getTagColor(t).text, border: "none", marginRight: 4, fontSize: 11 }}>{t}</Tag>) : proj.tag && <Tag style={{ background: getTagColor(proj.tag).bg, color: getTagColor(proj.tag).text, border: "none", marginRight: 6 }}>{proj.tag}</Tag>}
                <span style={{ fontWeight: 600, fontSize: 18 }}><ProjectLabel label={proj.label} description={projectMap.get(proj.label)?.description} /></span>
                <span style={{ fontSize: 11, color: "var(--ant-color-textTertiary)", marginLeft: 8 }}>{proj.path}</span>
              </div>
              <div style={{ display: "flex", height: 20, borderRadius: 4, overflow: "hidden", border: "1px solid var(--ant-color-border-secondary)" }}>
                {proj.languages.map((l: any) => (
                  <div key={l.language} title={`${l.language}: ${l.percentage}%`}
                    style={{ width: `${l.percentage}%`, background: getLangColor(l.language), minWidth: l.percentage > 0 ? 2 : 0 }} />
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                {proj.languages.map((l: any) => (
                  <Tag key={l.language} style={{ background: getLangColor(l.language), color: "#fff", border: "none", fontSize: 11 }}>
                    {l.language} {l.percentage}%
                  </Tag>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
