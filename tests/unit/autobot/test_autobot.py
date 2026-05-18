"""Unit tests for the autobot skill.

Coverage:
  - Intent JSON validation (required fields, type checks, enum checks)
  - intent_id / intent_hash determinism
  - Target path materialization (missing, truncation, expansion)
  - Output validation (markdown, json, plain — incl. session-banner stripping)
  - Cost ledger record shape
  - Nested-delegation guard (HERMES_AUTOBOT_DELEGATED env var)
  - Lock contention (intent-level)
  - Queue enqueue / inspect
  - Queue processor: dry-run, claim+finalize, dead-lettering, lock contention
  - Profile validation (profile_not_found short-circuit)

No real Hermes calls. The invoke_hermes function is monkeypatched.
"""
import importlib.util
import json
import os
import sys
import time
from pathlib import Path

import pytest

SCRIPT_DIR = Path.home() / "Corvus" / "CStar" / ".agents" / "skills" / "autobot" / "scripts"


def _load(name: str):
    spec = importlib.util.spec_from_file_location(f"autobot_{name}", SCRIPT_DIR / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture
def delegate_mod():
    return _load("delegate")


@pytest.fixture
def enqueue_mod():
    return _load("enqueue")


@pytest.fixture
def queue_processor_mod():
    return _load("queue_processor")


@pytest.fixture
def queue_inspect_mod():
    return _load("queue_inspect")


@pytest.fixture
def isolated_state(tmp_path, monkeypatch, delegate_mod, enqueue_mod, queue_processor_mod, queue_inspect_mod):
    """Point all autobot writes at a tmp dir so tests don't pollute real state."""
    monkeypatch.setattr(delegate_mod, "STATE_DIR", tmp_path)
    monkeypatch.setattr(delegate_mod, "LEDGER_PATH", tmp_path / "autobot-cost-ledger.jsonl")
    monkeypatch.setattr(enqueue_mod, "STATE_DIR", tmp_path)
    monkeypatch.setattr(enqueue_mod, "QUEUE_PATH", tmp_path / "autobot-queue.jsonl")
    monkeypatch.setattr(queue_processor_mod, "STATE_DIR", tmp_path)
    monkeypatch.setattr(queue_processor_mod, "QUEUE_PATH", tmp_path / "autobot-queue.jsonl")
    monkeypatch.setattr(queue_processor_mod, "QUEUE_LOCK_PATH", tmp_path / "autobot-queue.lock")
    monkeypatch.setattr(queue_processor_mod, "PROCESSOR_LOCK_PATH", tmp_path / "autobot-processor.lock")
    monkeypatch.setattr(queue_processor_mod, "RESULTS_DIR", tmp_path / "autobot-results")
    monkeypatch.setattr(queue_inspect_mod, "STATE_DIR", tmp_path)
    monkeypatch.setattr(queue_inspect_mod, "QUEUE_PATH", tmp_path / "autobot-queue.jsonl")
    return tmp_path


# ── intent validation ────────────────────────────────────────────────────

class TestValidateIntent:
    def test_minimal_valid(self, delegate_mod):
        v = delegate_mod.validate_intent({"intent": "do thing", "project_root": "/x"})
        assert v["intent"] == "do thing"
        assert v["target_paths"] == []
        assert v["payload"]["model"] == delegate_mod.DEFAULT_MODEL
        assert v["payload"]["hermes_profile"] == delegate_mod.DEFAULT_PROFILE

    def test_missing_intent_rejects(self, delegate_mod):
        with pytest.raises(delegate_mod.InvalidIntent):
            delegate_mod.validate_intent({"project_root": "/x"})

    def test_empty_intent_rejects(self, delegate_mod):
        with pytest.raises(delegate_mod.InvalidIntent):
            delegate_mod.validate_intent({"intent": "  ", "project_root": "/x"})

    def test_missing_project_root_rejects(self, delegate_mod):
        with pytest.raises(delegate_mod.InvalidIntent):
            delegate_mod.validate_intent({"intent": "x"})

    def test_target_paths_must_be_strings(self, delegate_mod):
        with pytest.raises(delegate_mod.InvalidIntent):
            delegate_mod.validate_intent({"intent": "x", "project_root": "/x",
                                          "target_paths": ["ok", 42]})

    def test_invalid_expected_output_rejects(self, delegate_mod):
        with pytest.raises(delegate_mod.InvalidIntent):
            delegate_mod.validate_intent({"intent": "x", "project_root": "/x",
                                          "payload": {"expected_output": "binary"}})

    def test_payload_defaults(self, delegate_mod):
        v = delegate_mod.validate_intent({"intent": "x", "project_root": "/x"})
        assert v["payload"]["expected_output"] == "markdown"
        assert v["payload"]["max_chars"] == delegate_mod.DEFAULT_MAX_CHARS
        assert v["payload"]["timeout_seconds"] == delegate_mod.DEFAULT_TIMEOUT


# ── intent_id / intent_hash ──────────────────────────────────────────────

class TestIntentIdentity:
    def test_intent_hash_stable(self, delegate_mod):
        i = delegate_mod.validate_intent({"intent": "x", "project_root": "/x"})
        h1 = delegate_mod.intent_hash(i)
        h2 = delegate_mod.intent_hash(i)
        assert h1 == h2
        assert len(h1) == 16

    def test_different_intent_different_hash(self, delegate_mod):
        a = delegate_mod.validate_intent({"intent": "a", "project_root": "/x"})
        b = delegate_mod.validate_intent({"intent": "b", "project_root": "/x"})
        assert delegate_mod.intent_hash(a) != delegate_mod.intent_hash(b)

    def test_intent_id_includes_timestamp_and_hash(self, delegate_mod):
        i = delegate_mod.validate_intent({"intent": "x", "project_root": "/x"})
        iid = delegate_mod.intent_id(i)
        # Format: intent-YYYY-MM-DD-HHMMSS-<8hex> → 6 dash-separated parts
        parts = iid.split("-")
        assert iid.startswith("intent-")
        assert len(parts) == 6
        assert len(parts[-1]) == 8  # 8-char hex suffix
        assert all(c in "0123456789abcdef" for c in parts[-1])


# ── target path materialization ──────────────────────────────────────────

class TestMaterializeTargets:
    def test_missing_files_reported(self, delegate_mod, tmp_path):
        intent = delegate_mod.validate_intent({
            "intent": "x", "project_root": str(tmp_path),
            "target_paths": ["nope.md"],
        })
        entries, missing = delegate_mod.materialize_targets(intent)
        assert entries == []
        assert len(missing) == 1
        assert "nope.md" in missing[0]

    def test_real_file_read(self, delegate_mod, tmp_path):
        f = tmp_path / "a.md"
        f.write_text("hello world")
        intent = delegate_mod.validate_intent({
            "intent": "x", "project_root": str(tmp_path),
            "target_paths": ["a.md"],
        })
        entries, missing = delegate_mod.materialize_targets(intent)
        assert missing == []
        assert len(entries) == 1
        assert entries[0]["content"] == "hello world"
        assert not entries[0]["truncated"]

    def test_truncation_at_cap(self, delegate_mod, tmp_path, monkeypatch):
        monkeypatch.setattr(delegate_mod, "TARGET_PATH_BYTE_CAP", 100)
        f = tmp_path / "big.md"
        f.write_text("x" * 500)
        intent = delegate_mod.validate_intent({
            "intent": "x", "project_root": str(tmp_path),
            "target_paths": ["big.md"],
        })
        entries, _ = delegate_mod.materialize_targets(intent)
        assert entries[0]["truncated"] is True
        assert entries[0]["bytes"] == 100

    def test_absolute_path_supported(self, delegate_mod, tmp_path):
        f = tmp_path / "abs.md"
        f.write_text("absolute content")
        intent = delegate_mod.validate_intent({
            "intent": "x", "project_root": "/some/other/root",
            "target_paths": [str(f)],  # absolute path
        })
        entries, missing = delegate_mod.materialize_targets(intent)
        assert missing == []
        assert entries[0]["content"] == "absolute content"


# ── output validation ────────────────────────────────────────────────────

class TestValidateOutput:
    def test_strips_session_banner(self, delegate_mod):
        raw = "session_id: 20260515_xxx\n⚠ No auxiliary configured\n\nactual content"
        cleaned, err = delegate_mod.validate_output(raw, "plain")
        assert err is None
        assert cleaned == "actual content"

    def test_empty_response_errors(self, delegate_mod):
        cleaned, err = delegate_mod.validate_output("session_id: x\n", "plain")
        assert err == "empty_response"

    def test_json_valid_passes(self, delegate_mod):
        cleaned, err = delegate_mod.validate_output('{"k": 1}', "json")
        assert err is None
        assert json.loads(cleaned) == {"k": 1}

    def test_json_invalid_extracts_last_blob(self, delegate_mod):
        # M2.7 sometimes prefaces JSON with prose despite instructions
        raw = 'Here is your JSON: {"oops": "bad}\n\nActually: {"good": 42}'
        cleaned, err = delegate_mod.validate_output(raw, "json")
        assert err is None
        assert json.loads(cleaned)["good"] == 42

    def test_json_no_object_errors(self, delegate_mod):
        cleaned, err = delegate_mod.validate_output("not json at all", "json")
        assert err == "json_parse_failed"

    def test_markdown_passthrough(self, delegate_mod):
        cleaned, err = delegate_mod.validate_output("# Heading\n\ntext", "markdown")
        assert err is None
        assert cleaned.startswith("# Heading")


# ── ledger record shape ──────────────────────────────────────────────────

class TestLedgerRecord:
    def test_make_ledger_entry_shape(self, delegate_mod):
        intent = delegate_mod.validate_intent({"intent": "do x", "project_root": "/p",
                                                "payload": {"tags": ["t"]}})
        rec = delegate_mod.make_ledger_entry(intent, "intent-1", "prompt", "response", "ok", None, 1234)
        assert rec["status"] == "ok"
        assert rec["duration_ms"] == 1234
        assert rec["model"] == "MiniMax-M2.7"
        assert rec["tags"] == ["t"]
        # Token estimates use ceil(chars/4)
        assert rec["est_prompt_tokens"] == 2  # len("prompt")=6, ceil(6/4)=2
        assert rec["est_response_tokens"] == 2

    def test_append_ledger_creates_file(self, isolated_state, delegate_mod):
        intent = delegate_mod.validate_intent({"intent": "x", "project_root": "/p"})
        rec = delegate_mod.make_ledger_entry(intent, "iid", "p", "r", "ok", None, 100)
        line = delegate_mod.append_ledger(rec)
        assert line == 1
        assert (isolated_state / "autobot-cost-ledger.jsonl").exists()


# ── nested guard ─────────────────────────────────────────────────────────

class TestNestedGuard:
    def test_nested_delegation_blocked(self, isolated_state, delegate_mod, monkeypatch):
        monkeypatch.setenv(delegate_mod.NESTED_GUARD_ENV, "1")
        intent = delegate_mod.validate_intent({"intent": "x", "project_root": "/p"})
        envelope = delegate_mod.delegate(intent)
        assert envelope["status"] == "degraded"
        assert envelope["degraded_reason"] == "nested_delegation_forbidden"


# ── profile validation ──────────────────────────────────────────────────

class TestProfileValidation:
    def test_profile_not_found_short_circuits(self, isolated_state, delegate_mod, monkeypatch):
        monkeypatch.setattr(delegate_mod, "_hermes_profile_exists", lambda p: False)
        # Need a fake key so we get past the no_minimax_key check first
        monkeypatch.setattr(delegate_mod, "get_minimax_key", lambda: "fake")
        intent = delegate_mod.validate_intent({
            "intent": "x", "project_root": "/p",
            "payload": {"hermes_profile": "imaginary"},
        })
        envelope = delegate_mod.delegate(intent)
        assert envelope["status"] == "degraded"
        assert "profile_not_found" in envelope["degraded_reason"]


# ── enqueue + queue inspect ─────────────────────────────────────────────

class TestQueue:
    def test_enqueue_creates_pending_task(self, isolated_state, delegate_mod, enqueue_mod, queue_inspect_mod):
        intent = delegate_mod.validate_intent({"intent": "do x", "project_root": "/p"})
        task = enqueue_mod.enqueue(intent, priority="high")
        assert task["status"] == "pending"
        assert task["priority"] == "high"
        assert task["task_id"].startswith("intent-")
        # Queue file written
        assert enqueue_mod.QUEUE_PATH.exists()
        # Inspect summary picks it up
        tasks = queue_inspect_mod.read_queue()
        assert len(tasks) == 1
        assert tasks[0]["task_id"] == task["task_id"]

    def test_enqueue_invalid_priority_rejects(self, isolated_state, delegate_mod, enqueue_mod):
        intent = delegate_mod.validate_intent({"intent": "x", "project_root": "/p"})
        with pytest.raises(ValueError):
            enqueue_mod.enqueue(intent, priority="urgent")

    def test_inspect_summary_counts(self, isolated_state, delegate_mod, enqueue_mod, queue_inspect_mod):
        for i in range(3):
            intent = delegate_mod.validate_intent({"intent": f"task {i}", "project_root": "/p"})
            enqueue_mod.enqueue(intent)
        tasks = queue_inspect_mod.read_queue()
        s = queue_inspect_mod.summary(tasks)
        assert s["total_tasks"] == 3
        assert s["by_status"]["pending"] == 3


# ── queue processor ─────────────────────────────────────────────────────

class TestQueueProcessor:
    def _enqueue(self, isolated_state, delegate_mod, enqueue_mod, intent_text="x", priority="normal"):
        intent = delegate_mod.validate_intent({"intent": intent_text, "project_root": "/p"})
        return enqueue_mod.enqueue(intent, priority=priority)

    def test_dry_run_reports_without_claiming(self, isolated_state, delegate_mod, enqueue_mod, queue_processor_mod):
        self._enqueue(isolated_state, delegate_mod, enqueue_mod)
        result = queue_processor_mod.process_queue(max_tasks=5, dry_run=True)
        assert result["status"] == "dry_run"
        assert len(result["would_claim"]) == 1
        # Status unchanged
        tasks = queue_processor_mod._read_queue()
        assert tasks[0]["status"] == "pending"

    def test_claim_then_finalize_ok(self, isolated_state, delegate_mod, enqueue_mod, queue_processor_mod, monkeypatch):
        # Stub delegate.delegate to return a fake "ok" envelope
        def _fake_delegate(intent):
            return {"status": "ok", "degraded_reason": None,
                    "intent_id": "iid", "duration_ms": 50, "wrote_to": None,
                    "response": "fake response", "ledger_entry": "x#L1"}
        monkeypatch.setattr(queue_processor_mod, "delegate", _fake_delegate)

        self._enqueue(isolated_state, delegate_mod, enqueue_mod)
        result = queue_processor_mod.process_queue(max_tasks=5)
        assert result["status"] == "ok"
        assert result["processed"] == 1
        # Status flipped to done
        tasks = queue_processor_mod._read_queue()
        assert tasks[0]["status"] == "done"
        assert tasks[0]["completed_at"] is not None
        # Result file written
        result_files = list((isolated_state / "autobot-results").glob("*.json"))
        assert len(result_files) == 1

    def test_failure_re_queues_until_dead_letter(self, isolated_state, delegate_mod, enqueue_mod, queue_processor_mod, monkeypatch):
        def _always_fail(intent):
            return {"status": "degraded", "degraded_reason": "test_fail",
                    "intent_id": "iid", "duration_ms": 5}
        monkeypatch.setattr(queue_processor_mod, "delegate", _always_fail)

        task = self._enqueue(isolated_state, delegate_mod, enqueue_mod)

        # First run → status pending again with attempts=1
        queue_processor_mod.process_queue(max_tasks=1)
        tasks = queue_processor_mod._read_queue()
        assert tasks[0]["status"] == "pending"
        assert tasks[0]["attempts"] == 1
        assert tasks[0]["error"] == "test_fail"

        # Second run → still pending, attempts=2
        queue_processor_mod.process_queue(max_tasks=1)
        tasks = queue_processor_mod._read_queue()
        assert tasks[0]["status"] == "pending"
        assert tasks[0]["attempts"] == 2

        # Third run → attempts hits MAX, dead-letter
        queue_processor_mod.process_queue(max_tasks=1)
        tasks = queue_processor_mod._read_queue()
        assert tasks[0]["status"] == "dead_letter"
        assert tasks[0]["attempts"] == 3

    def test_priority_order_high_first(self, isolated_state, delegate_mod, enqueue_mod, queue_processor_mod):
        # Enqueue low → normal → high
        self._enqueue(isolated_state, delegate_mod, enqueue_mod, "low task", "low")
        self._enqueue(isolated_state, delegate_mod, enqueue_mod, "normal task", "normal")
        self._enqueue(isolated_state, delegate_mod, enqueue_mod, "high task", "high")
        result = queue_processor_mod.process_queue(max_tasks=1, dry_run=True)
        # High should be claimed first
        assert result["would_claim"][0]["priority"] == "high"

    def test_processor_lock_skips_when_held(self, isolated_state, delegate_mod, enqueue_mod, queue_processor_mod):
        import fcntl
        self._enqueue(isolated_state, delegate_mod, enqueue_mod)
        # Grab the processor lock
        with open(queue_processor_mod.PROCESSOR_LOCK_PATH, "w") as held:
            fcntl.flock(held.fileno(), fcntl.LOCK_EX)
            result = queue_processor_mod.process_queue(max_tasks=1)
            assert result["status"] == "skipped"
            assert "lock" in result["reason"]


# ── _ts helper ───────────────────────────────────────────────────────────

class TestTsHelpers:
    def test_now_iso_format(self, delegate_mod):
        s = delegate_mod.now_iso()
        # Looks like "2026-05-15T18:00:00+0000"
        assert "T" in s
        assert s.endswith("+0000") or "+" in s
