import { useMemo, useEffect, useRef, useState } from "react";
import { Empty, Collapse, Tag, Popover } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";
import { getTagColor } from "../../utils/tagColors";

interface HeatmapItem {
  name: string;
  tag?: string;
  data: number[];
  total: number;
}

interface Props {
  byProject: Record<string, Record<string, number>>;
  byContributor: Record<string, Record<string, number>>;
  loading: boolean;
  projectTags?: Record<string, string>;
  projectDescriptions?: Record<string, string>;
}

function getAllDates(data: Record<string, Record<string, number>>): string[] {
  const dates = new Set<string>();
  for (const daily of Object.values(data)) {
    for (const d of Object.keys(daily)) dates.add(d);
  }
  return Array.from(dates).sort();
}

function generateFullDateRange(dates: string[]): string[] {
  if (dates.length === 0) return [];
  const start = new Date(dates[0]);
  const end = new Date(dates[dates.length - 1]);
  const all: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    all.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return all;
}

function prepareHeatmapData(
  data: Record<string, Record<string, number>>,
  allDates: string[],
  tags?: Record<string, string>,
  topN = 30
): HeatmapItem[] {
  const items: HeatmapItem[] = [];
  for (const [name, daily] of Object.entries(data)) {
    const total = Object.values(daily).reduce((s, v) => s + v, 0);
    const arr = allDates.map((d) => daily[d] || 0);
    items.push({ name, tag: tags?.[name], data: arr, total });
  }
  items.sort((a, b) => b.total - a.total);
  return items.slice(0, topN);
}

function getActivityLevel(count: number, globalMax: number) {
  if (count === 0 || globalMax === 0) return 0;
  const pct = count / globalMax;
  if (pct <= 0.25) return 1;
  if (pct <= 0.5) return 2;
  if (pct <= 0.75) return 3;
  return 4;
}

const CELL_SIZE = 14;
const CELL_GAP = 3;
const CELLS_PER_ROW = 30;
const DATE_LABEL_WIDTH = 65;
const CELL_STRIDE = CELL_SIZE + CELL_GAP;
const EST_COL_WIDTH = DATE_LABEL_WIDTH * 2 + CELLS_PER_ROW * CELL_STRIDE + 12;

function HeatmapGrid({ items, allDates, projectDescriptions }: { items: HeatmapItem[]; allDates: string[]; projectDescriptions?: Record<string, string> }) {
  const globalMax = useMemo(() => Math.max(1, ...items.flatMap((i) => i.data)), [items]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(2);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const calc = () => {
      const w = el.clientWidth;
      if (w > 0) setCols(Math.max(1, Math.floor(w / EST_COL_WIDTH)));
    };

    calc();
    const t1 = setTimeout(calc, 200);
    const t2 = setTimeout(calc, 500);

    const ro = new ResizeObserver(() => calc());
    ro.observe(el);
    window.addEventListener("resize", calc);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      ro.disconnect();
      window.removeEventListener("resize", calc);
    };
  }, [items.length]);

  if (items.length === 0) return <p style={{ textAlign: "center", color: "#999" }}>Нет данных</p>;

  const columns: HeatmapItem[][] = Array.from({ length: cols }, () => []);
  items.forEach((item, i) => { columns[i % cols].push(item); });

  return (
    <div ref={containerRef} style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 24 }}>
      {columns.map((col, colIdx) => (
        <div key={colIdx}>
          {col.map((item) => (
            <div key={item.name} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 14, color: "#333", marginBottom: 4, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.name}>
                {item.tag && (() => { const c = getTagColor(item.tag); return <Tag style={{ marginRight: 6, fontSize: 11, background: c.bg, color: c.text, border: "none" }}>{item.tag}</Tag>; })()}
                {item.name}
                {projectDescriptions && (
                  <Popover content={<div style={{ maxWidth: 300, whiteSpace: "pre-wrap" }}>{projectDescriptions[item.name] || "Нет описания"}</div>} trigger="click">
                    <InfoCircleOutlined style={{ color: "#999", marginLeft: 6, cursor: "pointer", fontSize: 13 }} />
                  </Popover>
                )}
              </div>
              {Array.from({ length: Math.ceil(item.data.length / CELLS_PER_ROW) }, (_, rowIdx) => {
                const start = rowIdx * CELLS_PER_ROW;
                const rowCells = item.data.slice(start, start + CELLS_PER_ROW);
                const rowDates = allDates.slice(start, start + CELLS_PER_ROW);
                const rowStart = rowDates[0] || "";
                const rowEnd = rowDates[rowDates.length - 1] || "";
                return (
                  <div key={rowIdx} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 10, color: "#999", width: 65, flexShrink: 0, textAlign: "right" }}>{rowStart}</span>
                    <div style={{ display: "flex", gap: CELL_GAP }}>
                      {rowCells.map((count, idx) => (
                        <div
                          key={idx}
                          className={`heatmap-cell level-${getActivityLevel(count, globalMax)}`}
                          data-tooltip={`${rowDates[idx]}: ${Number(count)} commit`}
                        />
                      ))}
                    </div>
                    <span style={{ fontSize: 10, color: "#999", width: 65, flexShrink: 0 }}>{rowEnd}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function HeatmapChart({ byProject, byContributor, loading, projectTags, projectDescriptions }: Props) {
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!tooltipRef.current) {
      const el = document.createElement("div");
      el.id = "heatmap-tooltip";
      document.body.appendChild(el);
      tooltipRef.current = el;
    }

    const handleMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const tooltipText = target.getAttribute("data-tooltip");
      const el = tooltipRef.current;
      if (!el) return;

      if (tooltipText) {
        el.textContent = tooltipText;
        el.style.display = "block";
        el.style.left = `${e.clientX + 12}px`;
        el.style.top = `${e.clientY - 30}px`;
      } else {
        el.style.display = "none";
      }
    };

    const handleMouseLeave = () => {
      if (tooltipRef.current) tooltipRef.current.style.display = "none";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
      if (tooltipRef.current) {
        tooltipRef.current.remove();
        tooltipRef.current = null;
      }
    };
  }, []);

  const { allDates, projectItems, contributorItems } = useMemo(() => {
    const rawDates = getAllDates({ ...byProject, ...byContributor });
    const fullDates = generateFullDateRange(rawDates);
    return {
      allDates: fullDates,
      projectItems: prepareHeatmapData(byProject, fullDates, projectTags),
      contributorItems: prepareHeatmapData(byContributor, fullDates),
    };
  }, [byProject, byContributor, projectTags]);

  if (!loading && projectItems.length === 0 && contributorItems.length === 0) {
    return <Empty description="Нет данных для тепловой карты" />;
  }

  return (
    <div style={{ position: "relative" }}>
      {/* Legend */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, padding: "0 0 12px", fontSize: 12, color: "#666" }}>
        <span>Меньше</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <div key={l} className={`heatmap-cell level-${l}`} style={{ width: 14, height: 14, borderRadius: 3 }} />
        ))}
        <span>Больше</span>
      </div>

      <Collapse
        defaultActiveKey={["projects", "contributors"]}
        items={[
          {
            key: "projects",
            label: <span style={{ fontSize: 14 }}>Проекты ({projectItems.length})</span>,
            children: <HeatmapGrid items={projectItems} allDates={allDates} projectDescriptions={projectDescriptions} />,
          },
          {
            key: "contributors",
            label: <span style={{ fontSize: 14 }}>Контрибьюторы ({contributorItems.length})</span>,
            children: <HeatmapGrid items={contributorItems} allDates={allDates} />,
          },
        ]}
      />
    </div>
  );
}
