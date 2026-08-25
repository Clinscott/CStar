#!/usr/bin/env python3
"""Pure deterministic host-side R2 mission compiler."""
from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Mapping, Sequence
from typing import Any

MODEL = "gpt-5.6-luna"
REASONING = "max"
CANONICAL_ENCODING = "sorted-key-utf8-final-lf"
TERMINAL_SCHEMA = "researcher.terminal.v1"
ZERO_SHA256 = "0" * 64
CAPABILITY_STATUSES = {"ADMITTED", "NOT_ADMITTED__CAPABILITY_UNPROVEN", "NOT_APPLICABLE"}
ORDERED_ACTIONS = (
    "INTENT_AND_TARGET_PREFLIGHT", "SOURCE_CAPABILITY_ADMISSION", "EFFECT_RESERVATION",
    "SOURCE_EXECUTION", "NORMALIZE_AND_REDACT", "DEDUPE_AND_CORROBORATE",
    "SYNTHESIZE", "PROPOSE_NEXT_BEST_MOVE", "TERMINALIZE",
)
CEILING_LIMITS = {
    "file_bytes": 262144, "context_bytes": 262144, "patch_bytes": 262144,
    "tool_calls": 20, "wall_time_seconds": 2400, "output_bytes": 262144,
    "model_tokens": 100000000, "physical_lines": 500,
}
CEILING_KEYS = tuple(CEILING_LIMITS)
CEILING_ALIASES = {
    "max_file_bytes": "file_bytes", "max_context_bytes": "context_bytes",
    "max_patch_bytes": "patch_bytes", "max_tool_calls": "tool_calls",
    "max_wall_time_seconds": "wall_time_seconds", "max_output_bytes": "output_bytes",
    "max_model_tokens": "model_tokens", "max_physical_lines": "physical_lines",
}
ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
SHA_RE = re.compile(r"^[0-9a-f]{64}$")
TEXT_RE = re.compile(r"^[^\x00-\x1f\x7f]*$")


class CompileError(ValueError):
    """Typed fail-closed rejection."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        super().__init__(f"{code}: {message}")


def canonical_bytes(value: Any) -> bytes:
    try:
        raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    except (TypeError, ValueError) as exc:
        raise CompileError("INVALID_INPUT", "value is not canonical JSON") from exc
    return (raw + "\n").encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_json(value: Any) -> str:
    return sha256_bytes(canonical_bytes(value))


def _obj(value: Any, name: str) -> dict[str, Any]:
    if not isinstance(value, Mapping):
        raise CompileError("INVALID_INPUT", f"{name} must be an object")
    return dict(value)


def _closed(value: Mapping[str, Any], allowed: set[str], name: str) -> None:
    extra = sorted(set(value) - allowed)
    if extra:
        raise CompileError("UNKNOWN_FIELD", f"{name}: {extra[0]}")


def _need(value: Mapping[str, Any], fields: Sequence[str], name: str) -> None:
    for field in fields:
        if field not in value:
            raise CompileError("INVALID_INPUT", f"{name} missing {field}")


def _id(value: Any, name: str) -> str:
    if not isinstance(value, str) or ID_RE.fullmatch(value) is None:
        raise CompileError("INVALID_INPUT", f"{name} is not a verified identifier")
    return value


def _sha(value: Any, name: str) -> str:
    if not isinstance(value, str) or SHA_RE.fullmatch(value) is None:
        raise CompileError("INVALID_INPUT", f"{name} is not SHA-256")
    return value


def _text(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value or TEXT_RE.fullmatch(value) is None:
        raise CompileError("INVALID_INPUT", f"{name} is not bounded text")
    return value


def _without(value: Mapping[str, Any], field: str) -> dict[str, Any]:
    result = dict(value)
    result.pop(field, None)
    return result


def _bound(value: Mapping[str, Any], field: str, name: str) -> None:
    if _sha(value.get(field), f"{name}.{field}") != sha256_json(_without(value, field)):
        raise CompileError("HASH_MISMATCH", f"{name}.{field} is not hash-bound")


def _ceilings(raw: Mapping[str, Any], name: str) -> dict[str, int]:
    source = _obj(raw, name)
    _closed(source, set(CEILING_KEYS) | set(CEILING_ALIASES), name)
    result: dict[str, int] = {}
    for key, value in source.items():
        key = CEILING_ALIASES.get(key, key)
        if key in result or isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise CompileError("INVALID_INPUT", f"{name} has an invalid ceiling")
        result[key] = value
    for key in set(CEILING_KEYS) - {"physical_lines"}:
        if key not in result:
            raise CompileError("INVALID_INPUT", f"{name} missing {key}")
    result.setdefault("physical_lines", CEILING_LIMITS["physical_lines"])
    for key, limit in CEILING_LIMITS.items():
        if result[key] > limit:
            raise CompileError("BUDGET_OVERSHOOT", f"{name}.{key} exceeds host ceiling")
    return {key: result[key] for key in CEILING_KEYS}


SET_KEYS = set(
    "schema status accepted set_id bead_id decision_id controller_generation policy_version "
    "requested_model requested_reasoning retry_budget descendants peer_messages ordered_actions "
    "output_allowlist cell_outputs entry_predicates exit_predicates terminal_schema ceilings set_sha256".split()
)


def _validate_set(raw: Mapping[str, Any], supplied: Any) -> tuple[dict[str, Any], dict[str, int]]:
    value = _obj(raw, "accepted_set")
    _closed(value, SET_KEYS, "accepted_set")
    _need(value, (
        "schema", "status", "accepted", "set_id", "bead_id", "decision_id",
        "requested_model", "requested_reasoning", "retry_budget", "descendants",
        "peer_messages", "ordered_actions", "output_allowlist", "ceilings", "set_sha256",
    ), "accepted_set")
    if value["schema"] not in {"cstar.accepted_set.v1", "cstar.set.accepted.v1", "cstar.set.v1"}:
        raise CompileError("INVALID_INPUT", "SET schema is not CStar SET v1")
    if value["status"] != "ACCEPTED" or value["accepted"] is not True:
        raise CompileError("CAPABILITY_PROFILE_UNSATISFIED", "SET is not accepted")
    for field in ("set_id", "bead_id", "decision_id"):
        _id(value[field], f"accepted_set.{field}")
    if (value["requested_model"], value["requested_reasoning"]) != (MODEL, REASONING):
        raise CompileError("INVALID_INPUT", "SET selector is not Luna/max")
    if any(value[field] != 0 for field in ("retry_budget", "descendants", "peer_messages")):
        raise CompileError("BUDGET_OVERSHOOT", "SET retry, descendant, or peer budget is non-zero")
    if not isinstance(value["ordered_actions"], list) or tuple(value["ordered_actions"]) != ORDERED_ACTIONS:
        raise CompileError("INVALID_INPUT", "SET action order is not R2")
    allowlist = value["output_allowlist"]
    if not isinstance(allowlist, list) or not allowlist or len(set(allowlist)) != len(allowlist):
        raise CompileError("INVALID_INPUT", "SET output allowlist is not unique")
    for path in allowlist:
        if not isinstance(path, str) or not path or path.startswith("/") or ".." in path.split("/") or TEXT_RE.fullmatch(path) is None:
            raise CompileError("INVALID_INPUT", "SET output allowlist contains an unsafe path")
    outputs = value.get("cell_outputs", allowlist)
    if not isinstance(outputs, list) or len(outputs) != len(ORDERED_ACTIONS) or any(path not in allowlist for path in outputs):
        raise CompileError("INVALID_INPUT", "SET must bind one allowlisted output to every action")
    if value.get("terminal_schema", TERMINAL_SCHEMA) != TERMINAL_SCHEMA:
        raise CompileError("INVALID_INPUT", "SET terminal schema is not terminal.v1")
    ceilings = _ceilings(value["ceilings"], "accepted_set.ceilings")
    if supplied is not None and _ceilings(supplied, "ceilings") != ceilings:
        raise CompileError("HASH_MISMATCH", "supplied ceilings differ from accepted SET")
    for field in ("entry_predicates", "exit_predicates"):
        if field in value:
            predicates = value[field]
            if not isinstance(predicates, list) or len(predicates) != len(ORDERED_ACTIONS):
                raise CompileError("INVALID_INPUT", f"SET {field} are not action-bound")
            for predicate in predicates:
                _text(predicate, f"accepted_set.{field}")
    _bound(value, "set_sha256", "accepted_set")
    return value, ceilings


MANIFEST_KEYS = set(
    "authority budget_policy cancellation_policy compatibility credential_custody deadline_policy "
    "determinism input_schemas manifest_sha256 network_policy output_schemas owner package_sha256 "
    "plugin_id plugin_version redaction_policy retry_policy role schema source_capabilities".split()
)
MANIFEST_NESTED = {
    "authority": set("effect_authority lifecycle_authority plugin_output_authority result_authority".split()),
    "budget_policy": set("max_model_calls max_network_calls max_output_bytes max_provider_calls max_tool_calls".split()),
    "cancellation_policy": {"mode", "terminal_on_cancel"},
    "compatibility": set("abi cstar_authority schema_version status".split()),
    "credential_custody": set("exposed_to_cstar holder mode".split()),
    "deadline_policy": {"max_seconds", "on_expiry"},
    "determinism": set("actual_identity_policy canonical_encoding mode model_selector reasoning".split()),
    "network_policy": set("allowed_hosts fallback mode public_scope".split()),
    "owner": {"contact", "organization"},
    "redaction_policy": set("max_summary_chars raw_source_allowed required secret_material_allowed".split()),
    "retry_policy": {"replacement", "replay", "retry_budget"},
}


def _validate_manifest(raw: Mapping[str, Any]) -> dict[str, Any]:
    manifest = _obj(raw, "role_manifest")
    _closed(manifest, MANIFEST_KEYS, "role_manifest")
    _need(manifest, tuple(MANIFEST_KEYS), "role_manifest")
    if manifest["schema"] != "researcher.plugin_manifest.v1" or manifest["role"] != "researcher_core" or manifest["plugin_id"] != "corvus.researcher.platform_neutral":
        raise CompileError("INVALID_INPUT", "role manifest is not the accepted R1 core")
    _id(manifest["plugin_id"], "role_manifest.plugin_id")
    _text(manifest["plugin_version"], "role_manifest.plugin_version")
    _sha(manifest["package_sha256"], "role_manifest.package_sha256")
    _bound(manifest, "manifest_sha256", "role_manifest")
    for field, allowed in MANIFEST_NESTED.items():
        nested = _obj(manifest[field], f"role_manifest.{field}")
        _closed(nested, allowed, f"role_manifest.{field}")
    expected_determinism = {
        "actual_identity_policy": "unreported_without_host_attestation", "canonical_encoding": CANONICAL_ENCODING,
        "mode": "deterministic", "model_selector": MODEL, "reasoning": REASONING,
    }
    if manifest["determinism"] != expected_determinism:
        raise CompileError("INVALID_INPUT", "role manifest determinism drift")
    if manifest["retry_policy"] != {"replacement": "forbidden", "replay": "forbidden", "retry_budget": 0}:
        raise CompileError("BUDGET_OVERSHOOT", "role manifest permits retry or replay")
    if manifest["network_policy"] != {"allowed_hosts": [], "fallback": "forbidden", "mode": "none", "public_scope": False}:
        raise CompileError("CAPABILITY_PROFILE_UNSATISFIED", "role manifest has a network route")
    if manifest["credential_custody"] != {"exposed_to_cstar": False, "holder": "none", "mode": "none"}:
        raise CompileError("CAPABILITY_PROFILE_UNSATISFIED", "role manifest exposes credentials")
    budget = manifest["budget_policy"]
    if any(budget[field] != 0 for field in ("max_model_calls", "max_network_calls", "max_provider_calls", "max_tool_calls")):
        raise CompileError("BUDGET_OVERSHOOT", "role manifest permits external calls")
    if manifest["input_schemas"] != ["researcher.plugin_invocation.v1"] or "researcher.plugin_result.v1" not in manifest["output_schemas"]:
        raise CompileError("INVALID_INPUT", "role manifest schema binding drift")
    return manifest


ADMISSION_KEYS = set(
    "schema evidence_id evidence_sha256 accepted status set_id manifest_sha256 capability_id "
    "capability_profile_sha256 freshness_status observed_at expires_at permission_class source_group "
    "network_required credential_required public_scope auth_custody tool_name tool_schema_sha256 "
    "attempt_receipt_schema retry_budget deadline_ms cancellation_contract".split()
)


def _validate_admission(raw: Mapping[str, Any], set_value: Mapping[str, Any], manifest: Mapping[str, Any]) -> dict[str, Any]:
    admission = _obj(raw, "capability_admission")
    _closed(admission, ADMISSION_KEYS, "capability_admission")
    required = (
        "schema", "evidence_id", "evidence_sha256", "accepted", "status", "set_id",
        "manifest_sha256", "capability_id", "capability_profile_sha256", "freshness_status", "retry_budget",
    )
    missing = next((field for field in required if field not in admission), None)
    if missing is not None:
        raise CompileError("CAPABILITY_PROFILE_UNSATISFIED", f"capability admission missing {missing}")
    if admission["schema"] != "cstar.capability_admission.v1" or admission["accepted"] is not True or admission["status"] not in CAPABILITY_STATUSES:
        raise CompileError("CAPABILITY_PROFILE_UNSATISFIED", "capability admission is not accepted")
    if admission["set_id"] != set_value["set_id"] or admission["manifest_sha256"] != manifest["manifest_sha256"]:
        raise CompileError("HASH_MISMATCH", "capability admission binding differs")
    _id(admission["evidence_id"], "capability_admission.evidence_id")
    _id(admission["capability_id"], "capability_admission.capability_id")
    _sha(admission["capability_profile_sha256"], "capability_admission.capability_profile_sha256")
    if admission["freshness_status"] != "current":
        raise CompileError("CAPABILITY_PROFILE_UNSATISFIED", "capability admission is stale")
    if admission["retry_budget"] != 0:
        raise CompileError("BUDGET_OVERSHOOT", "capability admission retry budget is non-zero")
    for field in ("observed_at", "expires_at", "permission_class", "source_group", "auth_custody", "tool_name", "attempt_receipt_schema", "cancellation_contract"):
        if field in admission:
            _text(admission[field], f"capability_admission.{field}")
    if "tool_schema_sha256" in admission:
        _sha(admission["tool_schema_sha256"], "capability_admission.tool_schema_sha256")
    for field in ("network_required", "credential_required", "public_scope"):
        if field in admission and not isinstance(admission[field], bool):
            raise CompileError("INVALID_INPUT", f"capability_admission.{field} must be boolean")
    if "deadline_ms" in admission and (isinstance(admission["deadline_ms"], bool) or not isinstance(admission["deadline_ms"], int) or admission["deadline_ms"] < 0):
        raise CompileError("INVALID_INPUT", "capability_admission.deadline_ms is not bounded")
    _bound(admission, "evidence_sha256", "capability_admission")
    return admission


def _cell_input(set_value: Mapping[str, Any], manifest: Mapping[str, Any], admission: Mapping[str, Any], key: str, action: str) -> str:
    return sha256_json({"action": action, "capability_admission_sha256": admission["evidence_sha256"], "idempotency_key": key, "manifest_sha256": manifest["manifest_sha256"], "set_sha256": set_value["set_sha256"]})


def _derived_id(prefix: str, set_id: str, index: int, action: str) -> str:
    candidate = f"{set_id}:{prefix}:{index + 1:02d}"
    return candidate if ID_RE.fullmatch(candidate) else f"{prefix}-{sha256_json({'action': action, 'index': index + 1, 'set_id': set_id})[:48]}"


def compile_mission(
    accepted_set: Mapping[str, Any],
    role_manifest: Mapping[str, Any],
    capability_admission: Mapping[str, Any],
    ceilings: Mapping[str, Any] | None = None,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """Compile one accepted SET into the nine deterministic action cells."""
    if idempotency_key is None:
        raise CompileError("INVALID_INPUT", "idempotency_key is required explicitly")
    key = _id(idempotency_key, "idempotency_key")
    set_value, limits = _validate_set(accepted_set, ceilings)
    manifest = _validate_manifest(role_manifest)
    admission = _validate_admission(capability_admission, set_value, manifest)
    outputs = set_value.get("cell_outputs", set_value["output_allowlist"])
    cells = []
    for index, action in enumerate(ORDERED_ACTIONS):
        output = outputs[index]
        input_hash = _cell_input(set_value, manifest, admission, key, action)
        output_hash = sha256_json({"action": action, "output": output, "terminal": TERMINAL_SCHEMA})
        cell_id = _derived_id("cell", set_value["set_id"], index, action)
        packet = {
            "schema": "researcher.mission_packet.v1", "cell_id": cell_id, "set_id": set_value["set_id"],
            "idempotency_key": key, "action": action, "input_sha256": input_hash,
            "output_sha256": output_hash, "history": "none",
        }
        cell = {
            "schema": "researcher.mission_cell.v1", "cell_id": cell_id, "sequence": index + 1,
            "action": action, "output": output, "output_allowlist": [output], "terminal": TERMINAL_SCHEMA,
            "entry_predicate": set_value.get("entry_predicates", ["SET_ACCEPTED_AND_INPUTS_VERIFIED"] * 9)[index],
            "exit_predicate": set_value.get("exit_predicates", ["TERMINAL_PRESENT_AND_OUTPUT_HASH_VERIFIED"] * 9)[index],
            "input_sha256": input_hash, "output_sha256": output_hash,
            "deadline": {"timeout_seconds": limits["wall_time_seconds"], "on_timeout": "unknown"},
            "ceilings": dict(limits), "retry_budget": 0,
            "capability_profile_sha256": admission["capability_profile_sha256"], "packet": packet,
            "packet_sha256": sha256_json(packet),
        }
        cells.append(cell)
    plan = {
        "schema": "researcher.mission_plan.v1", "canonical_encoding": CANONICAL_ENCODING,
        "plan_id": _derived_id("plan", set_value["set_id"], 0, "R2"),
        "bead_id": set_value["bead_id"], "decision_id": set_value["decision_id"], "set_id": set_value["set_id"],
        "idempotency_key": key, "requested_model": MODEL, "requested_reasoning": REASONING,
        "actual_identity": "unreported", "role_manifest_sha256": manifest["manifest_sha256"],
        "capability_admission_sha256": admission["evidence_sha256"],
        "capability_profile_sha256": admission["capability_profile_sha256"],
        "source_capability_status": admission["status"], "ordered_actions": list(ORDERED_ACTIONS),
        "cells": cells, "ceilings": limits, "retry_budget": 0, "descendants": 0, "peer_messages": 0,
        "history": "none", "plan_sha256": ZERO_SHA256,
    }
    plan["plan_sha256"] = sha256_json(_without(plan, "plan_sha256"))
    return plan


def verify_plan(plan: Mapping[str, Any]) -> bool:
    value = _obj(plan, "plan")
    _need(value, ("plan_sha256", "cells", "ordered_actions", "history"), "plan")
    if value["history"] != "none" or value["ordered_actions"] != list(ORDERED_ACTIONS):
        raise CompileError("INVALID_INPUT", "plan history or action order drift")
    if _sha(value["plan_sha256"], "plan.plan_sha256") != sha256_json(_without(value, "plan_sha256")):
        raise CompileError("HASH_MISMATCH", "plan hash mismatch")
    if not isinstance(value["cells"], list) or len(value["cells"]) != len(ORDERED_ACTIONS):
        raise CompileError("INVALID_INPUT", "plan does not contain nine cells")
    for index, raw_cell in enumerate(value["cells"]):
        cell = _obj(raw_cell, f"plan.cells[{index}]")
        if cell.get("action") != ORDERED_ACTIONS[index] or cell.get("retry_budget") != 0 or cell.get("output_allowlist") != [cell.get("output")]:
            raise CompileError("INVALID_INPUT", "plan cell action, retry, or output drift")
        packet = _obj(cell.get("packet"), f"plan.cells[{index}].packet")
        if packet.get("history") != "none" or cell.get("packet_sha256") != sha256_json(packet):
            raise CompileError("HASH_MISMATCH", "plan packet history or hash drift")
    return True


def canonical_plan_bytes(plan: Mapping[str, Any]) -> bytes:
    verify_plan(plan)
    return canonical_bytes(plan)


compile = compile_mission
canonical = canonical_bytes
digest = sha256_json

__all__ = [
    "CANONICAL_ENCODING", "CEILING_LIMITS", "CompileError", "MODEL", "ORDERED_ACTIONS",
    "REASONING", "TERMINAL_SCHEMA", "canonical_bytes", "canonical_plan_bytes",
    "compile_mission", "sha256_bytes", "sha256_json", "verify_plan",
]
