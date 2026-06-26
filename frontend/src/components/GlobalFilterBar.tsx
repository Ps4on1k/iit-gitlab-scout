import { useState, useEffect, useMemo } from "react";
import { DatePicker, Tag, Row, Col, Button, Input, Space, Tooltip } from "antd";
import { ReloadOutlined, CloseOutlined, SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { fetchProjects, fetchContributorsList } from "../api/client";
import { getTagColor } from "../utils/tagColors";
import type { ProjectConfig, DbContributor, ContributorFilters } from "../types";

const { RangePicker } = DatePicker;

export interface GlobalFilters {
  projectIds: number[];
  tags: string[];
  dateFrom: string;
  dateTo: string;
  contributors: string[];
}

interface Props {
  filters: GlobalFilters;
  onChange: (filters: GlobalFilters) => void;
  userRole?: string;
  userAllowedTags?: string[];
}

const defaultFilters: GlobalFilters = {
  projectIds: [],
  tags: [],
  dateFrom: dayjs().subtract(90, "day").format("YYYY-MM-DD"),
  dateTo: dayjs().format("YYYY-MM-DD"),
  contributors: [],
};

export function GlobalFilterBar({ filters, onChange, userRole, userAllowedTags }: Props) {
  const [allProjects, setAllProjects] = useState<ProjectConfig[]>([]);
  const [allContributors, setAllContributors] = useState<DbContributor[]>([]);
  const [projectSearch, setProjectSearch] = useState("");
  const [contributorSearch, setContributorSearch] = useState("");

  const projects = useMemo(() => {
    if (userRole === "admin" || !userAllowedTags || userAllowedTags.length === 0) return allProjects;
    return allProjects.filter((p) => p.tags && p.tags.some((t) => userAllowedTags.includes(t)));
  }, [allProjects, userRole, userAllowedTags]);

  useEffect(() => {
    fetchProjects().then((r) => { if (r.ok) setAllProjects(r.data!); });
  }, []);

  useEffect(() => {
    const fc: ContributorFilters = {
      project_ids: filters.projectIds.length > 0 ? filters.projectIds : undefined,
      date_from: filters.dateFrom,
      date_to: filters.dateTo,
    };
    fetchContributorsList(fc).then((r) => {
      if (r.ok) setAllContributors(r.data!);
    });
  }, [filters.projectIds, filters.dateFrom, filters.dateTo]);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    for (const p of projects) { if (p.tags) p.tags.forEach((t) => tags.add(t)); }
    return Array.from(tags).sort();
  }, [projects]);

  const contributorMap = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of allContributors) {
      const name = c.author_name || c.author_email;
      seen.set(c.author_email, name !== c.author_email ? `${name}` : c.author_email);
    }
    return seen;
  }, [allContributors]);

  const filteredProjects = useMemo(() => {
    if (!projectSearch) return projects;
    const q = projectSearch.toLowerCase();
    return projects.filter((p) => p.label.toLowerCase().includes(q) || p.path.toLowerCase().includes(q) || p.tags?.some((t) => t.toLowerCase().includes(q)));
  }, [projects, projectSearch]);

  const filteredContributors = useMemo(() => {
    const entries = Array.from(contributorMap.entries());
    if (!contributorSearch) return entries;
    const q = contributorSearch.toLowerCase();
    return entries.filter(([email, name]) => email.toLowerCase().includes(q) || name.toLowerCase().includes(q));
  }, [contributorMap, contributorSearch]);

  const update = (patch: Partial<GlobalFilters>) => onChange({ ...filters, ...patch });

  const toggleTag = (tag: string) => {
    const next = filters.tags.includes(tag) ? filters.tags.filter((t) => t !== tag) : [...filters.tags, tag];
    update({ tags: next });
  };

  const toggleProject = (id: number) => {
    const next = filters.projectIds.includes(id) ? filters.projectIds.filter((p) => p !== id) : [...filters.projectIds, id];
    update({ projectIds: next });
  };

  const toggleContributor = (email: string) => {
    const next = filters.contributors.includes(email) ? filters.contributors.filter((e) => e !== email) : [...filters.contributors, email];
    update({ contributors: next });
  };

  const hasActiveFilters = filters.tags.length > 0 || filters.projectIds.length > 0 || filters.contributors.length > 0;

  return (
    <div style={{ borderRadius: 8, padding: "12px 16px", marginBottom: 16, border: "1px solid var(--ant-color-border-secondary)", background: "var(--ant-color-bg-container)" }}>
      <div style={{ marginBottom: 8 }}>
        <RangePicker
          value={filters.dateFrom && filters.dateTo ? [dayjs(filters.dateFrom), dayjs(filters.dateTo)] : null}
          onChange={(dates) => {
            if (!dates || !dates[0] || !dates[1]) {
              update({ dateFrom: "", dateTo: "" });
            } else {
              update({ dateFrom: dates[0].format("YYYY-MM-DD"), dateTo: dates[1].format("YYYY-MM-DD") });
            }
          }}
          style={{ width: 280 }}
        />
        <Button icon={<ReloadOutlined />} style={{ marginLeft: 8 }} onClick={() => onChange({ ...defaultFilters, dateFrom: dayjs().subtract(90, "day").format("YYYY-MM-DD"), dateTo: dayjs().format("YYYY-MM-DD") })}>
          Сбросить
        </Button>
        {hasActiveFilters && (
          <span style={{ marginLeft: 8, fontSize: 12, color: "var(--ant-color-textTertiary)" }}>
            {filters.tags.length + filters.projectIds.length + filters.contributors.length} фильтр(ов) активно
          </span>
        )}
      </div>

      {availableTags.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: "var(--ant-color-textTertiary)", marginBottom: 4 }}>Теги</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {availableTags.map((tag) => {
              const active = filters.tags.includes(tag);
              const c = getTagColor(tag);
              return (
                <Tag
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  style={{
                    cursor: "pointer", margin: 0,
                    background: active ? c.bg : "var(--ant-color-fill-secondary)",
                    color: active ? c.text : "var(--ant-color-text)",
                    border: active ? `1px solid ${c.bg}` : "1px solid var(--ant-color-border-secondary)",
                    fontWeight: active ? 600 : 400,
                    opacity: active ? 1 : 0.75,
                    transition: "all 0.15s",
                  }}
                >{tag}</Tag>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: "var(--ant-color-textTertiary)", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
            Проекты
            {filters.projectIds.length > 0 && (
              <Tag closable onClose={(e) => { e.stopPropagation(); update({ projectIds: [] }); }} style={{ margin: 0, fontSize: 10, lineHeight: "16px", padding: "0 4px" }}>
                Очистить ({filters.projectIds.length})
              </Tag>
            )}
          </div>
          <Input
            prefix={<SearchOutlined style={{ color: "var(--ant-color-textTertiary)" }} />}
            placeholder="Поиск проекта..."
            allowClear size="small" value={projectSearch} onChange={(e) => setProjectSearch(e.target.value)}
            style={{ marginBottom: 4 }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, maxHeight: 60, overflowY: "auto" }}>
            {filteredProjects.slice(0, 30).map((p) => {
              const active = filters.projectIds.includes(p.id);
              return (
                <Tag
                  key={p.id}
                  onClick={() => toggleProject(p.id)}
                  style={{
                    cursor: "pointer", margin: 0, fontSize: 11,
                    background: active ? "#667eea" : "var(--ant-color-fill-secondary)",
                    color: active ? "#fff" : "var(--ant-color-text)",
                    border: active ? "1px solid #667eea" : "1px solid var(--ant-color-border-secondary)",
                    fontWeight: active ? 600 : 400,
                    transition: "all 0.15s",
                  }}
                >{p.label}</Tag>
              );
            })}
            {filteredProjects.length > 30 && <span style={{ fontSize: 11, color: "var(--ant-color-textTertiary)", alignSelf: "center" }}>+{filteredProjects.length - 30}</span>}
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: "var(--ant-color-textTertiary)", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
            Контрибьюторы
            {filters.contributors.length > 0 && (
              <Tag closable onClose={(e) => { e.stopPropagation(); update({ contributors: [] }); }} style={{ margin: 0, fontSize: 10, lineHeight: "16px", padding: "0 4px" }}>
                Очистить ({filters.contributors.length})
              </Tag>
            )}
          </div>
          <Input
            prefix={<SearchOutlined style={{ color: "var(--ant-color-textTertiary)" }} />}
            placeholder="Поиск контрибьютора..."
            allowClear size="small" value={contributorSearch} onChange={(e) => setContributorSearch(e.target.value)}
            style={{ marginBottom: 4 }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, maxHeight: 60, overflowY: "auto" }}>
            {filteredContributors.slice(0, 30).map(([email, name]) => {
              const active = filters.contributors.includes(email);
              return (
                <Tooltip key={email} title={email}>
                  <Tag
                    onClick={() => toggleContributor(email)}
                    style={{
                      cursor: "pointer", margin: 0, fontSize: 11,
                      background: active ? "#722ed1" : "var(--ant-color-fill-secondary)",
                      color: active ? "#fff" : "var(--ant-color-text)",
                      border: active ? "1px solid #722ed1" : "1px solid var(--ant-color-border-secondary)",
                      fontWeight: active ? 600 : 400,
                      transition: "all 0.15s",
                    }}
                  >{name}</Tag>
                </Tooltip>
              );
            })}
            {filteredContributors.length > 30 && <span style={{ fontSize: 11, color: "var(--ant-color-textTertiary)", alignSelf: "center" }}>+{filteredContributors.length - 30}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
