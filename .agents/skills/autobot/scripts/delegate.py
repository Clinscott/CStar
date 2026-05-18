#!/usr/bin/env python3
"""autobot — delegate a single bounded task to a Hermes/MiniMax-M2.7 sub-agent.

Host-native skill bridge contract:
  https://github.com/morderith/Corvus  →  CStar/docs/host-native-skill-bridge.md

Usage (from the host harness — Bash tool, MCP wrapper, or interactive):
  python3 delegate.py --intent-file path/to/intent.json
  python3 delegate.py --intent "..." --project-root /repo --target-paths a,b

Returns a JSON result envelope on stdout. Exit 0 on ok, 1 on degraded
(Hermes failed but the contract was honored), 2 on invalid intent.

Every invocation appends one record to the cost ledger:
  CStar/.agents/state/autobot-cost-ledger.jsonl

Invariants (enforced here, documented in SKILL.md):
  - No nested delegation (HERMES_AUTOBOT_DELEGATED env guard)
  - No writes outside payload.write_to / cost ledger / lock file
  - No fallback to other providers when MiniMax is unreachable
  - Lock granularity = (project_root, intent_hash)
"""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

CHARS_PER_TOKEN_ESTIMATE = 4
DEFAULT_MODEL = "MiniMax-M2.7"
DEFAULT_PROFILE = "cstar-hub"
DEFAULT_EXPECTED_OUTPUT = "markdown"
DEFAULT_MAX_CHARS = 4000
DEFAULT_TIMEOUT = 300
TARGET_PATH_BYTE_CAP = 32 * 1024  # per-file read cap to avoid prompt bloat
NESTED_GUARD_ENV = "HERMES_AUTOBOT_DELEGATED"


# ── path helpers ──────────────────────────────────────────────────────────

def _cstar_root() -> Path:
    """CStar repo root — anchors the cost ledger and lock dir.
    Marker: `.agents/skill_registry.json` (distinctive — `.agents/` alone
    is ambiguous because some tools create stray `.agents/.agents/` subdirs).
    """
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / ".agents" / "skill_registry.json").is_file():
            return parent
    return Path.home() / "Corvus" / "CStar"  # fallback


CSTAR_ROOT = _cstar_root()
STATE_DIR = CSTAR_ROOT / ".agents" / "state"
LEDGER_PATH = STATE_DIR / "autobot-cost-ledger.jsonl"


# ── time helpers ──────────────────────────────────────────────────────────

def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S%z")


def filename_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d-%H%M%S")


# ── intent validation ────────────────────────────────────────────────────

class InvalidIntent(ValueError):
    pass


VALID_OUTPUTS = {"markdown", "json", "plain"}


def validate_intent(raw: dict) -> dict:
    """Validate + normalize the intent dict. Raises InvalidIntent on failure."""
    if not isinstance(raw, dict):
        raise InvalidIntent("intent must be a JSON object")
    intent = raw.get("intent")
    if not isinstance(intent, str) or not intent.strip():
        raise InvalidIntent("intent.intent must be a non-empty string")
    project_root = raw.get("project_root")
    if not isinstance(project_root, str) or not project_root.strip():
        raise InvalidIntent("intent.project_root must be a non-empty string path")

    target_paths = raw.get("target_paths", []) or []
    if not isinstance(target_paths, list) or not all(isinstance(p, str) for p in target_paths):
        raise InvalidIntent("intent.target_paths must be a list of strings")

    payload = raw.get("payload", {}) or {}
    if not isinstance(payload, dict):
        raise InvalidIntent("intent.payload must be an object")

    expected_output = payload.get("expected_output", DEFAULT_EXPECTED_OUTPUT)
    if expected_output not in VALID_OUTPUTS:
        raise InvalidIntent(f"payload.expected_output must be one of {sorted(VALID_OUTPUTS)}")

    return {
        "intent": intent.strip(),
        "project_root": project_root,
        "target_paths": list(target_paths),
        "payload": {
            "hermes_profile": payload.get("hermes_profile", DEFAULT_PROFILE),
            "model": payload.get("model", DEFAULT_MODEL),
            "expected_output": expected_output,
            "max_chars": int(payload.get("max_chars", DEFAULT_MAX_CHARS)),
            "session_name": payload.get("session_name"),
            "write_to": payload.get("write_to"),
            "append_with_separator": payload.get("append_with_separator"),
            "tags": list(payload.get("tags", []) or []),
            "timeout_seconds": int(payload.get("timeout_seconds", DEFAULT_TIMEOUT)),
        },
    }


def intent_id(intent: dict) -> str:
    """Stable id for an intent — used for the lock file + ledger linkage."""
    canonical = json.dumps(intent, sort_keys=True)
    h = hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:8]
    return f"intent-{filename_stamp()}-{h}"


def intent_hash(intent: dict) -> str:
    canonical = json.dumps(intent, sort_keys=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]


# ── target path materialization ───────────────────────────────────────────

def materialize_targets(intent: dict) -> tuple[list[dict], list[str]]:
    """Read each target_path. Returns (entries, missing_paths).
    Each entry: {path, bytes, content, truncated}.
    """
    entries: list[dict] = []
    missing: list[str] = []
    project_root = Path(intent["project_root"])
    for raw_path in intent["target_paths"]:
        # Allow ~ + absolute + relative-to-project_root
        p = Path(os.path.expanduser(raw_path))
        if not p.is_absolute():
            p = project_root / p
        if not p.exists() or not p.is_file():
            missing.append(str(p))
            continue
        try:
            data = p.read_bytes()
        except OSError as exc:
            missing.append(f"{p}: {exc}")
            continue
        truncated = False
        if len(data) > TARGET_PATH_BYTE_CAP:
            data = data[:TARGET_PATH_BYTE_CAP]
            truncated = True
        try:
            content = data.decode("utf-8", errors="replace")
        except Exception:
            content = repr(data)
        entries.append({
            "path": str(p),
            "bytes": len(data),
            "content": content,
            "truncated": truncated,
        })
    return entries, missing


# ── prompt builder ────────────────────────────────────────────────────────

def build_prompt(intent: dict, materials: list[dict]) -> str:
    p = intent["payload"]
    parts = [
        "You are a Hermes-managed sub-agent invoked via the CStar autobot skill.",
        f"Profile: {p['hermes_profile']}.  Model: {p['model']}.",
        "",
        f"INTENT: {intent['intent']}",
        "",
    ]
    if materials:
        parts.append("MATERIALS:")
        for m in materials:
            tag = " [TRUNCATED]" if m["truncated"] else ""
            parts.append(f"\n--- {m['path']} ({m['bytes']} bytes){tag} ---")
            parts.append(m["content"])
            parts.append("--- end ---")
        parts.append("")

    parts.extend([
        "OUTPUT REQUIREMENTS:",
        f"- Format: {p['expected_output']}",
        f"- Soft length cap: {p['max_chars']} characters",
    ])
    if p["expected_output"] == "json":
        parts.append("- Output ONLY valid JSON (no markdown fences, no prose).")
    elif p["expected_output"] == "markdown":
        parts.append("- Output Markdown only. Do not wrap the whole response in a code fence.")
    elif p["expected_output"] == "plain":
        parts.append("- Output plain text only. No markdown, no JSON.")
    if p["append_with_separator"]:
        parts.append(
            f"- Output will be appended after a `{p['append_with_separator']}` separator "
            "in an existing file. Do not include the separator yourself."
        )
    parts.append("")
    parts.append("Begin output now.")
    return "\n".join(parts)


# ── Hermes invocation ────────────────────────────────────────────────────

def get_minimax_key() -> str:
    mk = os.environ.get("MINIMAX_API_KEY", "")
    if not mk:
        env_path = Path.home() / ".hermes" / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if line.startswith("MINIMAX_API_KEY="):
                    return line.split("=", 1)[1].strip()
    return mk


def _hermes_profile_exists(profile: str) -> bool:
    """Quick filesystem check — Hermes profiles live at ~/.hermes/profiles/<name>/.
    A missing profile would otherwise fail deep in the subprocess with a
    confusing error; better to surface 'profile_not_found' up front.
    """
    return (Path.home() / ".hermes" / "profiles" / profile).is_dir()


def invoke_hermes(intent: dict, prompt: str) -> dict:
    """Returns {ok, response, error, duration_ms}."""
    p = intent["payload"]
    started = time.time()

    if not _hermes_profile_exists(p["hermes_profile"]):
        return {"ok": False, "response": "",
                "error": f"profile_not_found:{p['hermes_profile']}",
                "duration_ms": int((time.time() - started) * 1000)}

    mk = get_minimax_key()
    if not mk:
        return {"ok": False, "response": "", "error": "no_minimax_key",
                "duration_ms": int((time.time() - started) * 1000)}

    base_cmd = [
        "hermes", "--profile", p["hermes_profile"],
        "--provider", "minimax", "--model", p["model"],
        "chat", "-q", prompt, "--quiet",
    ]

    # [Ω] STABILITY: Enforce memory caps on sub-agent Node.js processes (e.g. agent-browser).
    # We explicitly set NODE_OPTIONS here to ensure inheritance even if the caller env is loose.
    env = {
        **os.environ,
        "MINIMAX_API_KEY": mk,
        NESTED_GUARD_ENV: "1",
        "NODE_OPTIONS": "--max-old-space-size=2048 --expose-gc"
    }
    session_name = p.get("session_name")

    def _run(cmd):
        try:
            r = subprocess.run(cmd, capture_output=True, text=True,
                               timeout=p["timeout_seconds"], env=env)
            return r, None
        except subprocess.TimeoutExpired:
            return None, f"hermes_timeout_{p['timeout_seconds']}s"
        except FileNotFoundError:
            return None, "hermes_not_installed"
        except Exception as exc:
            return None, f"hermes_exception:{exc}"

    # Try with --continue first if session_name was provided. Fall back to a
    # fresh session if Hermes reports the session doesn't exist yet ("No
    # session found matching '...'") — the operator can chain follow-up
    # calls once they have the session id from the first response.
    if session_name:
        r, err = _run(base_cmd + ["--continue", session_name])
        if err is None and r.returncode != 0 and "No session found" in (r.stdout + r.stderr):
            # Cold start: drop --continue and run fresh
            r, err = _run(base_cmd)
    else:
        r, err = _run(base_cmd)

    if err:
        return {"ok": False, "response": "", "error": err,
                "duration_ms": int((time.time() - started) * 1000)}

    duration_ms = int((time.time() - started) * 1000)
    if r.returncode != 0:
        return {"ok": False, "response": r.stdout,
                "error": f"hermes_exit_{r.returncode}: {r.stderr[:200]}",
                "duration_ms": duration_ms}
    return {"ok": True, "response": r.stdout, "error": None,
            "duration_ms": duration_ms}


# ── output validation ────────────────────────────────────────────────────

def validate_output(response: str, expected: str) -> tuple[str, str | None]:
    """Returns (cleaned_response, error_or_none).
    Strips Hermes session-id banners; verifies basic shape.
    """
    # Strip leading 'session_id: ...' / blank lines that hermes emits
    lines = response.splitlines()
    filtered = []
    skipping = True
    for ln in lines:
        if skipping and (not ln.strip() or ln.startswith("session_id:")
                         or ln.startswith("⚠")):
            continue
        skipping = False
        filtered.append(ln)
    cleaned = "\n".join(filtered).strip()

    if not cleaned:
        return cleaned, "empty_response"

    if expected == "json":
        # Try to parse the whole string first; if that fails, scan for any
        # balanced-brace JSON blob and return the last one that parses. This
        # tolerates models that preface the JSON with prose despite instructions.
        try:
            json.loads(cleaned)
            return cleaned, None
        except json.JSONDecodeError:
            pass
        # Hand-rolled brace-counting scanner — non-greedy regex doesn't handle
        # nested braces correctly, and a stack walker is cheap.
        candidates: list[str] = []
        for start in range(len(cleaned)):
            if cleaned[start] != "{":
                continue
            depth = 0
            for end in range(start, len(cleaned)):
                ch = cleaned[end]
                if ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0:
                        candidates.append(cleaned[start:end + 1])
                        break
        for blob in reversed(candidates):
            try:
                json.loads(blob)
                return blob, None
            except json.JSONDecodeError:
                continue
        return cleaned, "json_parse_failed"

    return cleaned, None


# ── artifact writing ──────────────────────────────────────────────────────

def write_artifact(response: str, intent: dict) -> str | None:
    p = intent["payload"]
    target = p.get("write_to")
    if not target:
        return None
    target_path = Path(os.path.expanduser(target))
    target_path.parent.mkdir(parents=True, exist_ok=True)
    sep = p.get("append_with_separator")
    if sep:
        # Append; precede with separator on its own line
        with open(target_path, "a") as f:
            f.write(f"\n{sep}\n{response}\n" if response else "")
    else:
        target_path.write_text(response + ("\n" if not response.endswith("\n") else ""))
    return str(target_path)


# ── cost ledger ──────────────────────────────────────────────────────────

def append_ledger(record: dict) -> int:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    with open(LEDGER_PATH, "a") as f:
        f.write(json.dumps(record) + "\n")
    # Return 1-based line number of the appended record
    with open(LEDGER_PATH) as f:
        return sum(1 for _ in f)


def make_ledger_entry(intent: dict, intent_id_str: str, prompt: str,
                      response: str, status: str, error: str | None,
                      duration_ms: int) -> dict:
    p = intent["payload"]
    return {
        "timestamp": now_iso(),
        "intent_id": intent_id_str,
        "intent_hash": intent_hash(intent),
        "intent_summary": intent["intent"][:160],
        "status": status,
        "error": error,
        "duration_ms": duration_ms,
        "model": p["model"],
        "hermes_profile": p["hermes_profile"],
        "session_name": p.get("session_name"),
        "expected_output": p["expected_output"],
        "prompt_chars": len(prompt or ""),
        "response_chars": len(response or ""),
        "est_prompt_tokens": (len(prompt or "") + CHARS_PER_TOKEN_ESTIMATE - 1) // CHARS_PER_TOKEN_ESTIMATE,
        "est_response_tokens": (len(response or "") + CHARS_PER_TOKEN_ESTIMATE - 1) // CHARS_PER_TOKEN_ESTIMATE,
        "tags": p.get("tags", []),
        "wrote_to": p.get("write_to"),
    }


# ── main delegation flow ─────────────────────────────────────────────────

def delegate(intent: dict) -> dict:
    """Single delegation. Returns the result envelope."""
    iid = intent_id(intent)
    ihash = intent_hash(intent)

    # Nested-delegation guard
    if os.environ.get(NESTED_GUARD_ENV):
        envelope = {
            "status": "degraded",
            "degraded_reason": "nested_delegation_forbidden",
            "intent_id": iid,
            "duration_ms": 0,
        }
        append_ledger(make_ledger_entry(intent, iid, "", "", "degraded",
                                        "nested_delegation_forbidden", 0))
        return envelope

    # Lock — prevent same intent firing twice in parallel
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    lock_path = STATE_DIR / f"autobot.{ihash}.lock"
    with open(lock_path, "w") as lock_f:
        try:
            fcntl.flock(lock_f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            envelope = {
                "status": "degraded",
                "degraded_reason": "lock_held",
                "intent_id": iid,
                "duration_ms": 0,
            }
            append_ledger(make_ledger_entry(intent, iid, "", "", "degraded",
                                            "lock_held", 0))
            return envelope

        try:
            lock_f.write(f"pid={os.getpid()} at={now_iso()}\n")
            lock_f.flush()

            materials, missing = materialize_targets(intent)
            prompt = build_prompt(intent, materials)
            call = invoke_hermes(intent, prompt)

            if not call["ok"]:
                line = append_ledger(make_ledger_entry(
                    intent, iid, prompt, call["response"], "degraded",
                    call["error"], call["duration_ms"]))
                return {
                    "status": "degraded",
                    "degraded_reason": call["error"],
                    "intent_id": iid,
                    "duration_ms": call["duration_ms"],
                    "response_chars": len(call["response"] or ""),
                    "est_prompt_tokens": (len(prompt) + CHARS_PER_TOKEN_ESTIMATE - 1) // CHARS_PER_TOKEN_ESTIMATE,
                    "est_response_tokens": (len(call["response"]) + CHARS_PER_TOKEN_ESTIMATE - 1) // CHARS_PER_TOKEN_ESTIMATE,
                    "model": intent["payload"]["model"],
                    "hermes_profile": intent["payload"]["hermes_profile"],
                    "wrote_to": None,
                    "missing_targets": missing,
                    "ledger_entry": f"{LEDGER_PATH}#L{line}",
                }

            cleaned, val_err = validate_output(call["response"],
                                                intent["payload"]["expected_output"])
            if val_err:
                line = append_ledger(make_ledger_entry(
                    intent, iid, prompt, cleaned, "degraded",
                    f"output_validation_failed:{val_err}", call["duration_ms"]))
                return {
                    "status": "degraded",
                    "degraded_reason": f"output_validation_failed:{val_err}",
                    "intent_id": iid,
                    "duration_ms": call["duration_ms"],
                    "response_chars": len(cleaned),
                    "est_prompt_tokens": (len(prompt) + CHARS_PER_TOKEN_ESTIMATE - 1) // CHARS_PER_TOKEN_ESTIMATE,
                    "est_response_tokens": (len(cleaned) + CHARS_PER_TOKEN_ESTIMATE - 1) // CHARS_PER_TOKEN_ESTIMATE,
                    "model": intent["payload"]["model"],
                    "hermes_profile": intent["payload"]["hermes_profile"],
                    "wrote_to": None,
                    "missing_targets": missing,
                    "ledger_entry": f"{LEDGER_PATH}#L{line}",
                }

            wrote_to = write_artifact(cleaned, intent)
            line = append_ledger(make_ledger_entry(
                intent, iid, prompt, cleaned, "ok", None, call["duration_ms"]))
            return {
                "status": "ok",
                "degraded_reason": None,
                "intent_id": iid,
                "duration_ms": call["duration_ms"],
                "response_chars": len(cleaned),
                "est_prompt_tokens": (len(prompt) + CHARS_PER_TOKEN_ESTIMATE - 1) // CHARS_PER_TOKEN_ESTIMATE,
                "est_response_tokens": (len(cleaned) + CHARS_PER_TOKEN_ESTIMATE - 1) // CHARS_PER_TOKEN_ESTIMATE,
                "model": intent["payload"]["model"],
                "hermes_profile": intent["payload"]["hermes_profile"],
                "wrote_to": wrote_to,
                "missing_targets": missing,
                "ledger_entry": f"{LEDGER_PATH}#L{line}",
                "response": None if wrote_to else cleaned,
            }
        finally:
            try:
                fcntl.flock(lock_f.fileno(), fcntl.LOCK_UN)
            except OSError:
                pass


# ── CLI ──────────────────────────────────────────────────────────────────

def _load_intent_from_args(args) -> dict:
    if args.intent_file:
        with open(os.path.expanduser(args.intent_file)) as f:
            return json.load(f)
    if not args.intent or not args.project_root:
        raise InvalidIntent("either --intent-file OR (--intent + --project-root) required")
    payload = {}
    if args.payload_file:
        with open(os.path.expanduser(args.payload_file)) as f:
            payload = json.load(f)
    return {
        "intent": args.intent,
        "project_root": args.project_root,
        "target_paths": args.target_paths.split(",") if args.target_paths else [],
        "payload": payload,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="autobot — delegate a task to Hermes/MiniMax-M2.7")
    parser.add_argument("--intent-file", help="path to JSON intent file")
    parser.add_argument("--intent", help="intent statement (when not using --intent-file)")
    parser.add_argument("--project-root", help="project root path (with --intent)")
    parser.add_argument("--target-paths", help="comma-separated paths (with --intent)")
    parser.add_argument("--payload-file", help="path to JSON payload file (with --intent)")
    args = parser.parse_args()

    try:
        raw = _load_intent_from_args(args)
        intent = validate_intent(raw)
    except InvalidIntent as exc:
        print(json.dumps({"status": "invalid_intent", "error": str(exc)}, indent=2), file=sys.stderr)
        return 2
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        print(json.dumps({"status": "invalid_intent", "error": f"intent_file_unreadable:{exc}"}, indent=2), file=sys.stderr)
        return 2

    envelope = delegate(intent)
    print(json.dumps(envelope, indent=2, default=str))
    return 0 if envelope["status"] == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
