import { useState, useEffect, useMemo } from "react";
import { DatePicker, Tag, Button, Input, Select, Modal, Typography, message } from "antd";
import { ReloadOutlined, CloseCircleFilled, ShareAltOutlined, CopyOutlined } from "@ant-design/icons";
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
  extraParams?: Record<string, string>;
}

const defaultFilters: GlobalFilters = {
  projectIds: [],
  tags: [],
  dateFrom: dayjs().subtract(90, "day").format("YYYY-MM-DD"),
  dateTo: dayjs().format("YYYY-MM-DD"),
  contributors: [],
};

export function GlobalFilterBar({ filters, onChange, userRole, userAllowedTags, extraParams }: Props) {
  const [allProjects, setAllProjects] = useState<ProjectConfig[]>([]);
  const [allContributors, setAllContributors] = useState<DbContributor[]>([]);
  const [shareOpen, setShareOpen] = useState(false);

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
      seen.set(c.author_email, name !== c.author_email ? name : c.author_email);
    }
    return seen;
  }, [allContributors]);

  const update = (patch: Partial<GlobalFilters>) => onChange({ ...filters, ...patch });

  const addTag = (tag: string) => {
    if (!filters.tags.includes(tag)) update({ tags: [...filters.tags, tag] });
  };
  const removeTag = (tag: string) => update({ tags: filters.tags.filter((t) => t !== tag) });

  const addProject = (id: number) => {
    if (!filters.projectIds.includes(id)) update({ projectIds: [...filters.projectIds, id] });
  };
  const removeProject = (id: number) => update({ projectIds: filters.projectIds.filter((p) => p !== id) });

  const addContributor = (email: string) => {
    if (!filters.contributors.includes(email)) update({ contributors: [...filters.contributors, email] });
  };
  const removeContributor = (email: string) => update({ contributors: filters.contributors.filter((e) => e !== email) });

  const hasActive = filters.tags.length > 0 || filters.projectIds.length > 0 || filters.contributors.length > 0;
  const totalActive = filters.tags.length + filters.projectIds.length + filters.contributors.length;

  const reset = () => onChange({ ...defaultFilters, dateFrom: dayjs().subtract(90, "day").format("YYYY-MM-DD"), dateTo: dayjs().format("YYYY-MM-DD") });

  return (
    <div style={{ borderRadius: 8, padding: "12px 16px", marginBottom: 16, border: "1px solid var(--ant-color-border-secondary)", background: "var(--ant-color-bg-container)" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "nowrap", marginBottom: hasActive ? 8 : 0 }}>
        <RangePicker
          value={filters.dateFrom && filters.dateTo ? [dayjs(filters.dateFrom), dayjs(filters.dateTo)] : null}
          onChange={(dates) => {
            if (!dates || !dates[0] || !dates[1]) {
              update({ dateFrom: "", dateTo: "" });
            } else {
              update({ dateFrom: dates[0].format("YYYY-MM-DD"), dateTo: dates[1].format("YYYY-MM-DD") });
            }
          }}
          style={{ flex: "0 0 auto" }}
        />

        <Select
          placeholder="Теги"
          allowClear showSearch optionFilterProp="label"
          style={{ flex: 1 }}
          value={null}
          onChange={(v) => { if (v) addTag(v); }}
          options={availableTags.filter((t) => !filters.tags.includes(t)).map((t) => ({ value: t, label: t }))}
        />

        <Select
          placeholder="Проекты"
          allowClear showSearch optionFilterProp="label"
          style={{ flex: 1 }}
          value={null}
          onChange={(v) => { if (v) addProject(v); }}
          options={projects.filter((p) => !filters.projectIds.includes(p.id)).map((p) => ({
            value: p.id,
            label: p.tags && p.tags.length > 0 ? `${p.label} [${p.tags.join(", ")}]` : p.label,
          }))}
        />

        <Select
          placeholder="Контрибьюторы"
          allowClear showSearch optionFilterProp="label"
          style={{ flex: 1 }}
          value={null}
          onChange={(v) => { if (v) addContributor(v); }}
          filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase())}
          options={Array.from(contributorMap.entries())
            .filter(([email]) => !filters.contributors.includes(email))
            .map(([email, name]) => ({ value: email, label: name !== email ? `${name} (${email})` : email }))}
        />

        <Button icon={<ReloadOutlined />} onClick={reset} style={{ flex: "0 0 auto" }}>Сбросить</Button>
        <Button icon={<ShareAltOutlined />} onClick={() => setShareOpen(true)} style={{ flex: "0 0 auto" }}>Share</Button>
        {hasActive && (
          <span style={{ fontSize: 12, color: "var(--ant-color-textTertiary)", flex: "0 0 auto" }}>{totalActive} активно</span>
        )}
      </div>

      {hasActive && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
          {filters.tags.map((tag) => {
            const c = getTagColor(tag);
            return (
              <Tag
                key={`tag-${tag}`}
                closable
                onClose={() => removeTag(tag)}
                closeIcon={<CloseCircleFilled style={{ color: c.text, opacity: 0.7 }} />}
                style={{ margin: 0, background: c.bg, color: c.text, border: "none", fontWeight: 500 }}
              >{tag}</Tag>
            );
          })}
          {filters.projectIds.map((id) => {
            const p = projects.find((pr) => pr.id === id);
            return (
              <Tag
                key={`proj-${id}`}
                closable
                onClose={() => removeProject(id)}
                closeIcon={<CloseCircleFilled style={{ color: "#fff", opacity: 0.7 }} />}
                style={{ margin: 0, background: "#667eea", color: "#fff", border: "none", fontWeight: 500 }}
              >{p?.label || `#${id}`}</Tag>
            );
          })}
          {filters.contributors.map((email) => {
            const name = contributorMap.get(email) || email;
            return (
              <Tag
                key={`contrib-${email}`}
                closable
                onClose={() => removeContributor(email)}
                closeIcon={<CloseCircleFilled style={{ color: "#fff", opacity: 0.7 }} />}
                style={{ margin: 0, background: "#722ed1", color: "#fff", border: "none", fontWeight: 500 }}
                title={email}
              >{name}</Tag>
            );
          })}
        </div>
      )}

      <Modal
        title="Поделиться ссылкой"
        open={shareOpen}
        onCancel={() => setShareOpen(false)}
        footer={[
          <Button key="copy" type="primary" icon={<CopyOutlined />} onClick={() => {
            const url = window.location.origin + window.location.pathname + window.location.search;
            navigator.clipboard.writeText(url).then(() => message.success("Скопировано в буфер обмена"));
          }}>Копировать</Button>,
        ]}
        width={600}
      >
        <Typography.Paragraph copyable style={{ fontFamily: "monospace", fontSize: 12, wordBreak: "break-all", padding: 12, background: "var(--ant-color-fill-secondary)", borderRadius: 8 }}>
          {window.location.origin + window.location.pathname + window.location.search}
        </Typography.Paragraph>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Ссылка содержит текущую вкладку, фильтры и даты. При открытии — восстанавливает вид.
          Доступ определяется ролью пользователя.
        </Typography.Text>
      </Modal>
    </div>
  );
}
