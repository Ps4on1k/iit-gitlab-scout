interface ChartColors {
  axisLabel: string;
  axisLine: string;
  gridLine: string;
  text: string;
  secondaryText: string;
}

let cachedDarkMode: boolean | null = null;
let cachedColors: ChartColors | null = null;

export function isDarkMode(): boolean {
  try {
    const val = localStorage.getItem("darkMode") === "true";
    if (val !== cachedDarkMode) {
      cachedDarkMode = val;
      cachedColors = null;
    }
    return val;
  } catch {
    return false;
  }
}

export function chartColors(): ChartColors {
  if (cachedColors) return cachedColors;
  const dark = isDarkMode();
  cachedColors = {
    axisLabel: dark ? "#8A94A6" : "#4A5568",
    axisLine: dark ? "#2A3A4A" : "#D8DCE3",
    gridLine: dark ? "#1F2D3D" : "#EEF1F4",
    text: dark ? "#E8ECF1" : "#111315",
    secondaryText: dark ? "#AEB7C4" : "#8A94A6",
  };
  return cachedColors;
}

export function invalidateChartColors(): void {
  cachedDarkMode = null;
  cachedColors = null;
}
