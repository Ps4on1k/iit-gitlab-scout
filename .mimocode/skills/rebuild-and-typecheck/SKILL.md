---
name: rebuild-and-typecheck
description: Typecheck TypeScript (frontend + backend) then rebuild Docker containers for iit-gitlab-scout
---

# Rebuild & Typecheck

Full rebuild cycle for iit-gitlab-scout after code changes.

## Procedure

### Step 1: Typecheck frontend
```bash
npx tsc --noEmit 2>&1
```
Working directory: `frontend/`

### Step 2: Typecheck backend
```bash
npx tsc --noEmit 2>&1
```
Working directory: `backend/`

### Step 3: Fix any TypeScript errors
If errors found, fix them before proceeding. Common patterns:
- Unused imports → remove
- Missing `useMemo` import → add to React import
- `batch.ts` import path → use `../utils/batch.js` (relative to `src/services/`)

### Step 4: Rebuild and restart Docker containers
```bash
docker compose down 2>&1 && docker compose build --no-cache 2>&1 | tail -3 && docker compose up -d 2>&1
```

If only frontend changed, rebuild frontend only:
```bash
docker compose build --no-cache frontend 2>&1 | tail -2 && docker compose up -d --force-recreate frontend 2>&1
```

If only backend changed, rebuild backend only:
```bash
docker compose build --no-cache backend 2>&1 | tail -2 && docker compose up -d --force-recreate backend 2>&1
```

### Step 5: Verify
- Backend: `curl -s http://localhost:3030/health`
- Frontend: `curl -s http://localhost:8080 | head -5`
- Docker status: `docker compose ps`

## Stopping condition
Both typechecks pass clean and containers are running with the new code.

## Notes
- `docker compose build --no-cache` forces full rebuild (no layer cache). Required when version string changes.
- Backend runs on port 3030, frontend on port 8080.
- Docker compose file is at project root.
