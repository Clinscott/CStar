#!/usr/bin/env python3
"""autobot — inspect the delegation queue.

  python3 queue_inspect.py                    # summary by status
  python3 queue_inspect.py --status pending   # list tasks in a status
  python3 queue_inspect.py --task-id <id>     # full record for one task

Read-only; never mutates the queue.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from delegate import STATE_DIR  # noqa: E402

def _epoch(ts: str | None) -> float | None:
    if not ts:
        return None
    try:
        return datetime.strptime(ts[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc).timestamp()
    except (ValueError, AttributeError):
        return None

QUEUE_PATH = STATE_DIR / "autobot-queue.jsonl"


def read_queue() -> list[dict]:
    if not QUEUE_PATH.exists() or QUEUE_PATH.stat().st_size == 0:
        return []
    out = []
    for line in QUEUE_PATH.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return out


def summary(tasks: list[dict]) -> dict:
    by_status = Counter(t.get("status", "?") for t in tasks)
    by_priority = Counter(t.get("priority", "?") for t in tasks)
    pending_ages_h = []
    now = datetime.now(timezone.utc).timestamp()
    for t in tasks:
        if t.get("status") == "pending":
            e = _epoch(t.get("enqueued_at"))
            if e:
                pending_ages_h.append((now - e) / 3600)
    return {
        "queue_path": str(QUEUE_PATH),
        "total_tasks": len(tasks),
        "by_status": dict(by_status),
        "by_priority": dict(by_priority),
        "oldest_pending_age_hours": round(max(pending_ages_h), 2) if pending_ages_h else 0,
        "median_pending_age_hours": round(sorted(pending_ages_h)[len(pending_ages_h)//2], 2)
            if pending_ages_h else 0,
    }


def filter_status(tasks: list[dict], status: str) -> list[dict]:
    return [
        {
            "task_id": t.get("task_id"),
            "status": t.get("status"),
            "priority": t.get("priority"),
            "enqueued_at": t.get("enqueued_at"),
            "started_at": t.get("started_at"),
            "completed_at": t.get("completed_at"),
            "intent_summary": (t.get("intent", {}).get("intent") or "")[:120],
            "attempts": t.get("attempts", 0),
            "error": t.get("error"),
        }
        for t in tasks
        if t.get("status") == status
    ]


def get_task(tasks: list[dict], task_id: str) -> dict | None:
    for t in tasks:
        if t.get("task_id") == task_id:
            return t
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description="autobot — inspect the delegation queue")
    parser.add_argument("--status", choices=["pending", "running", "done", "failed", "dead_letter"],
                        help="filter by status")
    parser.add_argument("--task-id", help="show one task in full")
    args = parser.parse_args()

    tasks = read_queue()
    if args.task_id:
        t = get_task(tasks, args.task_id)
        if not t:
            print(json.dumps({"status": "not_found", "task_id": args.task_id}), file=sys.stderr)
            return 1
        print(json.dumps(t, indent=2, default=str))
        return 0
    if args.status:
        print(json.dumps(filter_status(tasks, args.status), indent=2, default=str))
        return 0
    print(json.dumps(summary(tasks), indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
