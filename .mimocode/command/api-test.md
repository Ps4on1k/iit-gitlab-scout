---
description: Extract auth token from iit-gitlab-scout API and test an endpoint
---

# API Test

Extract auth token and test an endpoint against the running iit-gitlab-scout backend.

## Usage

Pass the endpoint path and optional method/body as arguments. Default: GET on `/api/v1/dashboard`.

## Procedure

### Step 1: Get auth token
```bash
TOKEN=$(curl -s -X POST http://localhost:3030/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
```

### Step 2: Test the endpoint
```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3030$1" | python3 -m json.tool
```

For POST with body:
```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '$2' "http://localhost:3030$1" | python3 -m json.tool
```

## Stopping condition
Endpoint returns valid JSON response.

## Notes
- Backend URL: `http://localhost:3030`
- Default credentials: `admin` / `admin`
- Token is a JWT, valid until server restart
- Non-admin users use different endpoints (filtered by `getFilteredProjectIds`)
