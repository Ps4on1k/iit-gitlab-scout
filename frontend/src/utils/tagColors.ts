const TAG_COLORS: Record<string, { bg: string; text: string }> = {};

const PALETTE: { bg: string; text: string }[] = [
  { bg: "#1677ff", text: "#fff" },
  { bg: "#52c41a", text: "#fff" },
  { bg: "#fa8c16", text: "#fff" },
  { bg: "#722ed1", text: "#fff" },
  { bg: "#13c2c2", text: "#fff" },
  { bg: "#eb2f96", text: "#fff" },
  { bg: "#faad14", text: "#000" },
  { bg: "#2f54eb", text: "#fff" },
  { bg: "#f5222d", text: "#fff" },
  { bg: "#a0d911", text: "#000" },
  { bg: "#722ed1", text: "#fff" },
  { bg: "#fa541c", text: "#fff" },
];

export function getTagColor(tag: string): { bg: string; text: string } {
  if (!tag) return { bg: "#d9d9d9", text: "#000" };
  if (TAG_COLORS[tag]) return TAG_COLORS[tag];
  const idx = Object.keys(TAG_COLORS).length % PALETTE.length;
  TAG_COLORS[tag] = PALETTE[idx];
  return TAG_COLORS[tag];
}
