export function isDarkMode(): boolean {
  try {
    return localStorage.getItem("darkMode") === "true";
  } catch {
    return false;
  }
}

export function chartColors() {
  const dark = isDarkMode();
  return {
    axisLabel: dark ? "#a0a0b4" : "#666",
    axisLine: dark ? "#313147" : "#e0e0e0",
    gridLine: dark ? "#252536" : "#f0f0f0",
    text: dark ? "#e0e0e8" : "#333",
    secondaryText: dark ? "#a0a0b4" : "#999",
  };
}
