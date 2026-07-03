import { useState, useEffect, useCallback } from "react";
import dayjs from "dayjs";
import type { GlobalFilters } from "../components/GlobalFilterBar";
import {
  fetchFilterPresets,
  createFilterPreset,
  updateFilterPreset,
  deleteFilterPreset,
  type FilterPresetData,
} from "../api/client";

export interface FilterPreset {
  id: number;
  name: string;
  filters: GlobalFilters;
  relativeDaysFrom?: number;
  relativeDaysTo?: number;
}

export const RELATIVE_DATE_OPTIONS = [
  { value: 7, label: "7 дней" },
  { value: 14, label: "14 дней" },
  { value: 30, label: "30 дней" },
  { value: 60, label: "60 дней" },
  { value: 90, label: "90 дней" },
  { value: 180, label: "180 дней" },
  { value: 365, label: "1 год" },
] as const;

export function resolvePresetDates(preset: FilterPreset): GlobalFilters {
  if (preset.relativeDaysFrom !== undefined) {
    return {
      ...preset.filters,
      dateFrom: dayjs().subtract(preset.relativeDaysFrom, "day").format("YYYY-MM-DD"),
      dateTo: preset.relativeDaysTo !== undefined
        ? dayjs().subtract(preset.relativeDaysTo, "day").format("YYYY-MM-DD")
        : dayjs().format("YYYY-MM-DD"),
    };
  }
  return preset.filters;
}

export function describeRelativeDate(daysFrom?: number, daysTo?: number): string | null {
  if (daysFrom === undefined) return null;
  const toLabel = daysTo === undefined || daysTo === 0 ? "сегодня" : `${daysTo} дн. назад`;
  return `−${daysFrom} дн. → ${toLabel}`;
}

function toPreset(row: FilterPresetData): FilterPreset {
  return {
    id: row.id,
    name: row.name,
    filters: row.filters,
    relativeDaysFrom: row.relative_days_from ?? undefined,
    relativeDaysTo: row.relative_days_to ?? undefined,
  };
}

export function useFilterPresets() {
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetchFilterPresets();
    if (res.ok) {
      setPresets(res.data!.map(toPreset));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addPreset = useCallback(async (name: string, filters: GlobalFilters, relativeDaysFrom?: number, relativeDaysTo?: number) => {
    const res = await createFilterPreset({
      name,
      filters,
      relative_days_from: relativeDaysFrom,
      relative_days_to: relativeDaysTo,
    });
    if (res.ok) {
      setPresets((prev) => [toPreset(res.data!), ...prev]);
    }
    return res;
  }, []);

  const removePreset = useCallback(async (id: number) => {
    const res = await deleteFilterPreset(id);
    if (res.ok) {
      setPresets((prev) => prev.filter((p) => p.id !== id));
    }
    return res;
  }, []);

  const updatePresetName = useCallback(async (id: number, name: string) => {
    const res = await updateFilterPreset(id, name);
    if (res.ok) {
      setPresets((prev) => prev.map((p) => p.id === id ? { ...p, name } : p));
    }
    return res;
  }, []);

  return { presets, loading, addPreset, removePreset, updatePresetName };
}
