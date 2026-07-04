# Security Audit Backlog

## CRITICAL
| # | Issue | File | Status |
|---|-------|------|--------|
| 1 | SQL injection: `project_id` concatenated into query | contributor-repository.ts:215 | 🔴 TODO |

## HIGH
| # | Issue | File | Status |
|---|-------|------|--------|
| 2 | Error messages leak internals in 10+ catch blocks | multiple api/v1/*.ts | 🔴 TODO |
| 3 | CORS allows all origins when CORS_ORIGINS unset | index.ts:42 | 🔴 TODO |
| 4 | Default seeded passwords "admin"/"user" | auth.ts:20-21 | 🔴 TODO |
| 5 | No JWT token revocation on password/role change | auth.ts, users.ts | 🔴 TODO |
| 6 | Benchmark accessible to non-admin via devtools | App.tsx:236 | 🔴 TODO |

## MEDIUM
| # | Issue | File | Status |
|---|-------|------|--------|
| 7 | No Zod validation on user creation | users.ts:19 | 🔴 TODO |
| 8 | No Zod validation on project creation | projects.ts:29 | 🔴 TODO |
| 9 | filter-presets accepts unvalidated any body | filter-presets.ts:17 | 🔴 TODO |
| 10 | time-entries: no type validation on hours/dates | time-entries.ts:42 | 🔴 TODO |

## LOW
| # | Issue | File | Status |
|---|-------|------|--------|
| 11 | No email format validation in contributor-directory | contributor-directory.ts:20 | 🔴 TODO |
| 12 | No user self-service password change | users.ts | 🔴 TODO |
