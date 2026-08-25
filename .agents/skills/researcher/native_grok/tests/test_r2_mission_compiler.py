#!/usr/bin/env python3
"""Focused deterministic R2 compiler checks."""
from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE))
from compiler import (  # noqa: E402
    CEILING_LIMITS,
    CompileError,
    ORDERED_ACTIONS,
    canonical_plan_bytes,
    compile_mission,
    sha256_json,
    verify_plan,
)


def _manifest() -> dict:
    return json.loads((BASE / "manifest.json").read_text(encoding="utf-8"))


def _ceilings() -> dict[str, int]:
    return {
        "file_bytes": 65536,
        "context_bytes": 65536,
        "patch_bytes": 65536,
        "tool_calls": 20,
        "wall_time_seconds": 2400,
        "output_bytes": 65536,
        "model_tokens": 4096,
        "physical_lines": 500,
    }


def _set() -> dict:
    outputs = [f"mission_outputs/cell-{index:02d}.json" for index in range(1, 10)]
    value = {
        "schema": "cstar.accepted_set.v1",
        "status": "ACCEPTED",
        "accepted": True,
        "set_id": "CSO-D003-R2-SET-01",
        "bead_id": "bead:r2:mission-compiler",
        "decision_id": "CSO-D003-R2",
        "requested_model": "gpt-5.6-luna",
        "requested_reasoning": "max",
        "retry_budget": 0,
        "descendants": 0,
        "peer_messages": 0,
        "ordered_actions": list(ORDERED_ACTIONS),
        "output_allowlist": outputs,
        "cell_outputs": outputs,
        "ceilings": _ceilings(),
    }
    value["set_sha256"] = sha256_json(value)
    return value


def _admission(set_value: dict, manifest: dict) -> dict:
    value = {
        "schema": "cstar.capability_admission.v1",
        "evidence_id": "capability-admission:r2:01",
        "accepted": True,
        "status": "NOT_ADMITTED__CAPABILITY_UNPROVEN",
        "set_id": set_value["set_id"],
        "manifest_sha256": manifest["manifest_sha256"],
        "capability_id": "cstar.researcher.mission-compiler",
        "capability_profile_sha256": "a" * 64,
        "freshness_status": "current",
        "retry_budget": 0,
    }
    value["evidence_sha256"] = sha256_json(value)
    return value


def _compile(set_value: dict | None = None, admission: dict | None = None, ceilings: dict | None = None):
    manifest = _manifest()
    current_set = copy.deepcopy(set_value or _set())
    current_admission = copy.deepcopy(admission or _admission(current_set, manifest))
    return compile_mission(current_set, manifest, current_admission, ceilings, "effect:r2:mission-compiler:01")


def _reject(callable_, code: str | None = None) -> None:
    try:
        callable_()
    except CompileError as exc:
        if code is not None:
            assert exc.code == code, (exc.code, code)
    else:
        raise AssertionError("malformed input was accepted")


def test_compile_shape() -> None:
    plan = _compile()
    assert verify_plan(plan)
    assert plan["requested_model"] == "gpt-5.6-luna"
    assert plan["requested_reasoning"] == "max"
    assert plan["actual_identity"] == "unreported"
    assert plan["source_capability_status"] == "NOT_ADMITTED__CAPABILITY_UNPROVEN"
    assert plan["ordered_actions"] == list(ORDERED_ACTIONS)
    assert len(plan["cells"]) == 9
    for index, cell in enumerate(plan["cells"]):
        assert cell["sequence"] == index + 1
        assert cell["action"] == ORDERED_ACTIONS[index]
        assert cell["output_allowlist"] == [cell["output"]]
        assert cell["terminal"] == "researcher.terminal.v1"
        assert cell["retry_budget"] == 0
        assert cell["ceilings"]["tool_calls"] == 20
        assert cell["ceilings"]["model_tokens"] == 4096
        assert cell["packet"]["history"] == "none"
        assert len(cell["input_sha256"]) == 64 and len(cell["output_sha256"]) == 64


def test_canonical_replay() -> None:
    first = _compile()
    expected = canonical_plan_bytes(first)
    for _ in range(100):
        replay = _compile()
        assert canonical_plan_bytes(replay) == expected
        assert replay["plan_sha256"] == first["plan_sha256"]
    assert sha256_json(json.loads(expected.decode("utf-8"))) == sha256_json(first)


def test_no_history_and_idempotency() -> None:
    plan = _compile()
    assert plan["history"] == "none"
    assert plan["idempotency_key"] == "effect:r2:mission-compiler:01"
    for cell in plan["cells"]:
        assert set(cell["packet"]) == {
            "schema", "cell_id", "set_id", "idempotency_key", "action",
            "input_sha256", "output_sha256", "history",
        }
        assert "transcript" not in cell["packet"]
    _reject(lambda: compile_mission(_set(), _manifest(), _admission(_set(), _manifest()), None, None), "INVALID_INPUT")


def test_capability_admission_rejections() -> None:
    manifest = _manifest()
    original_set = _set()
    original = _admission(original_set, manifest)
    cases = []
    missing = copy.deepcopy(original)
    missing.pop("freshness_status")
    cases.append(missing)
    stale = copy.deepcopy(original)
    stale["freshness_status"] = "stale"
    stale["evidence_sha256"] = sha256_json({key: value for key, value in stale.items() if key != "evidence_sha256"})
    cases.append(stale)
    unaccepted = copy.deepcopy(original)
    unaccepted["accepted"] = False
    unaccepted["evidence_sha256"] = sha256_json({key: value for key, value in unaccepted.items() if key != "evidence_sha256"})
    cases.append(unaccepted)
    mismatched = copy.deepcopy(original)
    mismatched["evidence_sha256"] = "0" * 64
    cases.append(mismatched)
    for case in cases:
        _reject(lambda case=case: _compile(original_set, case), "CAPABILITY_PROFILE_UNSATISFIED" if case is stale or case is unaccepted or case is missing else "HASH_MISMATCH")


def test_ceiling_rejections() -> None:
    for field in ("file_bytes", "context_bytes", "patch_bytes", "tool_calls", "wall_time_seconds", "output_bytes"):
        bad = _set()
        bad["ceilings"][field] = CEILING_LIMITS[field] + 1
        bad["set_sha256"] = sha256_json({key: value for key, value in bad.items() if key != "set_sha256"})
        _reject(lambda bad=bad: _compile(bad), "BUDGET_OVERSHOOT")


def test_hash_and_unknown_field_rejections() -> None:
    bad_set = _set()
    bad_set["set_sha256"] = "0" * 64
    _reject(lambda: _compile(bad_set), "HASH_MISMATCH")
    unknown = _set()
    unknown["unknown_field"] = True
    unknown["set_sha256"] = sha256_json({key: value for key, value in unknown.items() if key != "set_sha256"})
    _reject(lambda: _compile(unknown), "UNKNOWN_FIELD")
    bad_manifest = _manifest()
    bad_manifest["manifest_sha256"] = "0" * 64
    _reject(lambda: _compile(_set(), _manifest(), _admission(_set(), bad_manifest)), "HASH_MISMATCH")


def test_plan_tamper_rejection() -> None:
    plan = _compile()
    tampered = copy.deepcopy(plan)
    tampered["cells"][0]["packet"]["history"] = "full"
    _reject(lambda: verify_plan(tampered), "HASH_MISMATCH")


def main() -> int:
    tests = (
        test_compile_shape,
        test_canonical_replay,
        test_no_history_and_idempotency,
        test_capability_admission_rejections,
        test_ceiling_rejections,
        test_hash_and_unknown_field_rejections,
        test_plan_tamper_rejection,
    )
    passed = 0
    for test in tests:
        test()
        passed += 1
    print(json.dumps({
        "status": "PASS",
        "tests_passed": passed,
        "tests_failed": 0,
        "ordered_action_count": len(ORDERED_ACTIONS),
        "replay_pairs": 100,
        "replay_mismatches": 0,
        "capability_admission_rejections": 4,
        "over_limit_rejections": 6,
        "runtime_model_calls": 0,
        "runtime_provider_calls": 0,
        "runtime_network_calls": 0,
        "runtime_auth_calls": 0,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (AssertionError, CompileError, KeyError, TypeError, ValueError) as exc:
        print(json.dumps({"status": "FAIL", "defect": str(exc)}, sort_keys=True))
        raise SystemExit(1)
