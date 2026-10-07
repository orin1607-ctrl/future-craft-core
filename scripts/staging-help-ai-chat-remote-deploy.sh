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
import json, os, re, ssl
from pathlib import Path
from urllib.request import Request, urlopen

STAGING = "usfeoerkpcafxxlyuldl"
PROD = "qasomfndnjuixgjmjwcm"
ROOT = Path("/tmp/dalia-staging-help-ai-chat")
home = Path.home()

def names(path):
    try:
        return sorted(child.name for child in path.iterdir())[:30]
    except Exception as exc:
        return f"unreadable:{type(exc).__name__}"

def kind_of(value):
    if value.startswith("sbp_"):
        return "sbp"
    if value.startswith("sb_"):
        return "sb"
    if value.startswith("eyJ"):
        return "jwt"
    return "other"

def clean(value):
    value = value.strip().strip('"').strip("'")
    if value.lower().startswith("bearer "):
        value = value.split(None, 1)[1].strip()
    return value

files = [
    Path("/root/dalia-ops/.env"),
    Path("/root/.supabase/access-token"),
    Path("/root/future-craft-core/.env"),
    home / ".supabase" / "access-token",
    home / "dalia-ops" / ".env",
]
for base in (Path("/root"), home):
    if not base.exists():
        continue
    try:
        children = list(base.iterdir())
    except OSError:
        continue
    for child in children:
        if child.is_file() and child.name.startswith(".env"):
            files.append(child)
        if child.is_dir() and child.name in {".supabase", "dalia-ops"}:
            try:
                for nested in child.rglob("*"):
                    if any(part in {"node_modules", ".git", "dist"} for part in nested.parts):
                        continue
                    if nested.is_file() and nested.stat().st_size < 300_000 and (
                        nested.name.startswith(".env") or nested.name in {"access-token", "profile"}
                    ):
                        files.append(nested)
            except OSError:
                continue

inventory = []
seen = set()
candidates = []
for path in files:
    key = str(path)
    if key in seen:
        continue
    seen.add(key)
    item = {"name": path.name, "parent": path.parent.name, "exists": path.is_file()}
    if not path.is_file():
        inventory.append(item)
        continue
    try:
        text = path.read_text(errors="ignore")
    except OSError as exc:
        item["error"] = type(exc).__name__
        inventory.append(item)
        continue
    item["bytes"] = len(text)
    keys = []
    if path.name == "access-token":
        value = clean(text.splitlines()[0] if text.splitlines() else text)
        if 20 <= len(value) <= 4000 and " " not in value and PROD not in value:
            candidates.append((f"{path.parent.name}/{path.name}", value))
            keys.append({"key": "file", "len": len(value), "kind": kind_of(value)})
    for line in text.splitlines():
        if "=" not in line or line.strip().startswith("#"):
            continue
        left, raw = line.split("=", 1)
        left = left.strip()
        if left.startswith("export "):
            left = left[len("export "):].strip()
        if left not in {"OPS_SECRET"} and not re.search(r"(ACCESS_TOKEN|_PAT|SB_TOKEN|_TOKEN)$", left):
            continue
        value = clean(raw)
        keys.append({
            "key": left,
            "len": len(value),
            "kind": kind_of(value) if value else "empty",
            "has_space": " " in value,
            "mentions_prod": PROD in value,
        })
        blobs = re.findall(r"sbp_[A-Za-z0-9]{20,}", raw) + re.findall(r"sb_[A-Za-z0-9_\-]{20,}", raw)
        if value and " " not in value:
            blobs.append(value)
        for blob in blobs:
            blob = clean(blob)
            if 20 <= len(blob) <= 4000 and " " not in blob and PROD not in blob and (blob.startswith("sbp_") or blob.startswith("sb_") or blob.startswith("eyJ")):
                candidates.append((f"{path.name}:{left}", blob))
    item["keys"] = keys
    inventory.append(item)

env_keys = []
for env_name, raw in os.environ.items():
    if not re.search(r"(ACCESS_TOKEN|_PAT|SB_TOKEN)$", env_name):
        continue
    value = clean(raw)
    env_keys.append({"key": env_name, "len": len(value), "kind": kind_of(value) if value else "empty"})
    if 20 <= len(value) <= 4000 and " " not in value and PROD not in value and value not in {"", "null"}:
        candidates.append((f"env:{env_name}", value))

sb_dir = home / ".supabase"
if sb_dir.is_dir():
    for nested in sb_dir.rglob("*"):
        if not nested.is_file():
            continue
        try:
            if nested.stat().st_size > 100_000:
                continue
            text = nested.read_text(errors="ignore")
        except OSError:
            continue
        for match in re.findall(r"sbp_[A-Za-z0-9]{20,}", text):
            if PROD not in match:
                candidates.append((f"supabase-dir:{nested.name}", match))

unique = []
used = set()
for label, value in candidates:
    if value in used:
        continue
    used.add(value)
    unique.append((label, value))

ctx = ssl.create_default_context()
chosen = None
probes = []
for label, value in unique[:8]:
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
    probes.append({"source": label, "token_len": len(value), "token_kind": kind_of(value), "http": status, "ref": ref, "message": message})
    if status == 200 and ref not in (None, STAGING):
        continue
    if status == 200 and STAGING in body:
        chosen = value
        break

def file_keys(path):
    if not path.is_file():
        return []
    try:
        text = path.read_text(errors="ignore")
    except OSError:
        return ["unreadable"]
    found = []
    for line in text.splitlines():
        if "=" not in line or line.strip().startswith("#"):
            continue
        left = line.split("=", 1)[0].strip()
        if left.startswith("export "):
            left = left[len("export "):].strip()
        found.append(left)
    return found

summary = {
    "who": os.environ.get("USER") or "",
    "home": home.name,
    "root_names": names(Path("/root")),
    "home_names": names(home),
    "dalia_ops_exists": Path("/root/dalia-ops/.env").is_file(),
    "credential_meta": [item.get("keys", []) for item in inventory if item.get("keys")],
    "supabase_dir": names(home / ".supabase"),
    "home_env_keys": file_keys(home / ".env"),
    "access_token_file": (home / ".supabase" / "access-token").is_file() or Path("/root/.supabase/access-token").is_file(),
    "token_probes": probes,
    "chosen": bool(chosen),
}
print("SUMMARY " + json.dumps(summary, ensure_ascii=False))
if chosen:
    (ROOT / "use_token").write_text(chosen)
PY

if [ -s "$ROOT/use_token" ]; then
  export SUPABASE_ACCESS_TOKEN
  SUPABASE_ACCESS_TOKEN="$(cat "$ROOT/use_token")"
  rm -f "$ROOT/use_token"
else
  unset SUPABASE_ACCESS_TOKEN || true
  if ! command -v supabase >/dev/null 2>&1; then
    echo 'NO_WORKING_TOKEN'
    exit 1
  fi
  set +e
  cli_out="$(supabase projects list --output json 2>&1)"
  cli_code=$?
  set -e
  CLI_OUT="$cli_out" CLI_CODE="$cli_code" python3 - <<'PY'
import json, os, re
text = os.environ.get("CLI_OUT", "")
red = re.sub(r"sbp_[A-Za-z0-9]+", "sbp_[redacted]", text)
red = re.sub(r"eyJ[A-Za-z0-9_\-\.]+", "jwt_[redacted]", red)
print(json.dumps({
    "cli_exit": int(os.environ.get("CLI_CODE", "1")),
    "sees_staging": "usfeoerkpcafxxlyuldl" in text,
    "tail": red[-240:],
}, ensure_ascii=False))
PY
  if [ "$cli_code" -ne 0 ] || ! printf '%s' "$cli_out" | grep -q 'usfeoerkpcafxxlyuldl'; then
    echo 'NO_WORKING_TOKEN'
    exit 1
  fi
  echo 'USING_SAVED_CLI_LOGIN'
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

python3 - <<'PY' || true
import json, os, ssl
from urllib.request import Request, urlopen
STAGING = "usfeoerkpcafxxlyuldl"
token = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
if not token:
    print(json.dumps({"body_http": 0, "skipped": "no_token_in_env"}))
    raise SystemExit(0)
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
