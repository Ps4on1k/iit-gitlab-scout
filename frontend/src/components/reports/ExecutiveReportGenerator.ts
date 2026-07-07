import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import dayjs from "dayjs";

export interface ReportData {
  meta: {
    title: string;
    dateFrom: string;
    dateTo: string;
    periodDays: number;
    generatedAt: string;
    filters: { projectIds: number[]; tags: string[]; contributors: string[] };
  };
  summary: {
    projects: number;
    activeProjects: number;
    inactiveProjects: number;
    contributors: number;
    totalCommits: number;
    activeDays: number;
    avgCommitsPerDay: number;
  };
  health: {
    branchHealth: number;
    totalBranches: number;
    activeBranches: number;
    staleBranches: number;
    mergedBranches: number;
    pipelineSuccessRate: number;
    pipelineTotal: number;
    avgPipelineDuration: number;
    mrTotal: number;
    mrMerged: number;
    mrOpened: number;
    mrClosed: number;
    mergeRate: number;
    deployTotal: number;
    deploySuccess: number;
    deployFailed: number;
    deployFrequency: number;
    failureRate: number;
    avgLeadTimeSec: number;
    avgMttrMin: number;
  };
  contributors: { name: string; email: string; commits: number; changes: number; lastCommit: string }[];
  inactiveContributors: { name: string; email: string; lastCommit: string }[];
  activeProjects: { id: number; label: string; tags: string[]; commits: number; contributors: number; lastCommit: string }[];
  inactiveProjects: { id: number; label: string; tags: string[] }[];
  activity: {
    daily: { date: string; commits: number }[];
    weekly: { week: string; commits: number }[];
    peakWeek: { week: string; commits: number } | null;
  };
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return "—";
  if (seconds < 60) return `${seconds}с`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}мин`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}ч ${m}мин`;
}

function formatMttr(minutes: number): string {
  if (minutes === 0) return "—";
  if (minutes < 60) return `${Math.round(minutes)}мин`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}ч ${m}мин`;
}

function formatDate(d: string): string {
  return dayjs(d).format("DD.MM.YYYY");
}

function rateLabel(rate: number): string {
  if (rate >= 90) return "Отлично";
  if (rate >= 70) return "Хорошо";
  if (rate >= 50) return "Удовл.";
  return "Плохо";
}

function rateColor(rate: number): string {
  if (rate >= 90) return "#21B573";
  if (rate >= 70) return "#3A8DFF";
  if (rate >= 50) return "#FFB020";
  return "#E5484D";
}

function buildReportHtml(data: ReportData): string {
  const filters: string[] = [];
  if (data.meta.filters.tags.length > 0) filters.push(`Теги: ${data.meta.filters.tags.join(", ")}`);
  if (data.meta.filters.projectIds.length > 0) filters.push(`Проекты: ${data.meta.filters.projectIds.length}`);
  if (data.meta.filters.contributors.length > 0) filters.push(`Участники: ${data.meta.filters.contributors.length}`);

  const summaryRows = [
    ["Проектов (всего)", data.summary.projects],
    ["Активных проектов", data.summary.activeProjects],
    ["Неактивных проектов", data.summary.inactiveProjects],
    ["Участников", data.summary.contributors],
    ["Всего коммитов", data.summary.totalCommits],
    ["Активных дней", data.summary.activeDays],
    ["Среднее коммитов/день", data.summary.avgCommitsPerDay],
  ];

  const healthRows = [
    ["Здоровье веток", `${data.health.branchHealth}%`, rateLabel(data.health.branchHealth), rateColor(data.health.branchHealth)],
    ["Активные ветки", `${data.health.activeBranches} / ${data.health.totalBranches}`, "", ""],
    ["Устаревшие ветки", String(data.health.staleBranches), data.health.staleBranches > 10 ? "Внимание" : "OK", data.health.staleBranches > 10 ? "#E5484D" : ""],
    ["Успешность пайплайнов", `${data.health.pipelineSuccessRate}%`, rateLabel(data.health.pipelineSuccessRate), rateColor(data.health.pipelineSuccessRate)],
    ["Среднее время пайплайна", formatDuration(data.health.avgPipelineDuration), "", ""],
    ["Сливание MR", `${data.health.mergeRate}%`, rateLabel(data.health.mergeRate), rateColor(data.health.mergeRate)],
    ["Всего MR", `${data.health.mrTotal} (слито: ${data.health.mrMerged})`, "", ""],
    ["Частота деплоев", `${data.health.deployFrequency}/день`, "", ""],
    ["Доля ошибок деплоев", `${data.health.failureRate}%`, data.health.failureRate <= 5 ? "Отлично" : data.health.failureRate <= 15 ? "Внимание" : "Критично", data.health.failureRate <= 5 ? "#21B573" : data.health.failureRate <= 15 ? "#FFB020" : "#E5484D"],
    ["Среднее время доставки", formatDuration(data.health.avgLeadTimeSec), "", ""],
    ["Среднее время восстановления", formatMttr(data.health.avgMttrMin), "", ""],
  ];

  let html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 11px; color: #1f2937; padding: 30px 40px; width: 750px; background: #fff; }
  h1 { font-size: 22px; text-align: center; margin-bottom: 4px; }
  .subtitle { text-align: center; color: #6b7280; font-size: 12px; margin-bottom: 2px; }
  .filters { text-align: center; color: #9ca3af; font-size: 10px; margin-bottom: 12px; }
  .section-title { font-size: 15px; font-weight: 700; margin: 18px 0 8px 0; padding-bottom: 4px; border-bottom: 2px solid #3A8DFF; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10.5px; }
  th { background: #3A8DFF; color: #fff; padding: 5px 8px; text-align: left; font-weight: 600; }
  td { padding: 4px 8px; border-bottom: 1px solid #e5e7eb; }
  tr:nth-child(even) { background: #f9fafb; }
  .val-right { text-align: right; }
  .status { font-weight: 600; }
  .inactive-section .section-title { color: #E5484D; border-bottom-color: #E5484D; }
  .inactive-section th { background: #E5484D; }
  .footer { text-align: center; color: #9ca3af; font-size: 9px; margin-top: 20px; border-top: 1px solid #e5e7eb; padding-top: 8px; }
</style>
</head>
<body>
  <h1>${esc(data.meta.title)}</h1>
  <div class="subtitle">GitLab Scout</div>
  <div class="subtitle">Период: ${formatDate(data.meta.dateFrom)} — ${formatDate(data.meta.dateTo)} (${data.meta.periodDays} дн.) | Сформирован: ${dayjs(data.meta.generatedAt).format("DD.MM.YYYY HH:mm")}</div>
  ${filters.length > 0 ? `<div class="filters">Фильтры: ${esc(filters.join(" | "))}</div>` : ""}

  <div class="section-title">1. Общая сводка</div>
  <table>
    <tr><th>Показатель</th><th class="val-right">Значение</th></tr>
    ${summaryRows.map(([k, v]) => `<tr><td>${esc(String(k))}</td><td class="val-right">${v}</td></tr>`).join("\n    ")}
  </table>

  <div class="section-title">2. Здоровье проекта</div>
  <table>
    <tr><th>Показатель</th><th class="val-right">Значение</th><th>Статус</th></tr>
    ${healthRows.map(([k, v, s, c]) => `<tr><td>${esc(String(k))}</td><td class="val-right">${v}</td><td class="status" style="color:${c || '#374151'}">${esc(String(s))}</td></tr>`).join("\n    ")}
  </table>

  <div class="section-title">3. Производительность команды</div>
  ${data.contributors.length > 0 ? `
  <table>
    <tr><th>Имя</th><th class="val-right">Коммиты</th><th class="val-right">Изменения</th><th>Последняя активность</th></tr>
    ${data.contributors.map(c => `<tr><td>${esc(c.name)}</td><td class="val-right">${c.commits}</td><td class="val-right">${c.changes.toLocaleString()}</td><td>${formatDate(c.lastCommit)}</td></tr>`).join("\n    ")}
  </table>` : "<p style='color:#9ca3af'>Нет данных</p>"}

  ${data.inactiveContributors.length > 0 ? `
  <div class="inactive-section">
    <div class="section-title">Неактивные участники</div>
    <table>
      <tr><th>Имя</th><th>Последний коммит</th></tr>
      ${data.inactiveContributors.slice(0, 10).map(c => `<tr><td>${esc(c.name)}</td><td>${formatDate(c.lastCommit)}</td></tr>`).join("\n      ")}
    </table>
  </div>` : ""}

  <div class="section-title">4. Обзор активности</div>
  ${data.activity.peakWeek ? `<p style="margin-bottom:8px"><b>Пиковая неделя:</b> ${formatDate(data.activity.peakWeek.week)} (${data.activity.peakWeek.commits} коммитов)</p>` : ""}
  ${data.activity.weekly.length > 0 ? `
  <table>
    <tr><th>Неделя</th><th class="val-right">Коммиты</th></tr>
    ${data.activity.weekly.map(w => `<tr><td>${formatDate(w.week)}</td><td class="val-right">${w.commits}</td></tr>`).join("\n    ")}
  </table>` : ""}

  ${data.activeProjects.length > 0 ? `
  <div class="section-title">5. Разбивка по проектам</div>
  <table>
    <tr><th>Проект</th><th>Теги</th><th class="val-right">Коммиты</th><th class="val-right">Участники</th><th>Последний коммит</th></tr>
    ${data.activeProjects.map(p => `<tr><td>${esc(p.label)}</td><td>${esc(p.tags.join(", ") || "—")}</td><td class="val-right">${p.commits}</td><td class="val-right">${p.contributors}</td><td>${formatDate(p.lastCommit)}</td></tr>`).join("\n    ")}
  </table>` : ""}

  <div class="footer">Сформировано в GitLab Scout — Исполнительный отчёт</div>
</body>
</html>`;
  return html;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function generatePdf(data: ReportData): Promise<jsPDF> {
  const html = buildReportHtml(data);

  const container = document.createElement("div");
  container.innerHTML = html;
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "750px";
  container.style.background = "#fff";
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      width: 750,
      windowWidth: 750,
    });

    const imgData = canvas.toDataURL("image/png");
    const margin = 15;
    const imgWidth = 210 - margin * 2;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageHeight = 297 - margin * 2;
    let position = 0;

    if (imgHeight <= pageHeight) {
      doc.addImage(imgData, "PNG", margin, margin, imgWidth, imgHeight);
    } else {
      let remaining = imgHeight;
      while (remaining > 0) {
        if (position > 0) doc.addPage();
        const sliceHeight = Math.min(pageHeight, remaining);
        const srcY = (position / imgHeight) * canvas.height;
        const srcH = (sliceHeight / imgHeight) * canvas.height;

        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = srcH;
        const ctx = sliceCanvas.getContext("2d")!;
        ctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);

        const sliceData = sliceCanvas.toDataURL("image/png");
        doc.addImage(sliceData, "PNG", margin, margin, imgWidth, sliceHeight);

        remaining -= sliceHeight;
        position += sliceHeight;
      }
    }

    return doc;
  } finally {
    document.body.removeChild(container);
  }
}

export function generateMarkdown(data: ReportData): string {
  const lines: string[] = [];

  lines.push(`# ${data.meta.title}`);
  lines.push("");
  lines.push(`**Период**: ${formatDate(data.meta.dateFrom)} — ${formatDate(data.meta.dateTo)} (${data.meta.periodDays} дн.)`);
  lines.push(`**Сформирован**: ${dayjs(data.meta.generatedAt).format("DD.MM.YYYY HH:mm")}`);
  lines.push("");

  if (data.meta.filters.tags.length > 0 || data.meta.filters.projectIds.length > 0) {
    const filterParts: string[] = [];
    if (data.meta.filters.tags.length > 0) filterParts.push(`Теги: ${data.meta.filters.tags.join(", ")}`);
    if (data.meta.filters.projectIds.length > 0) filterParts.push(`Проекты: ${data.meta.filters.projectIds.length}`);
    if (data.meta.filters.contributors.length > 0) filterParts.push(`Участники: ${data.meta.filters.contributors.length}`);
    lines.push(`> Фильтры: ${filterParts.join(" | ")}`);
    lines.push("");
  }

  lines.push("---");
  lines.push("");

  lines.push("## 1. Общая сводка");
  lines.push("");
  lines.push("| Показатель | Значение |");
  lines.push("|------------|----------|");
  lines.push(`| Проектов (всего) | ${data.summary.projects} |`);
  lines.push(`| Активных проектов | ${data.summary.activeProjects} |`);
  lines.push(`| Неактивных проектов | ${data.summary.inactiveProjects} |`);
  lines.push(`| Участников | ${data.summary.contributors} |`);
  lines.push(`| Всего коммитов | ${data.summary.totalCommits} |`);
  lines.push(`| Активных дней | ${data.summary.activeDays} |`);
  lines.push(`| Среднее коммитов/день | ${data.summary.avgCommitsPerDay} |`);
  lines.push("");

  lines.push("## 2. Здоровье проекта");
  lines.push("");
  lines.push("| Показатель | Значение | Статус |");
  lines.push("|------------|----------|--------|");
  lines.push(`| Здоровье веток | ${data.health.branchHealth}% | ${rateLabel(data.health.branchHealth)} |`);
  lines.push(`| Активные / Всего веток | ${data.health.activeBranches} / ${data.health.totalBranches} | |`);
  lines.push(`| Устаревшие ветки | ${data.health.staleBranches} | ${data.health.staleBranches > 10 ? "Внимание" : "OK"} |`);
  lines.push(`| Успешность пайплайнов | ${data.health.pipelineSuccessRate}% | ${rateLabel(data.health.pipelineSuccessRate)} |`);
  lines.push(`| Среднее время пайплайна | ${formatDuration(data.health.avgPipelineDuration)} | |`);
  lines.push(`| Сливание MR | ${data.health.mergeRate}% | ${rateLabel(data.health.mergeRate)} |`);
  lines.push(`| Всего MR | ${data.health.mrTotal} (слито: ${data.health.mrMerged}) | |`);
  lines.push(`| Частота деплоев | ${data.health.deployFrequency}/день | |`);
  lines.push(`| Доля ошибок деплоев | ${data.health.failureRate}% | ${data.health.failureRate <= 5 ? "Отлично" : data.health.failureRate <= 15 ? "Внимание" : "Критично"} |`);
  lines.push(`| Среднее время доставки | ${formatDuration(data.health.avgLeadTimeSec)} | |`);
  lines.push(`| Среднее время восстановления | ${formatMttr(data.health.avgMttrMin)} | |`);
  lines.push("");

  lines.push("## 3. Производительность команды");
  lines.push("");

  if (data.contributors.length > 0) {
    lines.push("| Имя | Коммиты | Изменения | Последняя активность |");
    lines.push("|-----|---------|-----------|----------------------|");
    for (const c of data.contributors) {
      lines.push(`| ${c.name} | ${c.commits} | ${c.changes} | ${formatDate(c.lastCommit)} |`);
    }
    lines.push("");
  }

  if (data.inactiveContributors.length > 0) {
    lines.push("### Неактивные участники");
    lines.push("");
    lines.push("| Имя | Последний коммит |");
    lines.push("|-----|------------------|");
    for (const c of data.inactiveContributors.slice(0, 10)) {
      lines.push(`| ${c.name} | ${formatDate(c.lastCommit)} |`);
    }
    lines.push("");
  }

  lines.push("## 4. Обзор активности");
  lines.push("");

  if (data.activity.peakWeek) {
    lines.push(`**Пиковая неделя**: ${formatDate(data.activity.peakWeek.week)} (${data.activity.peakWeek.commits} коммитов)`);
    lines.push("");
  }

  if (data.activity.weekly.length > 0) {
    lines.push("| Неделя | Коммиты |");
    lines.push("|--------|---------|");
    for (const w of data.activity.weekly) {
      lines.push(`| ${formatDate(w.week)} | ${w.commits} |`);
    }
    lines.push("");
  }

  if (data.activeProjects.length > 0) {
    lines.push("## 5. Разбивка по проектам");
    lines.push("");
    lines.push("| Проект | Теги | Коммиты | Участники | Последний коммит |");
    lines.push("|--------|------|---------|-----------|------------------|");
    for (const p of data.activeProjects) {
      lines.push(`| ${p.label} | ${p.tags.join(", ") || "—"} | ${p.commits} | ${p.contributors} | ${formatDate(p.lastCommit)} |`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("*Сформировано в GitLab Scout — Исполнительный отчёт*");

  return lines.join("\n");
}

export async function downloadPdf(data: ReportData) {
  const doc = await generatePdf(data);
  const title = data.meta.title.replace(/[^a-zA-Zа-яА-Я0-9_\-]/g, "_").substring(0, 50);
  doc.save(`${title}-${data.meta.dateFrom}-${data.meta.dateTo}.pdf`);
}

export function downloadMarkdown(data: ReportData) {
  const md = generateMarkdown(data);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const title = data.meta.title.replace(/[^a-zA-Zа-яА-Я0-9_\-]/g, "_").substring(0, 50);
  a.download = `${title}-${data.meta.dateFrom}-${data.meta.dateTo}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
