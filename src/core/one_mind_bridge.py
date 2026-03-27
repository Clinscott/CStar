"""
[Ω] Unified One Mind bridge policy for Python runtimes.
Purpose: Centralize transport selection and delegated-boundary exclusions.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from src.core.host_session import is_host_session_active, is_interactive_host_session


OneMindBoundary = str
ResolvedTransportMode = str


@dataclass(frozen=True)
class OneMindDecision:
    boundary: OneMindBoundary
    transport_mode: ResolvedTransportMode
    reason: str


def _normalize_flag(value: str | None) -> bool | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return None


def _is_interactive_one_mind_broker_active(env: dict[str, str]) -> bool:
    return _normalize_flag(env.get("CORVUS_ONE_MIND_BROKER_ACTIVE")) is True


def _read_metadata_value(request: Any, key: str) -> str | None:
    metadata = getattr(request, "metadata", None) or {}
    value = metadata.get(key)
    if isinstance(value, str) and value.strip():
        return value.strip().lower()
    return None


def _classify_source_boundary(source: str | None) -> OneMindBoundary:
    normalized = (source or "").strip().lower()
    if not normalized:
        return "primary"

    if "autobot" in normalized or "sovereign-worker" in normalized:
        return "autobot"

    if (
        "subagent" in normalized
        or "sub-agent" in normalized
        or "host-worker" in normalized
        or "worker_bridge" in normalized
        or "runtime:host-worker" in normalized
    ):
        return "subagent"

    return "primary"


def resolve_one_mind_boundary(request: Any) -> OneMindBoundary:
    explicit_boundary = _read_metadata_value(request, "one_mind_boundary")
    if explicit_boundary in {"primary", "subagent", "autobot"}:
        return explicit_boundary

    execution_role = _read_metadata_value(request, "execution_role")
    if execution_role in {"primary", "subagent", "autobot"}:
        return execution_role

    caller = getattr(request, "caller", None)
    source = getattr(caller, "source", None) if caller else None
    return _classify_source_boundary(source)


def resolve_one_mind_decision(
    request: Any,
    env: dict[str, str] | None = None,
    *,
    host_session_active: bool | None = None,
    broker_active: bool | None = None,
) -> OneMindDecision:
    current_env = env or {}
    transport_mode = getattr(request, "transport_mode", "auto")
    boundary = resolve_one_mind_boundary(request)

    if transport_mode == "host_session":
        return OneMindDecision(boundary=boundary, transport_mode="host_session", reason="explicit-host-session")

    if transport_mode == "synapse_db":
        return OneMindDecision(boundary=boundary, transport_mode="synapse_db", reason="explicit-synapse-db")

    if boundary in {"subagent", "autobot"}:
        return OneMindDecision(boundary=boundary, transport_mode="synapse_db", reason=f"delegated-{boundary}-boundary")

    if is_interactive_host_session(current_env):
        if broker_active is True or _is_interactive_one_mind_broker_active(current_env):
            return OneMindDecision(boundary=boundary, transport_mode="synapse_db", reason="interactive-host-session-bus")
        return OneMindDecision(boundary=boundary, transport_mode="host_session", reason="interactive-host-session-direct")

    if host_session_active is not None:
        return OneMindDecision(
            boundary=boundary,
            transport_mode="host_session" if host_session_active else "synapse_db",
            reason="declared-host-session" if host_session_active else "declared-local-session",
        )

    return OneMindDecision(
        boundary=boundary,
        transport_mode="host_session" if is_host_session_active(current_env) else "synapse_db",
        reason="ambient-host-session" if is_host_session_active(current_env) else "local-fallback",
    )
