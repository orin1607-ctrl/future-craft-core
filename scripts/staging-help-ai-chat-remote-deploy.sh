#!/bin/bash
# Runs on the ops host. Deploys help-ai-chat to Staging only.
# Does not print tokens, does not deploy any other project, does not touch the web root.
set -euo pipefail
umask 077
STAGING=usfeoerkpcafxxlyuldl
ROOT=/tmp/dalia-staging-help-ai-chat
PROD_REF=qasomfndnjuixgjmjwcm
if [ "$STAGING" = "$PROD_REF" ]; then
  echo 'ABORT_STAGING_IS_PROD'
  exit 1
fi

cleanup() {
  rm -f "$ROOT/use_token" 2>/dev/null || true
  unset SUPABASE_ACCESS_TOKEN || true
  rm -rf "$ROOT" 2>/dev/null || true
}
trap cleanup EXIT

test -f "$ROOT/supabase/functions/help-ai-chat/index.ts"
grep -q 'gemini-3.8-flash' "$ROOT/supabase/functions/help-ai-chat/index.ts"
if grep -q "$PROD_REF" "$ROOT/supabase/functions/help-ai-chat/index.ts"; then
  echo 'ABORT_SOURCE_HAS_PROD_REF'
  exit 1
fi

python3 - <<'PY'
import json, re, ssl
from pathlib import Path
from urllib.request import Request, urlopen

STAGING = "usfeoerkpcafxxlyuldl"
PROD = "qasomfndnjuixgjmjwcm"
ROOT = Path("/tmp/dalia-staging-help-ai-chat")
files = [
    Path("/root/dalia-ops/.env"),
    Path("/root/.supabase/access-token"),
    Path("/root/future-craft-core/.env"),
    Path("/root/future-craft-core/supabase/.temp/profile"),
    Path("/root/prod/.env"),
]
root = Path("/root")
if root.exists():
    scanned = 0
    for path in root.rglob("*"):
        if scanned > 500:
            break
        if not path.is_file():
            continue
        if any(part in {"node_modules", ".git", "dist", "site-static"} for part in path.parts):
            continue
        try:
            if path.stat().st_size > 300_000:
                continue
        except OSError:
            continue
        scanned += 1
        name = path.name.lower()
        if path.suffix.lower() in {".env", ".txt", ".json", ".yml", ".yaml", ".sh"} or name.startswith(".env") or "token" in name or "secret" in name:
            files.append(path)

seen = set()
candidates = []
for path in files:
    if not path.is_file() or str(path) in seen:
        continue
    seen.add(str(path))
    try:
        text = path.read_text(errors="ignore")
    except OSError:
        continue
    if PROD in text and STAGING not in text and "sbp_" not in text:
        continue
    for match in re.findall(r"sbp_[A-Za-z0-9]{20,}", text):
        candidates.append((path.name, match))
    for line in text.splitlines():
        if "ACCESS_TOKEN" not in line or "=" not in line:
            continue
        value = line.split("=", 1)[1].strip().strip('"').strip("'")
        if value.lower().startswith("bearer "):
            value = value.split(None, 1)[1].strip()
        if value.startswith("sbp_"):
            candidates.append((path.name, value))

unique = []
used = set()
for label, value in candidates:
    if value in used or PROD in value:
        continue
    used.add(value)
    unique.append((label, value))

ctx = ssl.create_default_context()
chosen = None
probes = []
for label, value in unique[:8]:
    kind = "sbp" if value.startswith("sbp_") else "other"
    req = Request(
        f"https://api.supabase.com/v1/projects/{STAGING}",
        headers={"Authorization": f"Bearer {value}", "Accept": "application/json"},
    )
    status = 0
    ref = None
    message = ""
    try:
        with urlopen(req, context=ctx, timeout=30) as res:
            status = res.status
            body = res.read().decode("utf-8", "replace")
    except Exception as exc:
        status = getattr(exc, "code", 0) or 0
        raw = getattr(exc, "read", lambda: b"")()
        body = raw.decode("utf-8", "replace") if raw else str(exc)
    if PROD in body:
        print(json.dumps({"abort": "probe_body_mentions_prod", "source": label}))
        raise SystemExit(1)
    try:
        parsed = json.loads(body)
        ref = parsed.get("ref")
        message = str(parsed.get("message") or "")[:120]
    except Exception:
        message = body[:120]
    probes.append({"source": label, "token_len": len(value), "token_kind": kind, "http": status, "ref": ref, "message": message})
    if status == 200 and ref not in (None, STAGING):
        continue
    if status == 200 and STAGING in body:
        chosen = value
        break

print(json.dumps({"token_probes": probes, "chosen": bool(chosen)}, ensure_ascii=False))
if not chosen:
    raise SystemExit(2)
(ROOT / "use_token").write_text(chosen)
PY

export SUPABASE_ACCESS_TOKEN
SUPABASE_ACCESS_TOKEN="$(cat "$ROOT/use_token")"
rm -f "$ROOT/use_token"
if [ -z "${SUPABASE_ACCESS_TOKEN}" ]; then
  echo 'NO_WORKING_TOKEN'
  exit 1
fi

python3 - <<'PY' || true
import json, os, re, ssl
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from datetime import datetime, timedelta, timezone
STAGING = "usfeoerkpcafxxlyuldl"
token = os.environ["SUPABASE_ACCESS_TOKEN"]
end = datetime.now(timezone.utc)
start = end - timedelta(minutes=45)
query = urlencode({
    "iso_timestamp_start": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
    "iso_timestamp_end": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
})
url = f"https://api.supabase.com/v1/projects/{STAGING}/analytics/endpoints/logs.edge-logs?{query}"
req = Request(url, headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
try:
    with urlopen(req, context=ssl.create_default_context(), timeout=40) as res:
        status, body = res.status, res.read().decode("utf-8", "replace")
except Exception as exc:
    status = getattr(exc, "code", 0) or 0
    raw = getattr(exc, "read", lambda: b"")()
    body = raw.decode("utf-8", "replace") if raw else str(exc)

def redact(value):
    value = value.replace(token, "[token]")
    value = re.sub(r"sbp_[A-Za-z0-9]+", "sbp_[redacted]", value)
    value = re.sub(r"eyJ[A-Za-z0-9_\-\.]+", "jwt_[redacted]", value)
    value = re.sub(r"sk-[A-Za-z0-9_\-]+", "sk_[redacted]", value)
    return value

hits = []
for marker in ("AI gateway error", "help-ai-chat error"):
    start_at = 0
    while len(hits) < 5:
        idx = body.find(marker, start_at)
        if idx < 0:
            break
        hits.append(redact(body[max(0, idx - 80):idx + 320]))
        start_at = idx + len(marker)
print(json.dumps({"edge_logs_http": status, "gateway_hits": hits[:5], "log_len": len(body)}, ensure_ascii=False))
PY
true

cd "$ROOT"
if command -v supabase >/dev/null 2>&1; then
  deploy_cmd=(supabase)
else
  deploy_cmd=(npx --yes supabase)
fi
set +e
deploy_out="$("${deploy_cmd[@]}" functions deploy help-ai-chat --project-ref "$STAGING" --use-api --workdir "$ROOT" 2>&1)"
deploy_code=$?
set -e
DEPLOY_OUT="$deploy_out" DEPLOY_CODE="$deploy_code" python3 - <<'PY'
import json, os, re
text = os.environ.get("DEPLOY_OUT", "")
text = re.sub(r"sbp_[A-Za-z0-9]+", "sbp_[redacted]", text)
text = re.sub(r"eyJ[A-Za-z0-9_\-\.]+", "jwt_[redacted]", text)
text = re.sub(r"postgres(?:ql)?://\S+", "pg_[redacted]", text)
print(json.dumps({"deploy_exit": int(os.environ.get("DEPLOY_CODE", "1")), "deploy_tail": text[-600:]}, ensure_ascii=False))
PY
if [ "$deploy_code" -ne 0 ]; then
  exit "$deploy_code"
fi

python3 - <<'PY'
import json, os, ssl
from urllib.request import Request, urlopen
STAGING = "usfeoerkpcafxxlyuldl"
token = os.environ["SUPABASE_ACCESS_TOKEN"]
req = Request(
    f"https://api.supabase.com/v1/projects/{STAGING}/functions/help-ai-chat/body",
    headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
)
try:
    with urlopen(req, context=ssl.create_default_context(), timeout=40) as res:
        status, body = res.status, res.read().decode("utf-8", "replace")
except Exception as exc:
    status = getattr(exc, "code", 0) or 0
    raw = getattr(exc, "read", lambda: b"")()
    body = raw.decode("utf-8", "replace") if raw else str(exc)
print(json.dumps({
    "body_http": status,
    "has_current_model": "gemini-3.8-flash" in body,
}, ensure_ascii=False))
PY

echo 'STAGING_HELP_AI_CHAT_DEPLOYED'
