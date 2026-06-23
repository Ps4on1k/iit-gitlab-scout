import { useState, useEffect, useMemo } from "react";
import { Select, DatePicker, Tag, Row, Col, Button } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { fetchProjects, fetchContributorsList } from "../api/client";
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

  const projects = useMemo(() => {
    if (userRole === "admin" || !userAllowedTags || userAllowedTags.length === 0) return allProjects;
    return allProjects.filter((p) => !p.tag || userAllowedTags.includes(p.tag));
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
    for (const p of projects) { if (p.tag) tags.add(p.tag); }
    return Array.from(tags).sort().map((t) => ({ value: t, label: t }));
  }, [projects]);

  const contributorOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of allContributors) {
      const name = c.author_name || c.author_email;
      seen.set(c.author_email, name !== c.author_email ? `${name} (${c.author_email})` : c.author_email);
    }
    return Array.from(seen.entries()).map(([email, label]) => ({ value: email, label }));
  }, [allContributors]);

  const update = (patch: Partial<GlobalFilters>) => onChange({ ...filters, ...patch });

  return (
    <div style={{ borderRadius: 8, padding: "12px 16px", marginBottom: 16, border: "1px solid var(--ant-color-border-secondary)", background: "var(--ant-color-bg-container)" }}>
      <Row gutter={[12, 8]} align="middle">
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
            value={filters.dateFrom && filters.dateTo ? [dayjs(filters.dateFrom), dayjs(filters.dateTo)] : null}
            onChange={(dates) => {
              if (!dates || !dates[0] || !dates[1]) {
                update({ dateFrom: "", dateTo: "" });
              } else {
                update({ dateFrom: dates[0].format("YYYY-MM-DD"), dateTo: dates[1].format("YYYY-MM-DD") });
              }
            }}
            style={{ width: "100%" }}
          />
        </Col>
        <Col flex="auto" style={{ minWidth: 220, maxWidth: 350 }}>
          <Select mode="multiple" placeholder="Контрибьюторы" allowClear showSearch optionFilterProp="label"
            style={{ width: "100%" }} value={filters.contributors} onChange={(v) => update({ contributors: v })}
            options={contributorOptions}
            tagRender={({ label, closable, onClose }) => (
              <Tag closable={closable} onClose={onClose} style={{ marginRight: 3, background: "#667eea", color: "white", border: "none" }}>{label}</Tag>
            )}
            maxTagCount="responsive"
            filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase())}
          />
        </Col>
        <Col>
          <Button icon={<ReloadOutlined />} onClick={() => onChange({ ...defaultFilters, dateFrom: dayjs().subtract(90, "day").format("YYYY-MM-DD"), dateTo: dayjs().format("YYYY-MM-DD") })}>
            Сбросить
          </Button>
        </Col>
      </Row>
    </div>
  );
}
