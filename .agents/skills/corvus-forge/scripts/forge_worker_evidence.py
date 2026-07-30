"""Bounded, token-free projection of Forge delegate execution evidence."""

from __future__ import annotations

import errno
import re
from typing import Any


DELEGATE_FAILURE_SCHEMA = "cstar.forge_delegate_failure.v1"
SAFE_REASON = re.compile(r"^forge_[a-z0-9_]+(?:_[0-9]+)?$")
ROLES = ("specifier", "coder", "cleaner", "architect", "hardener", "qa")
FINAL_STATES = frozenset({
    "not_reached", "capability_consumed", "dispatch_attempted", "request_sent",
    "response_headers_received", "response_body_complete", "invalid_or_missing",
    "synthetic_response_complete", "synthetic_dispatch_ambiguous",
})
TOPOLOGIES = frozenset({
    "bounded-six-role-manifest-v1", "synthetic_legacy_single_response_v1",
})
_DIGEST = re.compile(r"^[a-f0-9]{64}$")


def _count(value: Any, maximum: int = 6) -> int | None:
    return value if type(value) is int and 0 <= value <= maximum else None


def _digest(value: Any, *, nullable: bool = False) -> str | None:
    if nullable and value is None:
        return None
    return value if isinstance(value, str) and _DIGEST.fullmatch(value) else None


def _role_receipt(item: Any) -> dict[str, Any] | None:
    keys = {
        "role", "phase", "input_handoff_sha256", "specification_handoff_sha256",
        "output_handoff_sha256", "input_tokens", "output_tokens",
    }
    if not isinstance(item, dict) or set(item) != keys or item.get("role") not in ROLES:
        return None
    expected_phase = f"{ROLES.index(item['role']) + 1}/6"
    if item.get("phase") != expected_phase:
        return None
    output = _digest(item.get("output_handoff_sha256"), nullable=True)
    if (
        _digest(item.get("input_handoff_sha256")) is None
        or _digest(item.get("specification_handoff_sha256")) is None
        or (item.get("output_handoff_sha256") is not None and output is None)
        or _count(item.get("input_tokens"), 10**9) is None
        or _count(item.get("output_tokens"), 10**9) is None
    ):
        return None
    return {key: item[key] for key in keys}


def _provider_receipt(item: Any) -> dict[str, Any] | None:
    keys = {
        "role", "phase", "final_state", "binding_sha256", "journal_sha256",
        "journal_valid", "synthetic",
    }
    if not isinstance(item, dict) or set(item) != keys or item.get("role") not in ROLES:
        return None
    expected_phase = f"{ROLES.index(item['role']) + 1}/6"
    journal = _digest(item.get("journal_sha256"), nullable=True)
    if (
        item.get("phase") != expected_phase or item.get("final_state") not in FINAL_STATES
        or _digest(item.get("binding_sha256")) is None
        or (item.get("journal_sha256") is not None and journal is None)
        or type(item.get("journal_valid")) is not bool
        or type(item.get("synthetic")) is not bool
    ):
        return None
    return {key: item[key] for key in keys}


def role_evidence(raw: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    role_items = raw.get("role_receipts")
    provider_items = raw.get("provider_request_receipts")
    roles = [_role_receipt(item) for item in role_items] if isinstance(role_items, list) else []
    providers = [_provider_receipt(item) for item in provider_items] if isinstance(provider_items, list) else []
    started = _count(raw.get("provider_requests_started"))
    completed = _count(raw.get("provider_requests_completed"))
    ambiguous = _count(raw.get("provider_requests_ambiguous"))
    input_tokens = _count(raw.get("input_tokens"), 10**9)
    output_tokens = _count(raw.get("output_tokens"), 10**9)
    topology = raw.get("forge_topology")
    plan_digest = _digest(raw.get("role_plan_sha256"), nullable=True)
    providers_valid = isinstance(provider_items, list) and len(provider_items) <= 6 and all(providers)
    safe_providers = providers if providers_valid else []
    prefix_roles = [item["role"] for item in safe_providers] == list(ROLES[:len(safe_providers)])
    dispatch_states = FINAL_STATES - {"not_reached", "capability_consumed", "invalid_or_missing"}
    complete_states = {"response_body_complete", "synthetic_response_complete"}
    derived_started = sum(item["final_state"] in dispatch_states for item in safe_providers)
    derived_completed = sum(item["final_state"] in complete_states for item in safe_providers)
    derived_ambiguous = sum(
        item["final_state"] == "invalid_or_missing"
        or (item["final_state"] in dispatch_states and item["final_state"] not in complete_states)
        for item in safe_providers
    )
    zero_path = started == completed == ambiguous == 0 and not provider_items
    evidenced_path = (
        providers_valid and 1 <= len(safe_providers) <= 6 and prefix_roles
        and started == derived_started and completed == derived_completed
        and ambiguous == derived_ambiguous and completed <= started
    )
    valid = (
        None not in {started, completed, ambiguous, input_tokens, output_tokens}
        and (zero_path or evidenced_path)
    )
    return {
        "forge_topology": topology if topology in TOPOLOGIES else None,
        "role_plan_sha256": plan_digest,
        "role_receipts": roles if isinstance(role_items, list) and len(roles) <= 6 and all(roles) else [],
        "provider_requests_started": started or 0,
        "provider_requests_completed": completed or 0,
        "provider_requests_ambiguous": ambiguous or 0,
        "provider_request_receipts": (
            providers if isinstance(provider_items, list) and len(providers) <= 6 and all(providers) else []
        ),
        "input_tokens": input_tokens or 0,
        "output_tokens": output_tokens or 0,
    }, valid


def spend_evidence(raw: dict[str, Any], evidence: dict[str, Any], valid: bool) -> dict[str, Any]:
    live = raw.get("live_spend") if type(raw.get("live_spend")) is bool else None
    known = (
        raw.get("known_spend_observed") is True
        or evidence["provider_requests_completed"] > 0
        or live is True
    )
    unknown = raw.get("live_spend_unknown") is True or live is None or not valid
    if live is False and known:
        unknown = True
    return {
        "live_spend": None if unknown else known,
        "live_spend_unknown": unknown,
        "known_spend_observed": known,
    }


def bounded_delegate_failure(raw: dict[str, Any], fallback: str) -> dict[str, Any]:
    reason = raw.get("degraded_reason")
    if not isinstance(reason, str) or len(reason) > 120 or not SAFE_REASON.fullmatch(reason):
        reason = fallback
    model_source = raw.get("model_source")
    model_source = model_source if model_source in {"unreported", "provider_reported"} else "unreported"
    actual_model = raw.get("actual_model")
    if not (
        model_source == "provider_reported" and isinstance(actual_model, str)
        and re.fullmatch(r"[A-Za-z0-9._:/-]{1,80}", actual_model)
    ):
        actual_model = None
    evidence, valid = role_evidence(raw)
    return {
        **evidence, **spend_evidence(raw, evidence, valid),
        "schema": DELEGATE_FAILURE_SCHEMA, "degraded_reason": reason,
        "provider": "minimax-oauth", "auth_provider": "minimax-oauth",
        "auth_mode": "oauth", "requested_model": "MiniMax-M3",
        "actual_model": actual_model, "model_source": model_source,
        "hermes_profile": "cstar-hub",
        "live_source_collection": raw.get("live_source_collection") is True,
    }


def bounded_success_evidence(raw: dict[str, Any]) -> dict[str, Any]:
    evidence, valid = role_evidence(raw)
    spend = spend_evidence(raw, evidence, valid)
    roles = evidence["role_receipts"]
    successful_roles = (
        evidence["forge_topology"] in TOPOLOGIES
        and evidence["role_plan_sha256"] is not None
        and len(roles) == evidence["provider_requests_completed"]
        and [item["role"] for item in roles] == list(ROLES[:len(roles)])
        and evidence["provider_requests_started"] == evidence["provider_requests_completed"]
        and evidence["provider_requests_ambiguous"] == 0
        and sum(item["input_tokens"] for item in roles) == evidence["input_tokens"]
        and sum(item["output_tokens"] for item in roles) == evidence["output_tokens"]
    )
    if (not valid or not successful_roles
            or spend["live_spend_unknown"] or spend["live_spend"] is not True):
        raise ValueError("forge_worker_delegate_evidence_invalid")
    return {**evidence, **spend}


def bounded_process_failure(error: BaseException) -> dict[str, Any]:
    """Project child-launch failure without exposing exception text or paths."""
    launch_failed = isinstance(error, OSError) and error.errno in {errno.ENOENT, errno.E2BIG}
    raw = {
        "role_receipts": [], "provider_request_receipts": [],
        "provider_requests_started": 0, "provider_requests_completed": 0,
        "provider_requests_ambiguous": 0, "input_tokens": 0, "output_tokens": 0,
        "live_spend": False if launch_failed else None,
        "live_spend_unknown": not launch_failed, "known_spend_observed": False,
        "live_source_collection": False,
    }
    reason = "forge_worker_delegate_spawn_failed" if launch_failed else "forge_worker_delegate_child_unknown"
    return bounded_delegate_failure(raw, reason)
