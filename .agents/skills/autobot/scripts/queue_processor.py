#!/usr/bin/env python3
"""autobot — drain pending tasks from the delegation queue.

Cron-friendly: holds an exclusive lock so two ticks can't both drain.
On lock contention, exits cleanly with status=skipped.

Usage (cron):
  python3 queue_processor.py --max-tasks 5

Usage (interactive):
  python3 queue_processor.py --max-tasks 1 --task-id <id>  # process one specific task
  python3 queue_processor.py --dry-run                     # report what would run

Status transitions:
  pending → running (claimed) → done | failed | dead_letter

A task moves to dead_letter after 3 failed attempts.

Per-task constraints:
  - max_duration_per_task seconds (default 360 = delegate timeout 300 + 60s slack)
  - High-priority tasks drained before normal, normal before low

The queue file (autobot-queue.jsonl) is rewritten in-place after each tick
under the queue lock — atomic-ish via temp file + rename.
"""
from __future__ import annotations

import argparse
import fcntl
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from delegate import (  # noqa: E402
    STATE_DIR, validate_intent, delegate, now_iso, InvalidIntent,
)

QUEUE_PATH = STATE_DIR / "autobot-queue.jsonl"
QUEUE_LOCK_PATH = STATE_DIR / "autobot-queue.lock"
PROCESSOR_LOCK_PATH = STATE_DIR / "autobot-processor.lock"
RESULTS_DIR = STATE_DIR / "autobot-results"

PRIORITY_RANK = {"high": 0, "normal": 1, "low": 2}
MAX_ATTEMPTS = 3


def _read_queue() -> list[dict]:
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


def _write_queue(tasks: list[dict]) -> None:
    """Atomic write: tmpfile + rename. Caller must hold queue lock."""
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = QUEUE_PATH.with_suffix(QUEUE_PATH.suffix + ".tmp")
    with open(tmp, "w") as f:
        for t in tasks:
            f.write(json.dumps(t) + "\n")
    os.replace(tmp, QUEUE_PATH)


def _claim_next_pending(max_tasks: int, only_task_id: str | None = None) -> list[dict]:
    """Atomically mark up to max_tasks pending tasks as running. Returns claimed list."""
    QUEUE_LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(QUEUE_LOCK_PATH, "w") as lock_f:
        fcntl.flock(lock_f.fileno(), fcntl.LOCK_EX)
        try:
            tasks = _read_queue()
            pending = [t for t in tasks if t.get("status") == "pending"]
            if only_task_id:
                pending = [t for t in pending if t.get("task_id") == only_task_id]
            else:
                pending.sort(key=lambda t: (
                    PRIORITY_RANK.get(t.get("priority", "normal"), 1),
                    t.get("enqueued_at", ""),
                ))
            claimed = pending[:max_tasks]
            claimed_ids = {t["task_id"] for t in claimed}
            for t in tasks:
                if t.get("task_id") in claimed_ids:
                    t["status"] = "running"
                    t["started_at"] = now_iso()
                    t["attempts"] = (t.get("attempts") or 0) + 1
            _write_queue(tasks)
            # Return the *updated* records so callers see attempts incremented
            return [t for t in tasks if t.get("task_id") in claimed_ids]
        finally:
            try:
                fcntl.flock(lock_f.fileno(), fcntl.LOCK_UN)
            except OSError:
                pass


def _finalize_task(task_id: str, result_envelope: dict) -> None:
    """Move task from running → done|failed|dead_letter based on envelope."""
    with open(QUEUE_LOCK_PATH, "w") as lock_f:
        fcntl.flock(lock_f.fileno(), fcntl.LOCK_EX)
        try:
            tasks = _read_queue()
            for t in tasks:
                if t.get("task_id") != task_id:
                    continue
                t["completed_at"] = now_iso()
                t["result_envelope"] = result_envelope
                if result_envelope.get("status") == "ok":
                    t["status"] = "done"
                    t["error"] = None
                else:
                    err = result_envelope.get("degraded_reason") or "unknown"
                    t["error"] = err
                    if (t.get("attempts") or 0) >= MAX_ATTEMPTS:
                        t["status"] = "dead_letter"
                    else:
                        # Re-queue for retry, leaving attempts incremented
                        t["status"] = "pending"
                        t["started_at"] = None
                        t["completed_at"] = None
                break
            _write_queue(tasks)
        finally:
            try:
                fcntl.flock(lock_f.fileno(), fcntl.LOCK_UN)
            except OSError:
                pass


def _save_result(task_id: str, envelope: dict) -> Path:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    p = RESULTS_DIR / f"{task_id}.json"
    p.write_text(json.dumps(envelope, indent=2))
    return p


def process_queue(max_tasks: int = 5, only_task_id: str | None = None,
                  dry_run: bool = False) -> dict:
    """Top-level: acquire processor lock, claim, run each, finalize."""
    PROCESSOR_LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)

    if dry_run:
        # Read-only inspection — just show what would be claimed
        tasks = _read_queue()
        pending = [t for t in tasks if t.get("status") == "pending"]
        if only_task_id:
            pending = [t for t in pending if t.get("task_id") == only_task_id]
        else:
            pending.sort(key=lambda t: (
                PRIORITY_RANK.get(t.get("priority", "normal"), 1),
                t.get("enqueued_at", ""),
            ))
        return {
            "status": "dry_run",
            "would_claim": [{"task_id": t["task_id"], "priority": t.get("priority"),
                            "intent_summary": (t.get("intent", {}).get("intent") or "")[:80]}
                           for t in pending[:max_tasks]],
            "total_pending": sum(1 for t in tasks if t.get("status") == "pending"),
        }

    with open(PROCESSOR_LOCK_PATH, "w") as lock_f:
        try:
            fcntl.flock(lock_f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {"status": "skipped", "reason": "processor_lock_held_by_another_run"}

        try:
            lock_f.write(f"pid={os.getpid()} at={now_iso()}\n")
            lock_f.flush()
            claimed = _claim_next_pending(max_tasks, only_task_id=only_task_id)
            if not claimed:
                return {"status": "ok", "processed": 0, "results": []}

            results = []
            for task in claimed:
                task_id = task["task_id"]
                try:
                    intent = validate_intent(task["intent"])
                except InvalidIntent as exc:
                    envelope = {
                        "status": "degraded",
                        "degraded_reason": f"invalid_intent_at_drain:{exc}",
                        "intent_id": task_id,
                    }
                    _finalize_task(task_id, envelope)
                    _save_result(task_id, envelope)
                    results.append({"task_id": task_id, "status": "failed",
                                    "reason": str(exc)})
                    continue

                envelope = delegate(intent)
                _finalize_task(task_id, envelope)
                result_path = _save_result(task_id, envelope)
                results.append({
                    "task_id": task_id,
                    "status": envelope["status"],
                    "duration_ms": envelope.get("duration_ms"),
                    "wrote_to": envelope.get("wrote_to"),
                    "result_path": str(result_path),
                })

            return {
                "status": "ok",
                "processed": len(claimed),
                "results": results,
            }
        finally:
            try:
                fcntl.flock(lock_f.fileno(), fcntl.LOCK_UN)
            except OSError:
                pass


def main() -> int:
    parser = argparse.ArgumentParser(description="autobot — drain delegation queue")
    parser.add_argument("--max-tasks", type=int, default=5,
                        help="max tasks to drain per run (default 5)")
    parser.add_argument("--task-id", default=None,
                        help="process one specific task instead of next-N")
    parser.add_argument("--dry-run", action="store_true",
                        help="report what would be claimed without running")
    args = parser.parse_args()

    result = process_queue(max_tasks=args.max_tasks,
                            only_task_id=args.task_id,
                            dry_run=args.dry_run)
    print(json.dumps(result, indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
