export function formatContributorName(email: string, name?: string | null): string {
  if (name && name !== email) return `${name} (${email})`;
  return email;
}

export function matchContributor(filter: string, name: string, email: string): boolean {
  const f = filter.toLowerCase();
  return name.toLowerCase().includes(f) || email.toLowerCase().includes(f);
}
