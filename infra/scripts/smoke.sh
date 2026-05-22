#!/usr/bin/env bash
# End-to-end smoke test:
#   1. register first user (becomes admin)
#   2. fetch /me
#   3. create a node, capture register_token
#   4. list nodes
#   5. create a non-dangerous task (kind=skill) — should land in queued
#   6. create a dangerous task (kind=command) — should land in waiting_approval
#   7. list pending approvals, approve the first one
#   8. fetch task to confirm state moved
set -euo pipefail

API="${API:-http://localhost:8800}"
EMAIL="${EMAIL:-smoke@example.com}"
PASS="${PASS:-smoketest12345}"

j() { python3 -c 'import sys,json; print(json.dumps(json.load(sys.stdin), indent=2))'; }
field() { python3 -c "import sys,json; print(json.load(sys.stdin)$1)"; }

echo "==> health"; curl -fsS "$API/healthz" | j

echo "==> register/login"
REG=$(curl -sS -X POST "$API/v1/auth/register" -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
if ! echo "$REG" | grep -q access_token; then
  echo "register failed, trying login"
  REG=$(curl -fsS -X POST "$API/v1/auth/login" -H 'content-type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
fi
ACCESS=$(echo "$REG" | field "['access_token']")
echo "access: ${ACCESS:0:24}..."

AUTH="authorization: Bearer $ACCESS"

echo "==> /me"; curl -fsS -H "$AUTH" "$API/v1/auth/me" | j

echo "==> create node 'laptop-1'"
NODE_JSON=$(curl -fsS -X POST -H "$AUTH" -H 'content-type: application/json' \
  -d '{"name":"laptop-1","tags":["dev"]}' "$API/v1/nodes")
echo "$NODE_JSON" | j
NODE_ID=$(echo "$NODE_JSON" | field "['node']['id']")
REGTOK=$(echo "$NODE_JSON" | field "['register_token']")
echo "node_id=$NODE_ID regtok=${REGTOK:0:16}..."

echo "==> list nodes"; curl -fsS -H "$AUTH" "$API/v1/nodes" | j

echo "==> create skill task (no approval)"
curl -fsS -X POST -H "$AUTH" -H 'content-type: application/json' \
  -d '{"title":"hello","kind":"skill","payload":{"name":"notes","args":{}}}' \
  "$API/v1/tasks" | j

echo "==> create command task (needs approval)"
CMD_TASK=$(curl -fsS -X POST -H "$AUTH" -H 'content-type: application/json' \
  -d "{\"title\":\"ls\",\"kind\":\"command\",\"node_id\":\"$NODE_ID\",\"payload\":{\"cmd\":[\"ls\",\"-la\"]}}" \
  "$API/v1/tasks")
echo "$CMD_TASK" | j
TASK_ID=$(echo "$CMD_TASK" | field "['id']")

echo "==> pending approvals"
PEND=$(curl -fsS -H "$AUTH" "$API/v1/approvals")
echo "$PEND" | j
APPR_ID=$(echo "$PEND" | python3 -c 'import sys,json; print(json.load(sys.stdin)[0]["id"])')

echo "==> approve"
curl -fsS -X POST -H "$AUTH" -H 'content-type: application/json' \
  -d '{"approve":true}' "$API/v1/approvals/$APPR_ID/decide" | j

echo "==> task after approval"
curl -fsS -H "$AUTH" "$API/v1/tasks/$TASK_ID" | j

echo "==> audit (tail)"
curl -fsS -H "$AUTH" "$API/v1/audit?limit=10" | j

echo "==> done"
