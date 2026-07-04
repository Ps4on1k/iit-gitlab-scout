# OWASP Top 10 Security Backlog

## A01: Broken Access Control
- [x] Verify all endpoints have proper RBAC checks
- [x] Add role-based middleware validation
- [ ] Prevent horizontal privilege escalation (user A accessing user B's data)
- [x] Verify admin-only endpoints reject non-admin roles

## A02: Cryptographic Failures  
- [x] AES-256-GCM for GitLab tokens
- [x] Verify ENCRYPTION_KEY is strong (64 hex chars)
- [x] Ensure tokens are not logged
- [ ] Add key rotation support

## A03: Injection (SQL/XSS)
- [x] Parameterized SQL queries
- [x] Review XSS in frontend (dangerouslySetInnerHTML, etc.)
- [x] Add Content-Security-Policy headers
- [x] Validate all user inputs with Zod

## A05: Security Misconfiguration
- [x] Add CORS configuration (restrict origins)
- [x] Sanitize error messages (no stack traces in production)
- [x] Add security headers (X-Frame-Options, X-Content-Type-Options, etc.)
- [x] Disable X-Powered-By header

## A07: Authentication Failures
- [x] JWT with 24h expiry
- [x] bcrypt password hashing
- [x] Enforce minimum password length (already 4, recommend 8+)
- [x] Add account lockout after N failed attempts
- [x] Add rate limiting on login endpoint

## A08: Software and Data Integrity
- [ ] Pin npm dependencies
- [ ] Add Docker image scanning

## A09: Security Logging & Monitoring
- [x] Add audit log for admin actions (project/user CRUD)
- [x] Log failed login attempts
- [x] Log permission denied events

## A10: SSRF
- [x] GitLab API calls use project's base_url (not user-controlled)
- [x] Validate base_url format before API calls
