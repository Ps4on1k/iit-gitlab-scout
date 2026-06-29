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
    axisLabel: dark ? "#8A94A6" : "#4A5568",
    axisLine: dark ? "#2A3A4A" : "#D8DCE3",
    gridLine: dark ? "#1F2D3D" : "#EEF1F4",
    text: dark ? "#E8ECF1" : "#111315",
    secondaryText: dark ? "#AEB7C4" : "#8A94A6",
  };
}
