import { useState, useEffect, useCallback } from "react";
import { Card, InputNumber, Button, message, Typography, Space, Divider, Tooltip } from "antd";
import { SaveOutlined, ReloadOutlined, InfoCircleOutlined } from "@ant-design/icons";
import { fetchMetricWeights, updateMetricWeights } from "../api/client";

const CONTRIBUTOR_LABELS: Record<string, string> = {
  consistency: "Последовательность",
  activity: "Активность",
  impact: "Влияние",
  sizeQuality: "Качество коммитов",
  deploy: "Надёжность деплоя",
};

const CONTRIBUTOR_DESCRIPTIONS: Record<string, string> = {
  consistency: "Отношение активных дней к рабочим дням в периоде",
  activity: "Коммитов в неделю (нормализовано до 15)",
  impact: "Суммарные изменения за активный день (нормализовано до 200)",
  sizeQuality: "Средний размер коммита (идеал 10–50 строк)",
  deploy: "Составной скор деплоя: Success Rate × 50% + Coverage × 30% + Volume × 20%",
};

const DEPLOY_LABELS: Record<string, string> = {
  successRate: "Success Rate",
  coverage: "Pipeline Coverage",
  volume: "Объём деплоев",
};

const DEPLOY_DESCRIPTIONS: Record<string, string> = {
  successRate: "% успешных pipeline из завершённых",
  coverage: "% MR с запущенным pipeline",
  volume: "Количество успешных деплоев (cap 100)",
};

export function WeightsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [weights, setWeights] = useState<Record<string, Record<string, number>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchMetricWeights();
    if (res.ok) setWeights(res.data!);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (metric: string) => {
    setSaving(metric);
    const res = await updateMetricWeights(metric, weights[metric]);
    if (res.ok) {
      message.success("Веса сохранены");
    } else {
      message.error(res.error!);
    }
    setSaving(null);
  };

  const updateWeight = (metric: string, key: string, value: number | null) => {
    setWeights((prev) => ({
      ...prev,
      [metric]: { ...prev[metric], [key]: value ?? 0 },
    }));
  };

  const getSum = (metric: string) => {
    return Object.values(weights[metric] || {}).reduce((s, v) => s + v, 0);
  };

  const renderMetricGroup = (
    metric: string,
    title: string,
    labels: Record<string, string>,
    descriptions: Record<string, string>,
  ) => {
    const w = weights[metric] || {};
    const sum = getSum(metric);
    const isValid = Math.abs(sum - 100) < 1;

    return (
      <Card
        key={metric}
        title={<span>{title}</span>}
        extra={
          <Space>
            <Tooltip title="Сумма весов должна быть 100%">
              <InfoCircleOutlined style={{ color: "var(--ant-color-textTertiary)" }} />
            </Tooltip>
            <span style={{ color: isValid ? "#21B573" : "#E5484D", fontWeight: 600, fontSize: 13 }}>
              {sum}%
            </span>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving === metric}
              disabled={!isValid}
              onClick={() => handleSave(metric)}
            >Сохранить</Button>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <div style={{ display: "grid", gap: 12 }}>
          {Object.entries(w).map(([key, value]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Tooltip title={descriptions[key]}>
                <span style={{ minWidth: 160, fontSize: 13, color: "var(--ant-color-text)" }}>
                  {labels[key] || key}
                </span>
              </Tooltip>
              <InputNumber
                min={0}
                max={100}
                value={value}
                onChange={(v) => updateWeight(metric, key, v)}
                style={{ width: 80 }}
                formatter={(v) => `${v}%`}
                parser={(v) => Number(v?.replace("%", "") || 0) as any}
              />
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--ant-color-fill-secondary)", overflow: "hidden" }}>
                <div style={{ width: `${value}%`, height: "100%", background: "#3A8DFF", borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: 11, color: "var(--ant-color-textTertiary)", minWidth: 80 }}>
                {descriptions[key]}
              </span>
            </div>
          ))}
        </div>
      </Card>
    );
  };

  return (
    <div>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        Настройте веса композитных метрик. Сумма весов каждой группы должна быть 100%.
        Изменения применяются к новым расчётам Score после сохранения.
      </Typography.Paragraph>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>Загрузка...</div>
      ) : (
        <>
          {renderMetricGroup(
            "contributor_score",
            "Score контрибьютора (композитная метрика эффективности)",
            CONTRIBUTOR_LABELS,
            CONTRIBUTOR_DESCRIPTIONS,
          )}

          {renderMetricGroup(
            "deploy_reliability",
            "Надёжность деплоя (подскор для компоненты Deploy в Score)",
            DEPLOY_LABELS,
            DEPLOY_DESCRIPTIONS,
          )}
        </>
      )}
    </div>
  );
}
