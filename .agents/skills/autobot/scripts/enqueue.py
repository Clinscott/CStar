#!/usr/bin/env python3
"""autobot — enqueue an intent for later async processing by queue_processor.py.

Use enqueue when:
  - The work doesn't need to block the host LLM right now
  - You want batched processing on cron
  - You want a durable record even if the host LLM session ends mid-flight

Use delegate.py directly when:
  - You need the result back synchronously in the current host turn
  - The intent is one-off (no point queuing)

Queue file: .agents/state/autobot-queue.jsonl
Format: one JSON object per line, fields:
  { task_id, status, enqueued_at, intent (full intent dict),
    started_at?, completed_at?, result_envelope?, error? }

Status transitions: pending → running → done | failed | dead_letter

Usage:
  python3 enqueue.py --intent-file path/to/intent.json [--priority high|normal|low]
  python3 enqueue.py --intent "..." --project-root /path [--priority normal]

Returns the task_id on stdout (one line) so the caller can track it.
Inspect with: queue_inspect.py [--status pending|running|done|failed]
"""
from __future__ import annotations

import argparse
import fcntl
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Reuse delegate.py's resolution + validation
sys.path.insert(0, str(Path(__file__).parent))
from delegate import (  # noqa: E402
    CSTAR_ROOT, STATE_DIR,
    InvalidIntent, validate_intent, intent_id, now_iso,
    _load_intent_from_args,
)

QUEUE_PATH = STATE_DIR / "autobot-queue.jsonl"
VALID_PRIORITIES = {"high", "normal", "low"}


def enqueue(intent: dict, priority: str = "normal") -> dict:
    """Append a task record to the queue. Lock-protected."""
    if priority not in VALID_PRIORITIES:
        raise ValueError(f"priority must be one of {sorted(VALID_PRIORITIES)}")
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    task = {
        "task_id": intent_id(intent),
        "status": "pending",
        "priority": priority,
        "enqueued_at": now_iso(),
        "intent": intent,
        "started_at": None,
        "completed_at": None,
        "result_envelope": None,
        "error": None,
        "attempts": 0,
    }
    # Lock the queue file before append
    lock_path = STATE_DIR / "autobot-queue.lock"
    with open(lock_path, "w") as lock_f:
        fcntl.flock(lock_f.fileno(), fcntl.LOCK_EX)
        try:
            with open(QUEUE_PATH, "a") as q:
                q.write(json.dumps(task) + "\n")
        finally:
            try:
                fcntl.flock(lock_f.fileno(), fcntl.LOCK_UN)
            except OSError:
                pass
    return task


def main() -> int:
    parser = argparse.ArgumentParser(description="autobot — enqueue an intent for async processing")
    parser.add_argument("--intent-file", help="path to JSON intent file")
    parser.add_argument("--intent", help="intent statement (when not using --intent-file)")
    parser.add_argument("--project-root", help="project root path (with --intent)")
    parser.add_argument("--target-paths", help="comma-separated paths (with --intent)")
    parser.add_argument("--payload-file", help="path to JSON payload file (with --intent)")
    parser.add_argument("--priority", default="normal", choices=sorted(VALID_PRIORITIES),
                        help="queue priority (high tasks drain first). Default normal.")
    args = parser.parse_args()

    try:
        raw = _load_intent_from_args(args)
        intent = validate_intent(raw)
    except (InvalidIntent, FileNotFoundError, json.JSONDecodeError) as exc:
        print(json.dumps({"status": "invalid_intent", "error": str(exc)}, indent=2), file=sys.stderr)
        return 2

    task = enqueue(intent, priority=args.priority)
    print(json.dumps({
        "status": "enqueued",
        "task_id": task["task_id"],
        "priority": task["priority"],
        "queue_path": str(QUEUE_PATH),
    }, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
