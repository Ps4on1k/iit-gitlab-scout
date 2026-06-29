const TAG_COLORS: Record<string, { bg: string; text: string }> = {};

const PALETTE: { bg: string; text: string }[] = [
  { bg: "#3A8DFF", text: "#fff" },
  { bg: "#42D9C8", text: "#111315" },
  { bg: "#21B573", text: "#fff" },
  { bg: "#FFB020", text: "#111315" },
  { bg: "#E5484D", text: "#fff" },
  { bg: "#141B2D", text: "#fff" },
  { bg: "#3A8DFF", text: "#fff" },
  { bg: "#42D9C8", text: "#111315" },
  { bg: "#21B573", text: "#fff" },
  { bg: "#FFB020", text: "#111315" },
  { bg: "#AEB7C4", text: "#111315" },
  { bg: "#E5484D", text: "#fff" },
];

export function getTagColor(tag: string): { bg: string; text: string } {
  if (!tag) return { bg: "#D8DCE3", text: "#111315" };
  if (TAG_COLORS[tag]) return TAG_COLORS[tag];
  const idx = Object.keys(TAG_COLORS).length % PALETTE.length;
  TAG_COLORS[tag] = PALETTE[idx];
  return TAG_COLORS[tag];
}
