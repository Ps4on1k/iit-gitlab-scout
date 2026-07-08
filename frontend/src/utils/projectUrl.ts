export function getProjectUrl(base_url: string, path: string): string {
  const base = base_url.replace(/\/+$/, "");
  const p = path.replace(/^\/+/, "");
  return `${base}/${p}`;
}
