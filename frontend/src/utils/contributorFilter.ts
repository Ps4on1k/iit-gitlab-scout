/**
 * Check if a contributor entry matches any of the filter values.
 * Works with both DbContributor (author_email/author_name) and
 * DeployReliabilityEntry (email/name) and ContributorRedFlag (author_email/author_name).
 */
export function matchesContributorFilter(
  entry: Record<string, any>,
  filterValues: string[]
): boolean {
  if (filterValues.length === 0) return true;

  const email = (entry.author_email || entry.email || "").toLowerCase();
  const name = (entry.author_name || entry.name || "").toLowerCase();

  return filterValues.some((f) => {
    const fv = (f || "").toLowerCase();
    return email === fv || name === fv || email.includes(fv) || name.includes(fv);
  });
}
