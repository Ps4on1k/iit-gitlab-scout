# OWASP Top 10 Security Backlog

## A01: Broken Access Control
- [ ] Verify all endpoints have proper RBAC checks
- [ ] Add role-based middleware validation
- [ ] Prevent horizontal privilege escalation (user A accessing user B's data)
- [ ] Verify admin-only endpoints reject non-admin roles

## A02: Cryptographic Failures  
- [x] AES-256-GCM for GitLab tokens
- [ ] Verify ENCRYPTION_KEY is strong (64 hex chars)
- [ ] Ensure tokens are not logged
- [ ] Add key rotation support

## A03: Injection (SQL/XSS)
- [x] Parameterized SQL queries
- [ ] Review XSS in frontend (dangerouslySetInnerHTML, etc.)
- [ ] Add Content-Security-Policy headers
- [ ] Validate all user inputs with Zod

## A05: Security Misconfiguration
- [ ] Add CORS configuration (restrict origins)
- [ ] Sanitize error messages (no stack traces in production)
- [ ] Add security headers (X-Frame-Options, X-Content-Type-Options, etc.)
- [ ] Disable X-Powered-By header

## A07: Authentication Failures
- [x] JWT with 24h expiry
- [x] bcrypt password hashing
- [ ] Enforce minimum password length (already 4, recommend 8+)
- [ ] Add account lockout after N failed attempts
- [ ] Add rate limiting on login endpoint

## A08: Software and Data Integrity
- [ ] Pin npm dependencies
- [ ] Add Docker image scanning

## A09: Security Logging & Monitoring
- [ ] Add audit log for admin actions (project/user CRUD)
- [ ] Log failed login attempts
- [ ] Log permission denied events

## A10: SSRF
- [x] GitLab API calls use project's base_url (not user-controlled)
- [ ] Validate base_url format before API calls
