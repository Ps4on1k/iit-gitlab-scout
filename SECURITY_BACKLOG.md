# Security Audit Backlog

## CRITICAL
| # | Issue | File | Status |
|---|-------|------|--------|
| 1 | SQL injection: `project_id` concatenated into query | contributor-repository.ts:215 | ✅ Fixed |

## HIGH
| # | Issue | File | Status |
|---|-------|------|--------|
| 2 | Error messages leak internals in 10+ catch blocks | multiple api/v1/*.ts | ✅ Fixed |
| 3 | CORS allows all origins when CORS_ORIGINS unset | index.ts:42 | ✅ Fixed |
| 4 | Default seeded passwords "admin"/"user" | auth.ts:20-21 | ✅ Fixed |
| 5 | No JWT token revocation on password/role change | auth.ts, users.ts | ✅ Fixed |
| 6 | Benchmark accessible to non-admin via devtools | App.tsx:236 | ✅ Fixed |

## MEDIUM
| # | Issue | File | Status |
|---|-------|------|--------|
| 7 | No Zod validation on user creation | users.ts:19 | ✅ Fixed |
| 8 | No Zod validation on project creation | projects.ts:29 | ✅ Fixed |
| 9 | filter-presets accepts unvalidated any body | filter-presets.ts:17 | ✅ Fixed |
| 10 | time-entries: no type validation on hours/dates | time-entries.ts:42 | ✅ Fixed |

## LOW
| # | Issue | File | Status |
|---|-------|------|--------|
| 11 | No email format validation in contributor-directory | contributor-directory.ts:20 | ✅ Fixed |
| 12 | No user self-service password change | auth.ts:165 | ✅ Fixed |
