"""Retired One Mind compatibility transport policy.

Primary intelligence sampling may still select an explicit host or Synapse
transport. Historical broker state cannot change that choice. Delegated
subagent execution is denied before either transport can actuate.
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
    execution_allowed: bool


def _read_metadata_value(request: Any, key: str) -> str | None:
    metadata = getattr(request, "metadata", None) or {}
    value = metadata.get(key)
    if isinstance(value, str) and value.strip():
        return value.strip().lower()
    return None


def _classify_source_boundary(source: str | None) -> OneMindBoundary:
    normalized = (source or "").strip().lower()
    if any(
        marker in normalized
        for marker in (
            "subagent",
            "sub-agent",
            "host-worker",
            "worker_bridge",
            "runtime:host-worker",
        )
    ):
        return "subagent"
    return "primary"


def resolve_one_mind_boundary(request: Any) -> OneMindBoundary:
    explicit_boundary = _read_metadata_value(request, "one_mind_boundary")
    if explicit_boundary in {"primary", "subagent"}:
        return explicit_boundary

    execution_role = _read_metadata_value(request, "execution_role")
    if execution_role in {"primary", "subagent"}:
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
    del broker_active  # Historical compatibility input; cannot activate a broker.
    current_env = env or {}
    boundary = resolve_one_mind_boundary(request)

    if boundary == "subagent":
        return OneMindDecision(
            boundary=boundary,
            transport_mode="synapse_db",
            reason="retired-subagent-execution-boundary",
            execution_allowed=False,
        )

    transport_mode = getattr(request, "transport_mode", "auto")
    if transport_mode == "host_session":
        return OneMindDecision(boundary, "host_session", "explicit-host-session", True)
    if transport_mode == "synapse_db":
        return OneMindDecision(boundary, "synapse_db", "explicit-synapse-db", True)

    if is_interactive_host_session(current_env):
        return OneMindDecision(boundary, "host_session", "interactive-host-session-direct", True)

    if host_session_active is not None:
        return OneMindDecision(
            boundary,
            "host_session" if host_session_active else "synapse_db",
            "declared-host-session" if host_session_active else "declared-local-session",
            True,
        )

    host_active = is_host_session_active(current_env)
    return OneMindDecision(
        boundary,
        "host_session" if host_active else "synapse_db",
        "ambient-host-session" if host_active else "local-fallback",
        True,
    )
