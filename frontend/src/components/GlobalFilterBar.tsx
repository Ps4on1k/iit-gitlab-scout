import { useState, useEffect, useMemo } from "react";
import { Select, DatePicker, Input, Tag, Row, Col } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { fetchProjects, fetchContributorsList } from "../api/client";
import type { ProjectConfig, DbContributor, ContributorFilters } from "../types";
import type { Role } from "../types";

const { RangePicker } = DatePicker;

export interface GlobalFilters {
  projectIds: number[];
  tags: string[];
  dateFrom: string;
  dateTo: string;
  contributors: string[];
}

interface Props {
  userRole: Role;
  activeTab: string;
  filters: GlobalFilters;
  onChange: (filters: GlobalFilters) => void;
}

export function GlobalFilterBar({ userRole, activeTab, filters, onChange }: Props) {
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [allContributorNames, setAllContributorNames] = useState<string[]>([]);

  useEffect(() => {
    fetchProjects().then((r) => { if (r.ok) setProjects(r.data!); });
  }, []);

  useEffect(() => {
    const fc: ContributorFilters = {
      project_ids: filters.projectIds.length > 0 ? filters.projectIds : undefined,
      date_from: filters.dateFrom,
      date_to: filters.dateTo,
    };
    fetchContributorsList(fc).then((r) => {
      if (r.ok) {
        const names = [...new Set(r.data!.map((c: DbContributor) => c.author_name || c.author_email).filter(Boolean))].sort();
        setAllContributorNames(names);
      }
    });
  }, [filters.projectIds, filters.dateFrom, filters.dateTo]);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    for (const p of projects) { if (p.tag) tags.add(p.tag); }
    return Array.from(tags).sort().map((t) => ({ value: t, label: t }));
  }, [projects]);

  const update = (patch: Partial<GlobalFilters>) => onChange({ ...filters, ...patch });

  if (activeTab === "settings") return null;

  return (
    <div style={{ background: "white", borderRadius: 8, padding: "12px 16px", marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
      <Row gutter={[12, 8]} align="middle">
        {activeTab !== "dashboard" && (
          <>
            <Col flex="auto" style={{ minWidth: 250, maxWidth: 400 }}>
              <Select mode="multiple" placeholder="Проекты" allowClear showSearch optionFilterProp="label"
                style={{ width: "100%" }} value={filters.projectIds} onChange={(v) => update({ projectIds: v })}
                options={projects.map((p) => ({ value: p.id, label: p.tag ? `${p.label} [${p.tag}]` : p.label }))}
                tagRender={({ label, closable, onClose }) => (
                  <Tag closable={closable} onClose={onClose} style={{ marginRight: 3, background: "#667eea", color: "white", border: "none" }}>{label}</Tag>
                )}
                maxTagCount="responsive" />
            </Col>
            <Col flex="auto" style={{ minWidth: 160, maxWidth: 250 }}>
              <Select mode="multiple" placeholder="Теги" allowClear style={{ width: "100%" }}
                value={filters.tags} onChange={(v) => update({ tags: v })}
                options={availableTags}
                tagRender={({ label, closable, onClose }) => (
                  <Tag closable={closable} onClose={onClose} style={{ marginRight: 3, background: "#1677ff", color: "white", border: "none" }}>{label}</Tag>
                )}
                maxTagCount="responsive" />
            </Col>
            <Col flex="auto" style={{ minWidth: 220, maxWidth: 300 }}>
              <RangePicker
                value={[dayjs(filters.dateFrom), dayjs(filters.dateTo)]}
                onChange={(dates) => update({
                  dateFrom: dates?.[0]?.format("YYYY-MM-DD") || dayjs().subtract(90, "day").format("YYYY-MM-DD"),
                  dateTo: dates?.[1]?.format("YYYY-MM-DD") || dayjs().format("YYYY-MM-DD"),
                })}
                style={{ width: "100%" }}
              />
            </Col>
            {(activeTab === "contributors" || activeTab === "activity" || activeTab === "branches") && (
              <Col flex="auto" style={{ minWidth: 220, maxWidth: 350 }}>
                <Select mode="multiple" placeholder="Контрибьюторы" allowClear showSearch optionFilterProp="label"
                  style={{ width: "100%" }} value={filters.contributors} onChange={(v) => update({ contributors: v })}
                  options={allContributorNames.map((n) => ({ value: n, label: n }))}
                  tagRender={({ label, closable, onClose }) => (
                    <Tag closable={closable} onClose={onClose} style={{ marginRight: 3, background: "#667eea", color: "white", border: "none" }}>{label}</Tag>
                  )}
                  maxTagCount="responsive"
                  filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase())}
                />
              </Col>
            )}
          </>
        )}
      </Row>
    </div>
  );
}
